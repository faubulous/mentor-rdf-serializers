import { IToken, RdfSyntax, RdfToken, TrigLexer } from '@faubulous/mentor-rdf-parsers';
import { TokenFormatterBase, BaseFormatterContext } from '../token-formatter-base';
import { ITokenFormatter } from '../token-formatter.interface';
import { SerializationResult } from '../serialization-result';
import { TokenSerializerOptions } from '../token-serializer';
import { TurtleFormatterOptions } from './turtle-formatter';

// ============================================================================
// Options & Context
// ============================================================================

/**
 * TriG-specific formatting options.
 */
export interface TrigFormatterOptions extends TurtleFormatterOptions {
    /**
     * Whether to put opening graph braces on the same line as the graph IRI.
     * Default: true
     */
    sameBraceLine?: boolean;

    /**
     * Whether to include the GRAPH keyword before named graphs.
     * Default: false
     */
    useGraphKeyword?: boolean;
}

/**
 * Internal formatting context for TriG.
 */
interface TrigFormatterContext extends BaseFormatterContext {
    opts: Required<TrigFormatterOptions>;
    /** Whether we are currently inside a graph block. */
    inGraph: boolean;
    /** Whether at least one @prefix/PREFIX directive was seen in this document. */
    sawPrefixDefinition: boolean;
    /** Whether we still need to insert the prefix→first-subject blank line. */
    pendingPrefixToSubjectBlankLine: boolean;
    /** Whether the current directive token was a Turtle-style TTL_PREFIX/TTL_BASE. */
    currentPrefixIsTurtle: boolean;
    /** Whether the next PERIOD token should be suppressed (Turtle→SPARQL conversion). */
    skipNextPrefixPeriod: boolean;
}

// ============================================================================
// TrigFormatter
// ============================================================================

/**
 * Formatter for TriG (RDF datasets with named graphs).
 *
 * TriG extends Turtle to support named graphs with `{ }` graph blocks.
 * Uses the scope stack for both graph braces (curly) and blank node
 * brackets, replacing the manual `graphDepth` / `blankNodeDepth` counters.
 *
 * @see https://www.w3.org/TR/rdf12-trig/
 */
export class TrigFormatter
    extends TokenFormatterBase<TrigFormatterContext, TrigFormatterOptions>
    implements ITokenFormatter {
    readonly syntax: RdfSyntax = RdfSyntax.TriG;
    private lexer = new TrigLexer();

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Formats a TriG document.
     */
    formatFromText(input: string, options?: TrigFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const result = this.lexer.tokenize(input);

        if (result.errors.length > 0) {
            return { output: input };
        }

        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];
        return this.formatTokens(result.tokens, opts, comments);
    }

    /**
     * Formats from already-parsed tokens.
     */
    formatFromTokens(tokens: IToken[], options?: TrigFormatterOptions & TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);
        return this.formatTokens(tokens, opts);
    }

    // Backwards-compatible alias
    format(input: string, options?: TrigFormatterOptions): SerializationResult {
        return this.formatFromText(input, options);
    }

    // ========================================================================
    // BaseTokenFormatter implementations
    // ========================================================================

    protected getOptions(options?: TrigFormatterOptions): Required<TrigFormatterOptions> {
        const base = this.mergeBaseOptions(options);
        return {
            ...base,
            directiveStyle: options?.directiveStyle ?? undefined as any,
            newlineAfterSubject: options?.newlineAfterSubject ?? false,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            sameBraceLine: options?.sameBraceLine ?? true,
            useGraphKeyword: options?.useGraphKeyword ?? false,
        };
    }

    protected createContext(opts: Required<TrigFormatterOptions>): TrigFormatterContext {
        return {
            ...this.createBaseContext(),
            opts,
            inGraph: false,
            sawPrefixDefinition: false,
            pendingPrefixToSubjectBlankLine: false,
            currentPrefixIsTurtle: false,
            skipNextPrefixPeriod: false,
        };
    }

    protected formatTokenValue(token: IToken, opts: Required<TrigFormatterOptions>): string {
        const tokenType = token.tokenType;

        // Tokens marked as lowercase-only (true, false, a) stay lowercase
        if (this.isLowercaseOnly(token)) {
            return token.image.toLowerCase();
        }

        // TTL_PREFIX / TTL_BASE  — source is Turtle-style (@prefix / @base)
        if (tokenType === RdfToken.TTL_PREFIX || tokenType === RdfToken.TTL_BASE) {
            if (opts.directiveStyle === 'sparql-lowercase') return token.image.toLowerCase().replace('@', '');
            if (opts.directiveStyle === 'sparql-uppercase') return token.image.toUpperCase().replace('@', '');
            return token.image.toLowerCase(); // 'turtle' or undefined → preserve
        }

        // PREFIX / BASE  — source is SPARQL-style
        if (tokenType === RdfToken.PREFIX || tokenType === RdfToken.BASE) {
            if (opts.directiveStyle === 'turtle') return '@' + token.image.toLowerCase();
            if (opts.directiveStyle === 'sparql-lowercase') return token.image.toLowerCase();
            return token.image.toUpperCase(); // 'sparql-uppercase' or undefined → preserve as uppercase
        }

        // GRAPH keyword is always uppercased
        if (tokenType === RdfToken.GRAPH) {
            return token.image.toUpperCase();
        }

        return token.image;
    }

    // ========================================================================
    // Token handlers
    // ========================================================================

    /**
     * Handles comment tokens.
     */
    private handleTrigComment(ctx: TrigFormatterContext, comment: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine) {
                const lineGap = comment.startLine - ctx.lastNonWsToken.endLine;
                const indentText = this.getIndent(ctx.indentLevel, ind);
                if (lineGap > 1) {
                    // Preserve blank line between previous token and comment.
                    if (ctx.lastWasNewline) {
                        this.addPart(ctx, le + indentText, le, true);
                    } else {
                        this.addPart(ctx, le + le + indentText, le, true);
                    }
                } else {
                    this.addPart(ctx, le + indentText, le, true);
                }
                ctx.lastWasNewline = true;
            } else {
                this.addPart(ctx, ' ', le);
            }
        }
        this.addPart(ctx, comment.image, le);
        ctx.needsNewline = true;
        ctx.needsSpace = false;
        ctx.lastWasComment = true;
        ctx.lastNonWsToken = comment;
        ctx.lastToken = comment;
        ctx.lastWasNewline = false;
    }

    /**
     * Handles opening curly brace (graph start).
     * Uses the scope stack to track graph nesting.
     */
    private handleTrigOpenCurly(ctx: TrigFormatterContext): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (ctx.needsNewline && !ctx.opts.sameBraceLine) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }

        this.addPart(ctx, '{', le);
        this.pushScope(ctx, 'curly', false, false);
        ctx.inGraph = true;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
    }

    /**
     * Handles closing curly brace (graph end).
     * Pops the curly scope and checks if we're still inside a graph.
     */
    private handleTrigCloseCurly(ctx: TrigFormatterContext): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        const scope = this.currentScope(ctx);
        if (scope?.type === 'curly') {
            this.popScope(ctx);
        }

        if (ctx.opts.prettyPrint) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
        }

        this.addPart(ctx, '}', le);
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        // Still inside a graph if there are curly scopes remaining
        ctx.inGraph = ctx.scopeStack.some(s => s.type === 'curly');
    }

    /**
     * Handles opening bracket tokens ([ for blank nodes, etc.).
     */
    private handleTrigOpenBracket(ctx: TrigFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (ctx.needsNewline) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }

        this.addPart(ctx, token.image, le);

        if (token.tokenType === RdfToken.LBRACKET) {
            this.pushScope(ctx, 'bracket', false, false);
            ctx.needsNewline = ctx.opts.prettyPrint;
        }

        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles closing bracket tokens (] for blank nodes, etc.).
     */
    private handleTrigCloseBracket(ctx: TrigFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (token.tokenType === RdfToken.RBRACKET) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'bracket') {
                this.popScope(ctx);
                if (ctx.opts.prettyPrint) {
                    // Align the closing ']' with the predicate that
                    // introduced the blank node property list. The
                    // scope's indentLevel is the indentation at the
                    // time '[' was seen (typically the subject line),
                    // so we add one extra indent level to reach the
                    // predicate indentation.
                    const baseIndentLevel = scope.indentLevel + 1;
                    this.addPart(ctx, le + this.getIndent(baseIndentLevel, ind), le, true);
                    ctx.lastWasNewline = true;
                }
            }
        }

        this.addPart(ctx, token.image, le);
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles period (statement terminator).
     */
    private handleTrigPeriod(ctx: TrigFormatterContext): void {
        const le = ctx.opts.lineEnd;
        if (ctx.opts.spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, '.', le);
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = true;
        ctx.lastWasNewline = false;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
        ctx.inlineStatement = false;
    }

    /**
     * Handles semicolon (predicate separator).
     * Always adds extra indent for continuation, matching Turtle behaviour.
     */
    private handleTrigSemicolon(ctx: TrigFormatterContext): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (ctx.opts.spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, ';', le);

        if (ctx.inlineStatement) {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else if (ctx.opts.prettyPrint && ctx.indentLevel > 0) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind) + ind, le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else if (ctx.opts.prettyPrint) {
            this.addPart(ctx, le + ind, le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else {
            ctx.needsSpace = true;
        }

        ctx.triplePosition = 1;
    }

    /**
     * Handles comma (object separator).
     */
    private handleTrigComma(ctx: TrigFormatterContext): void {
        const le = ctx.opts.lineEnd;
        this.addPart(ctx, ',', le);
        ctx.needsSpace = true;
    }

    /**
     * Handles PREFIX/BASE IRI completion.
     */
    private handleTrigPrefixIri(ctx: TrigFormatterContext, value: string): void {
        const le = ctx.opts.lineEnd;
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, value, le);

        // Handle trailing dot for style conversions:
        // SPARQL → Turtle: inject " ." (no PERIOD token will follow in the stream)
        if (ctx.opts.directiveStyle === 'turtle' && !ctx.currentPrefixIsTurtle) {
            this.addPart(ctx, ' .', le);
        }
        // Turtle → SPARQL: suppress the upcoming PERIOD token
        if ((ctx.opts.directiveStyle === 'sparql-lowercase' || ctx.opts.directiveStyle === 'sparql-uppercase')
            && ctx.currentPrefixIsTurtle) {
            ctx.skipNextPrefixPeriod = true;
        }

        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
    }

    /**
     * Handles token spacing.
     * TriG additionally suppresses space after opening curly braces.
     */
    private handleTrigTokenSpacing(ctx: TrigFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        const isDatatypeContext = token.tokenType === RdfToken.DCARET ||
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const isLangTag = token.tokenType === RdfToken.LANGTAG;

        if (ctx.needsNewline && !isDatatypeContext && !isLangTag) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && !isDatatypeContext && !isLangTag) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken) &&
                ctx.lastNonWsToken.tokenType !== RdfToken.LCURLY) {
                this.addPart(ctx, ' ', le);
            }
            ctx.lastWasNewline = false;
        } else {
            ctx.lastWasNewline = false;
        }
    }

    // ========================================================================
    // Main formatting loop
    // ========================================================================

    private formatTokens(
        tokens: IToken[],
        opts: Required<TrigFormatterOptions>,
        comments: IToken[] = []
    ): SerializationResult {
        const ctx = this.createContext(opts);
        const le = opts.lineEnd;
        const sortedComments = [...comments].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
        let commentIndex = 0;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Insert comments that appear before this token
            while (commentIndex < sortedComments.length) {
                const comment = sortedComments[commentIndex];
                if ((comment.startOffset ?? 0) < (token.startOffset ?? 0)) {
                    this.handleTrigComment(ctx, comment);
                    commentIndex++;
                } else {
                    break;
                }
            }

            // Skip whitespace tokens
            if (token.tokenType === RdfToken.WS) {
                ctx.lastToken = token;
                continue;
            }

            // Handle comment tokens in stream
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleTrigComment(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            const value = this.formatTokenValue(token, opts);

            // Track prefix declarations
            if (token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.PREFIX ||
                token.tokenType === RdfToken.TTL_BASE || token.tokenType === RdfToken.BASE) {
                ctx.inPrefix = true;
                ctx.currentPrefixIsTurtle =
                    token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.TTL_BASE;
            }

            if (token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.PREFIX) {
                ctx.sawPrefixDefinition = true;
                ctx.pendingPrefixToSubjectBlankLine = true;
            }

            // Handle graph braces (must come before generic bracket handling)
            if (token.tokenType === RdfToken.LCURLY) {
                this.handleTrigOpenCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                this.handleTrigCloseCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle structural tokens
            if (this.isOpeningBracket(token)) {
                this.handleTrigOpenBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (this.isClosingBracket(token)) {
                this.handleTrigCloseBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                if (ctx.skipNextPrefixPeriod) {
                    ctx.skipNextPrefixPeriod = false;
                    ctx.lastToken = token;
                    continue;
                }
                this.handleTrigPeriod(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.SEMICOLON) {
                this.handleTrigSemicolon(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                this.handleTrigComma(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle PREFIX/BASE IRI completion
            if (ctx.inPrefix && (token.tokenType === RdfToken.IRIREF || token.tokenType === RdfToken.IRIREF_ABS)) {
                this.handleTrigPrefixIri(ctx, value);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle triple position tracking
            if (this.isTermToken(token) && ctx.triplePosition === 0 && !ctx.inPrefix) {
                if (
                    ctx.opts.prettyPrint &&
                    ctx.opts.blankLinesBetweenSubjects &&
                    ctx.lastSubject === null &&
                    ctx.sawPrefixDefinition &&
                    ctx.pendingPrefixToSubjectBlankLine
                ) {
                    // Insert a blank line between the final prefix definition and the
                    // first root-level term (graph label or subject).
                    this.addPart(ctx, le, le, true);
                    ctx.pendingPrefixToSubjectBlankLine = false;
                }

                if (ctx.opts.blankLinesBetweenSubjects && ctx.lastSubject !== null && token.image !== ctx.lastSubject) {
                    if (!ctx.needsNewline && ctx.parts.length > 0) {
                        this.addPart(ctx, le, le, true);
                    }
                }
                ctx.lastSubject = token.image;

                this.detectInlineStatement(ctx, tokens, i, ctx.opts.indent, ctx.opts.maxLineWidth);

                ctx.triplePosition++;
            } else if (this.isTermToken(token) && !ctx.inPrefix) {
                ctx.triplePosition++;
                if (ctx.triplePosition > 2) ctx.triplePosition = 2;
            }

            // Handle spacing
            this.handleTrigTokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value, le);
            ctx.needsSpace = true;
            ctx.lastToken = token;
            ctx.lastNonWsToken = token;
        }

        // Add trailing comments
        while (commentIndex < sortedComments.length) {
            this.handleTrigComment(ctx, sortedComments[commentIndex]);
            commentIndex++;
        }

        return { output: ctx.parts.join('').trim() };
    }
}
