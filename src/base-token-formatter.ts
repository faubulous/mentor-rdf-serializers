import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken } from '@faubulous/mentor-rdf-parsers';
import type { SerializerOptions, SerializationResult } from './types.js';
import { mergeOptions } from './utils.js';

// ============================================================================
// Token Annotation Types
// ============================================================================

/**
 * Metadata attached to each token during the analysis pass.
 * This captures source-layout information for the emit pass.
 */
export interface TokenAnnotation {
    /** Source had a newline between this token and the previous non-WS token. */
    sourceNewlineBefore: boolean;
    /** Source had a blank line (2+ newlines) between this token and the previous non-WS token. */
    sourceBlankLineBefore: boolean;
    /** Number of source newlines between this token and the previous non-WS token. */
    sourceLineGap: number;
}

/**
 * A token together with its analysis annotation.
 */
export interface AnnotatedToken {
    token: IToken;
    annotation: TokenAnnotation;
}

// ============================================================================
// Scope Stack
// ============================================================================

/**
 * Scope entry representing a nesting level.
 */
export interface Scope {
    /** Type of scope. */
    type: 'curly' | 'bracket' | 'paren';
    /** Whether the block is formatted inline (no line breaks). */
    isInline: boolean;
    /** Whether the block spans multiple source lines. */
    isMultiLine: boolean;
    /** The indent level when this scope was entered. */
    indentLevel: number;
}

// ============================================================================
// Base Formatting Context
// ============================================================================

/**
 * Base formatting context with fields shared by all token-based formatters.
 * Subclasses extend this to add format-specific state.
 */
export interface BaseFormatterContext {
    /** Accumulated output parts. */
    parts: string[];
    /** Current indent nesting level. */
    indentLevel: number;
    /** Current line length (for wrapping). */
    currentLineLength: number;
    /** The scope stack. */
    scopeStack: Scope[];

    // ── Spacing flags ──────────────────────────────────────────────
    /** A newline should be emitted before the next token. */
    needsNewline: boolean;
    /** A blank line should be emitted before the next token. */
    needsBlankLine: boolean;
    /** A space should be emitted before the next token. */
    needsSpace: boolean;
    /** Whether the pending newline originated from source positions. */
    sourceNewline: boolean;

    // ── Token tracking ─────────────────────────────────────────────
    lastToken: IToken | null;
    lastNonWsToken: IToken | null;
    lastWasNewline: boolean;
    lastWasComment: boolean;

    // ── Turtle/SPARQL common ──────────────────────────────────────
    /** Whether we are inside a prefix/base declaration. */
    inPrefix: boolean;
    /** Triple position counter (0=subject, 1=predicate, 2=object). */
    triplePosition: number;
    /** Last-seen subject image (for blank line insertion). */
    lastSubject: string | null;

    // ── Inline statement detection ────────────────────────────────
    /** Whether the current statement should be rendered on a single line. */
    inlineStatement: boolean;
}

// ============================================================================
// Base Options
// ============================================================================

/**
 * Options common to all token-based formatters.
 */
export interface BaseFormatterOptions extends SerializerOptions {
    /** Add a space before punctuation (. and ;). Default: false. */
    spaceBeforePunctuation?: boolean;
}

// ============================================================================
// Token Annotator (Pass 1)
// ============================================================================

/**
 * Annotates a token array with source-layout metadata.
 *
 * This is the "analysis pass" that records where the source had newlines
 * and blank lines.  The emit pass can then decide whether to honour them.
 *
 * @param tokens  The main token stream (no WS / comment groups).
 * @param comments  Comment tokens extracted from lexer groups.
 * @returns  An array of annotated tokens (comments merged in order) with
 *           annotations describing source-layout between adjacent tokens.
 */
export function annotateTokens(
    tokens: IToken[],
    comments: IToken[] = [],
): AnnotatedToken[] {
    // Merge tokens and comments in source order.
    const all = [
        ...tokens.map(t => ({ token: t, isComment: false })),
        ...comments.map(t => ({ token: t, isComment: true })),
    ].sort((a, b) => (a.token.startOffset ?? 0) - (b.token.startOffset ?? 0));

    const result: AnnotatedToken[] = [];
    let lastNonWs: IToken | null = null;

    for (const { token } of all) {
        // Skip pure whitespace tokens.
        if (token.tokenType === RdfToken.WS) {
            continue;
        }

        let sourceLineGap = 0;
        if (lastNonWs && token.startLine !== undefined && lastNonWs.endLine !== undefined) {
            sourceLineGap = token.startLine - lastNonWs.endLine;
        }

        result.push({
            token,
            annotation: {
                sourceNewlineBefore: sourceLineGap >= 1,
                sourceBlankLineBefore: sourceLineGap > 1,
                sourceLineGap,
            },
        });

        lastNonWs = token;
    }

    return result;
}

// ============================================================================
// BaseTokenFormatter
// ============================================================================

/**
 * Abstract base class for all token-based RDF/SPARQL formatters.
 *
 * Provides:
 * - Two-pass architecture: annotateTokens (analysis) + emit (subclass).
 * - A unified scope stack for { }, [ ], ( ).
 * - Output building helpers (addPart, getIndent, line length tracking).
 * - Shared handlers for brackets, punctuation, comments, spacing.
 * - Source newline / blank line preservation helpers.
 *
 * Subclasses override hooks (e.g. handleOpenBrace, handleMajorClause) to add
 * syntax-specific behaviour.
 */
export abstract class BaseTokenFormatter<
    TContext extends BaseFormatterContext = BaseFormatterContext,
    TOptions extends BaseFormatterOptions = BaseFormatterOptions,
> {
    // ════════════════════════════════════════════════════════════════
    // Abstract / overridable hooks
    // ════════════════════════════════════════════════════════════════

    /** Merge user options with defaults.  Must be implemented by subclasses. */
    protected abstract getOptions(options?: TOptions): Required<TOptions>;

    /** Create the initial context.  Subclasses extend the base context. */
    protected abstract createContext(opts: Required<TOptions>): TContext;

    /**
     * Format a token's image (e.g. keyword casing).
     * Default: return unchanged.
     */
    protected formatTokenValue(token: IToken, _opts: Required<TOptions>): string {
        return token.image;
    }

    // ════════════════════════════════════════════════════════════════
    // Token metadata helpers (use chevrotain TokenMetadata)
    // ════════════════════════════════════════════════════════════════

    protected isKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isKeyword === true;
    }

    protected isLowercaseOnly(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isLowercaseOnly === true;
    }

    protected isTermToken(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isTerm === true;
    }

    protected isFunctionKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isFunction === true;
    }

    protected isMajorClauseKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isMajorClause === true;
    }

    protected isNewlineKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isNewlineKeyword === true;
    }

    protected isOpeningBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.LBRACKET ||
               token.tokenType === RdfToken.LPARENT ||
               token.tokenType === RdfToken.OPEN_ANNOTATION ||
               token.tokenType === RdfToken.OPEN_REIFIED_TRIPLE ||
               token.tokenType === RdfToken.OPEN_TRIPLE_TERM;
    }

    protected isClosingBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.RBRACKET ||
               token.tokenType === RdfToken.RPARENT ||
               token.tokenType === RdfToken.CLOSE_ANNOTATION ||
               token.tokenType === RdfToken.CLOSE_REIFIED_TRIPLE ||
               token.tokenType === RdfToken.CLOSE_TRIPLE_TERM;
    }

    // ════════════════════════════════════════════════════════════════
    // Scope stack helpers
    // ════════════════════════════════════════════════════════════════

    /** Push a new scope. */
    protected pushScope(ctx: TContext, type: Scope['type'], isInline: boolean, isMultiLine: boolean): void {
        ctx.scopeStack.push({
            type,
            isInline,
            isMultiLine,
            indentLevel: ctx.indentLevel,
        });
        ctx.indentLevel++;
    }

    /** Pop the current scope. Returns it, or undefined if the stack is empty. */
    protected popScope(ctx: TContext): Scope | undefined {
        const scope = ctx.scopeStack.pop();
        if (scope) {
            ctx.indentLevel = scope.indentLevel;
        }
        return scope;
    }

    /** The current innermost scope, or undefined. */
    protected currentScope(ctx: TContext): Scope | undefined {
        return ctx.scopeStack[ctx.scopeStack.length - 1];
    }

    /** Whether we are inside a bracket scope (blank-node property list). */
    protected inBracketScope(ctx: TContext): boolean {
        return ctx.scopeStack.some(s => s.type === 'bracket');
    }

    // ════════════════════════════════════════════════════════════════
    // Output helpers
    // ════════════════════════════════════════════════════════════════

    /** Append text to the output and track line length. */
    protected addPart(ctx: TContext, text: string, lineEnd: string, forceNewline = false): void {
        if (forceNewline || text === lineEnd || text.includes(lineEnd)) {
            ctx.parts.push(text);
            const lines = text.split(lineEnd);
            ctx.currentLineLength = lines[lines.length - 1].length;
        } else {
            ctx.parts.push(text);
            ctx.currentLineLength += text.length;
        }
    }

    /** Get indentation string for a level. */
    protected getIndent(level: number, indent: string): string {
        return indent.repeat(level);
    }

    /** Check if a wrap is needed. */
    protected shouldWrap(ctx: TContext, nextLength: number, maxLineWidth: number): boolean {
        return maxLineWidth > 0 && ctx.currentLineLength + nextLength > maxLineWidth;
    }

    // ════════════════════════════════════════════════════════════════
    // Source-layout preservation helpers
    // ════════════════════════════════════════════════════════════════

    /**
     * Apply the source-layout annotation to the context flags.
     *
     * Call this early in the per-token loop, before any formatting decisions.
     * It sets `needsNewline`, `needsBlankLine`, and `sourceNewline` based on
     * what the source had, but only if the formatter hasn't already decided
     * on something stronger.
     */
    protected applySourceLayout(ctx: TContext, ann: TokenAnnotation): void {
        if (ann.sourceBlankLineBefore) {
            ctx.needsBlankLine = true;
            ctx.needsNewline = true;
            ctx.sourceNewline = true;
        } else if (ann.sourceNewlineBefore && !ctx.lastWasNewline) {
            ctx.needsNewline = true;
            ctx.sourceNewline = true;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Inline statement detection
    // ════════════════════════════════════════════════════════════════

    /**
     * Scans forward from `startIndex` to the statement-terminating period
     * (at nesting depth 0) and determines whether the source had the
     * entire statement on a single line.
     *
     * @returns  The approximate inline character-length of the statement,
     *           or `-1` if the source contained newlines within the statement
     *           (meaning the author intended multi-line layout).
     *
     * Nested brackets `[]` and parentheses `()` are traversed but their
     * tokens are counted towards the total length.  Comments force multi-line.
     */
    protected calculateStatementLength(tokens: IToken[], startIndex: number): number {
        let length = 0;
        let depth = 0;
        let lastEndLine: number | undefined;
        let count = 0;

        for (let i = startIndex; i < tokens.length; i++) {
            const t = tokens[i];

            // Skip whitespace tokens.
            if (t.tokenType === RdfToken.WS) continue;

            // A comment anywhere in the statement forces multi-line.
            if (t.tokenType === RdfToken.COMMENT) return -1;

            // Check whether a closing delimiter closes an *enclosing* scope
            // (i.e. we started inside a bracket/paren/curly block).
            // Stop the scan without including the closer in the newline check.
            const isCloser = t.tokenType === RdfToken.RBRACKET ||
                t.tokenType === RdfToken.RPARENT ||
                t.tokenType === RdfToken.RCURLY;

            if (isCloser) {
                depth--;
                if (depth < 0) {
                    // The closer belongs to the enclosing scope — return
                    // the statement length accumulated so far.
                    return length + Math.max(0, count - 1);
                }
            }

            // If the source had a newline between consecutive non-WS tokens
            // the author explicitly broke the statement → multi-line.
            if (lastEndLine !== undefined && t.startLine !== undefined) {
                if (t.startLine > lastEndLine) return -1;
            }

            // Track opening delimiters.
            if (t.tokenType === RdfToken.LBRACKET || t.tokenType === RdfToken.LPARENT ||
                t.tokenType === RdfToken.LCURLY) {
                depth++;
            }

            // Accumulate length.
            length += t.image.length;
            count++;

            lastEndLine = t.endLine;

            // A period at the outermost level terminates the statement.
            if (t.tokenType === RdfToken.PERIOD && depth <= 0) {
                // Add approximate inter-token spaces (count - 1),
                // then subtract 1 for the period which has no leading space.
                return length + Math.max(0, count - 2);
            }
        }

        // No period found (e.g. inside a WHERE block in SPARQL).
        // Return the cumulative length so far.
        return length + Math.max(0, count - 1);
    }

    /**
     * Evaluates whether the current statement (starting at `startIndex`)
     * should be rendered inline, and sets `ctx.inlineStatement` accordingly.
     *
     * Call this when a subject is detected (triplePosition === 0).
     *
     * @param ctx         The formatting context.
     * @param tokens      The full token stream.
     * @param startIndex  Index of the subject token.
     * @param indent      The indent string for one level.
     * @param maxLineWidth  The configured maximum line width (0 = no limit).
     */
    protected detectInlineStatement(
        ctx: TContext,
        tokens: IToken[],
        startIndex: number,
        indent: string,
        maxLineWidth: number,
    ): void {
        const stmtLen = this.calculateStatementLength(tokens, startIndex);

        if (stmtLen < 0) {
            // Source had newlines → force multi-line.
            ctx.inlineStatement = false;
            return;
        }

        if (maxLineWidth <= 0) {
            // No width limit – keep inline since source was inline.
            ctx.inlineStatement = true;
            return;
        }

        // Account for the current indent.
        const indentWidth = ctx.indentLevel * indent.length;
        ctx.inlineStatement = indentWidth + stmtLen <= maxLineWidth;
    }

    // ════════════════════════════════════════════════════════════════
    // Shared token handlers
    // ════════════════════════════════════════════════════════════════

    /**
     * Handles an opening square bracket `[` (blank-node property list).
     *
     * Pushes a 'bracket' scope, increments indent.
     */
    protected handleOpenBracket(ctx: TContext, token: IToken, lineEnd: string, indent: string, prettyPrint: boolean): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, lineEnd + this.getIndent(ctx.indentLevel, indent), lineEnd, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', lineEnd);
        }

        this.addPart(ctx, token.image, lineEnd);
        this.pushScope(ctx, 'bracket', false, false);
        ctx.needsNewline = prettyPrint;
        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles a closing square bracket `]`.
     *
     * Pops the 'bracket' scope and places `]` on its own line at the outer indent.
     */
    protected handleCloseBracket(ctx: TContext, token: IToken, lineEnd: string, indent: string, prettyPrint: boolean): void {
        // Pop any trailing newline+indent that a semicolon may have emitted.
        if (ctx.lastWasNewline && ctx.parts.length > 0) {
            const last = ctx.parts[ctx.parts.length - 1];
            if (last.includes(lineEnd) || /^\s+$/.test(last)) {
                ctx.parts.pop();
            }
        }

        this.popScope(ctx);

        if (prettyPrint) {
            this.addPart(ctx, lineEnd + this.getIndent(ctx.indentLevel, indent), lineEnd, true);
        }

        this.addPart(ctx, token.image, lineEnd);
        ctx.lastWasNewline = false;
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles a semicolon `;` (predicate-object list separator).
     *
     * Inside bracket scopes: continues at the same indent.
     * Outside: adds one extra indent for predicate continuations.
     */
    protected handleSemicolon(
        ctx: TContext,
        lineEnd: string,
        indent: string,
        prettyPrint: boolean,
        spaceBeforePunctuation: boolean,
    ): void {
        if (spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', lineEnd);
        }
        this.addPart(ctx, ';', lineEnd);

        if (prettyPrint && ctx.indentLevel > 0) {
            const extra = this.inBracketScope(ctx) ? '' : indent;
            this.addPart(ctx, lineEnd + this.getIndent(ctx.indentLevel, indent) + extra, lineEnd, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else if (prettyPrint) {
            this.addPart(ctx, lineEnd + indent, lineEnd, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else {
            ctx.needsSpace = true;
        }

        ctx.triplePosition = 1;
    }

    /**
     * Handles a period `.` (statement terminator).
     */
    protected handlePeriod(
        ctx: TContext,
        lineEnd: string,
        prettyPrint: boolean,
        spaceBeforePunctuation: boolean,
    ): void {
        if (spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', lineEnd);
        }
        this.addPart(ctx, '.', lineEnd);
        ctx.needsNewline = prettyPrint;
        ctx.needsSpace = true;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
    }

    /**
     * Handles a comma `,` (object-list separator).
     */
    protected handleComma(ctx: TContext, lineEnd: string): void {
        this.addPart(ctx, ',', lineEnd);
        ctx.needsSpace = true;
    }

    /**
     * Handles a comment token.
     */
    protected handleComment(ctx: TContext, comment: IToken, lineEnd: string, indent: string): void {
        if (ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine) {
                const lineGap = comment.startLine - ctx.lastNonWsToken.endLine;
                if (lineGap > 1) {
                    // Blank line before comment.
                    if (!ctx.lastWasNewline) {
                        this.addPart(ctx, lineEnd, lineEnd, true);
                    }
                    this.addPart(ctx, lineEnd, lineEnd, true);
                    this.addPart(ctx, this.getIndent(ctx.indentLevel, indent), lineEnd);
                } else {
                    this.addPart(ctx, lineEnd + this.getIndent(ctx.indentLevel, indent), lineEnd, true);
                }
                ctx.lastWasNewline = true;
            } else {
                this.addPart(ctx, ' ', lineEnd);
            }
        }
        this.addPart(ctx, comment.image, lineEnd);
        ctx.lastWasNewline = false;
        ctx.needsNewline = true;
        ctx.needsSpace = false;
        ctx.lastWasComment = true;
        ctx.lastNonWsToken = comment;
    }

    /**
     * Handles generic token spacing (newlines and spaces before a token).
     *
     * This is the "default" spacing logic.  Subclasses may override or call
     * super for specific token types (e.g. datatype, lang tags, function calls).
     */
    protected handleTokenSpacing(ctx: TContext, token: IToken, lineEnd: string, indent: string): void {
        const isDatatypeContext =
            token.tokenType === RdfToken.DCARET ||
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const isLangTag = token.tokenType === RdfToken.LANGTAG;

        if (ctx.needsNewline && !isDatatypeContext && !isLangTag) {
            if (!ctx.lastWasNewline) {
                this.addPart(ctx, lineEnd, lineEnd, true);
            }
            if (ctx.needsBlankLine) {
                this.addPart(ctx, lineEnd, lineEnd, true);
                ctx.needsBlankLine = false;
            }
            this.addPart(ctx, this.getIndent(ctx.indentLevel, indent), lineEnd);
            ctx.lastWasNewline = false;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && !isDatatypeContext && !isLangTag) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                this.addPart(ctx, ' ', lineEnd);
            }
            ctx.lastWasNewline = false;
        } else {
            ctx.lastWasNewline = false;
        }

        if (isDatatypeContext || isLangTag) {
            ctx.needsNewline = false;
            ctx.needsBlankLine = false;
        }

        ctx.sourceNewline = false;
    }

    /**
     * Handles prefix/base IRI completion.
     */
    protected handlePrefixIri(ctx: TContext, value: string, lineEnd: string, indent: string, prettyPrint: boolean): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, lineEnd + this.getIndent(ctx.indentLevel, indent), lineEnd, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                this.addPart(ctx, ' ', lineEnd);
            }
        }
        this.addPart(ctx, value, lineEnd);
        ctx.needsSpace = false;
        ctx.needsNewline = prettyPrint;
        ctx.inPrefix = false;
    }

    // ════════════════════════════════════════════════════════════════
    // Multi-line parenthesis helpers
    // ════════════════════════════════════════════════════════════════

    /**
     * Checks if a parenthesis block (starting at `(` at index) contains
     * source newlines between the open and close parens.
     */
    protected isParenBlockMultiLine(tokens: IToken[], openIndex: number): boolean {
        const openToken = tokens[openIndex];
        let depth = 1;
        for (let i = openIndex + 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.tokenType === RdfToken.WS) continue;
            if (t.tokenType === RdfToken.LPARENT) depth++;
            else if (t.tokenType === RdfToken.RPARENT) {
                depth--;
                if (depth === 0) {
                    if (openToken.startLine !== undefined && t.startLine !== undefined) {
                        return t.startLine > openToken.startLine;
                    }
                    return false;
                }
            }
        }
        return false;
    }

    // ════════════════════════════════════════════════════════════════
    // Utility: default base context factory
    // ════════════════════════════════════════════════════════════════

    /**
     * Returns a base context with all shared fields initialised.
     * Subclasses call this and spread into their own context literal.
     */
    protected createBaseContext(): Omit<BaseFormatterContext, never> {
        return {
            parts: [],
            indentLevel: 0,
            currentLineLength: 0,
            scopeStack: [],
            needsNewline: false,
            needsBlankLine: false,
            needsSpace: false,
            sourceNewline: false,
            lastToken: null,
            lastNonWsToken: null,
            lastWasNewline: false,
            lastWasComment: false,
            inPrefix: false,
            triplePosition: 0,
            lastSubject: null,
            inlineStatement: false,
        };
    }

    /**
     * Helper: merges base options.
     */
    protected mergeBaseOptions(options?: SerializerOptions): Required<SerializerOptions> {
        return mergeOptions(options);
    }
}
