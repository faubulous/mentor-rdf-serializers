import { IToken, TokenType, RdfToken, SparqlLexer } from '@faubulous/mentor-rdf-parsers';
import { TokenFormatterBase, BaseFormatterContext, BaseFormatterOptions } from '../token-formatter-base';
import { SerializationResult } from '../serialization-result';
import { TokenSerializerOptions } from '../token-serializer';
import { ISparqlFormatter } from './sparql-formatter.interface';
import { formatTemplate } from '../triplate-template-format';

/**
 * SPARQL-specific formatting options.
 */
export interface SparqlFormatterOptions extends BaseFormatterOptions {
    /**
     * Whether to uppercase SPARQL keywords (SELECT, WHERE, etc.).
     * Default: true
     */
    uppercaseKeywords?: boolean;

    /**
     * Whether to lowercase SPARQL keywords.
     * Default: false (takes precedence if both are true)
     */
    lowercaseKeywords?: boolean;

    /**
     * Whether to align WHERE clause patterns.
     * When true, triple patterns within blocks are aligned.
     * Default: true
     */
    alignPatterns?: boolean;

    /**
     * Whether to put opening braces on the same line as keywords.
     * Default: true
     */
    sameBraceLine?: boolean;

    /**
     * Whether to insert blank lines between major clauses.
     * Default: true
     */
    separateClauses?: boolean;
}

/**
 * Internal formatting context that tracks state during token processing.
 */
interface SparqlFormatterContext extends BaseFormatterContext {
    opts: Required<SparqlFormatterOptions>;
    justEndedPrefix: boolean;
    inWhereBlock: boolean;
    functionCallDepth: number;
    /**
     * One entry per currently-open `(` so each `)` can be matched to its own
     * opener. Without this, a `)` that closes an inline sub-group would wrongly
     * pop the enclosing multi-line paren scope (or decrement the function-call
     * depth of an outer function call).
     */
    parenStack: { isFunction: boolean; isMultiLine: boolean }[];
    hasFromClause: boolean;
    isAskQuery: boolean;
    /** Tracks if we just closed an inline block */
    lastWasInlineBlock: boolean;
    /** Index in parts[] where the last comment block started (for blank-line repositioning). */
    lastCommentPartIndex: number;
    /** Whether the last comment block already consumed a blank line (from source or clause separation). */
    lastCommentHadBlankLine: boolean;
    /** Whether we are inside a VALUES clause (between VALUES keyword and matching close brace). */
    inValuesClause: boolean;
    /** Depth of the VALUES scope (to match the correct closing brace). */
    valuesDepth: number;
}

/**
 * Formatter for SPARQL queries and updates.
 *
 * Uses the W3C-compliant SparqlLexer from mentor-rdf-parsers for tokenization.
 *
 * This formatter can:
 * - Format SPARQL 1.1/1.2 queries and updates
 * - Normalize keyword casing
 * - Apply consistent indentation
 * - Align triple patterns
 * - Preserve comments
 * - Preserve source newlines and blank lines
 *
 * @see https://www.w3.org/TR/sparql12-query/
 */
export class SparqlFormatter
    extends TokenFormatterBase<SparqlFormatterContext, SparqlFormatterOptions>
    implements ISparqlFormatter {
    private lexer = new SparqlLexer();

    // ========================================================================
    // Public API
    // ========================================================================

    formatFromText(query: string, options?: SparqlFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);

        const templated = formatTemplate(query, this.lexer, opts.indent, tokens => this.formatTokenStream(tokens, opts));

        if (templated) {
            return templated;
        }

        const result = this.lexer.tokenize(query);

        if (result.errors.length > 0) {
            return { output: query };
        } else {
            return this.formatTokenStream(result.tokens, opts);
        }
    }

    formatFromTokens(tokens: IToken[], options?: SparqlFormatterOptions & TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);

        return this.formatTokenStream(tokens, opts);
    }

    // ========================================================================
    // BaseTokenFormatter abstract implementations
    // ========================================================================

    protected getOptions(options?: SparqlFormatterOptions): Required<SparqlFormatterOptions> {
        const base = this.mergeBaseOptions(options);
        return {
            ...base,
            uppercaseKeywords: options?.uppercaseKeywords ?? true,
            lowercaseKeywords: options?.lowercaseKeywords ?? false,
            alignPatterns: options?.alignPatterns ?? true,
            sameBraceLine: options?.sameBraceLine ?? true,
            separateClauses: options?.separateClauses ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            maxLineWidth: options?.maxLineWidth ?? base.maxLineWidth,
            alignPredicates: options?.alignPredicates ?? base.alignPredicates,
            alignObjects: options?.alignObjects ?? base.alignObjects,
            objectListStyle: options?.objectListStyle ?? base.objectListStyle,
            predicateListStyle: options?.predicateListStyle ?? base.predicateListStyle,
            blankLinesBetweenSubjects: options?.blankLinesBetweenSubjects ?? base.blankLinesBetweenSubjects,
        };
    }

    protected createContext(opts: Required<SparqlFormatterOptions>): SparqlFormatterContext {
        return {
            ...this.createBaseContext(),
            opts,
            justEndedPrefix: false,
            inWhereBlock: false,
            functionCallDepth: 0,
            parenStack: [],
            hasFromClause: false,
            isAskQuery: false,
            lastWasInlineBlock: false,
            lastCommentPartIndex: 0,
            lastCommentHadBlankLine: false,
            inValuesClause: false,
            valuesDepth: 0,
        };
    }

    protected formatTokenValue(token: IToken, opts: Required<SparqlFormatterOptions>): string {
        if (this.isLowercaseOnly(token)) {
            return token.image.toLowerCase();
        }
        if (this.isKeyword(token)) {
            if (opts.lowercaseKeywords) return token.image.toLowerCase();
            if (opts.uppercaseKeywords) return token.image.toUpperCase();
        }
        return token.image;
    }

    // ========================================================================
    // Inline block calculation
    // ========================================================================

    /**
     * Calculates the length of a block's content (from { to matching }).
     * Returns -1 if the block should use multi-line formatting.
     */
    private calculateBlockLength(tokens: IToken[], startIndex: number, opts: Required<SparqlFormatterOptions>): number {
        let depth = 0;
        let length = 0;
        let needsSpace = false;
        let lastTokenType: TokenType | null = null;
        let lastNonWsToken: IToken | null = null;

        for (let i = startIndex; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.tokenType === RdfToken.WS) continue;

            // A comment anywhere inside forces multi-line (a '#' comment runs to
            // end-of-line, so the block can never be collapsed onto one line).
            // Mirrors calculateStatementLength / calculateBracketBlockInlineLength.
            if (token.tokenType === RdfToken.COMMENT) return -1;

            // Source has explicit newlines - preserve multi-line format
            if (lastNonWsToken && token.startLine !== undefined && lastNonWsToken.endLine !== undefined) {
                if (token.startLine > lastNonWsToken.endLine) return -1;
            }

            if (token.tokenType === RdfToken.LCURLY) {
                if (depth > 0) {
                    const nestedLength = this.calculateBlockLength(tokens, i + 1, opts);
                    if (nestedLength < 0) return -1;
                    length += (needsSpace ? 1 : 0) + 1 + nestedLength + 1;
                    needsSpace = true;
                    let nestedDepth = 1;
                    i++;
                    while (i < tokens.length && nestedDepth > 0) {
                        if (tokens[i].tokenType === RdfToken.LCURLY) nestedDepth++;
                        else if (tokens[i].tokenType === RdfToken.RCURLY) nestedDepth--;
                        i++;
                    }
                    i--;
                    lastTokenType = RdfToken.RCURLY;
                    lastNonWsToken = tokens[i];
                    continue;
                }
                depth++;
                length += (needsSpace ? 1 : 0) + 1;
                needsSpace = false;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                depth--;
                if (depth < 0) {
                    length += (needsSpace ? 1 : 0) + 1;
                    return length;
                }
                length += (needsSpace ? 1 : 0) + 1;
                needsSpace = true;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD || token.tokenType === RdfToken.SEMICOLON) {
                length += token.image.length;
                needsSpace = true;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.LPARENT || token.tokenType === RdfToken.LBRACKET) {
                const lastWasFunction = lastTokenType && this.isFunctionKeyword({ tokenType: lastTokenType } as IToken);
                length += (needsSpace && !lastWasFunction ? 1 : 0) + token.image.length;
                needsSpace = false;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RPARENT || token.tokenType === RdfToken.RBRACKET) {
                length += token.image.length;
                needsSpace = true;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                length += token.image.length;
                needsSpace = true;
                lastTokenType = token.tokenType;
                lastNonWsToken = token;
                continue;
            }

            const tokenLength = this.formatTokenValue(token, opts).length;
            const isOpenParen = lastTokenType === RdfToken.LPARENT || lastTokenType === RdfToken.LBRACKET;
            length += (needsSpace && !isOpenParen ? 1 : 0) + tokenLength;
            needsSpace = true;
            lastTokenType = token.tokenType;
            lastNonWsToken = token;
        }

        return -1;
    }

    private shouldBlockBeInline(ctx: SparqlFormatterContext, tokens: IToken[], startIndex: number): boolean {
        if (ctx.opts.maxLineWidth <= 0) return false;
        const blockLength = this.calculateBlockLength(tokens, startIndex, ctx.opts);
        if (blockLength < 0) return false;
        return ctx.currentLineLength + blockLength <= ctx.opts.maxLineWidth;
    }

    // ========================================================================
    // SPARQL-specific token handlers
    // ========================================================================

    private handleOpenBrace(ctx: SparqlFormatterContext, tokens: IToken[], startIndex: number): void {
        const shouldBeInline = this.shouldBlockBeInline(ctx, tokens, startIndex);
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        // When a blank line or newline was detected in the source *before* the
        // opening brace, we need to honour it here so that the blank line
        // appears before the brace, not after it. This mirrors the behaviour
        // in handleSparqlTokenSpacing but is specialised for structural
        // curly-brace tokens which bypass that helper.
        if (ctx.needsNewline) {
            if (!ctx.lastWasNewline) this.addPart(ctx, le, le, true);
            if (ctx.needsBlankLine) {
                this.addPart(ctx, le, le, true);
                ctx.needsBlankLine = false;
            }
            this.addPart(ctx, this.getIndent(ctx.indentLevel, ind), le);
            ctx.lastWasNewline = false;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && ctx.opts.sameBraceLine) {
            this.addPart(ctx, ' ', le);
        } else if (!ctx.opts.sameBraceLine) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
        }
        this.addPart(ctx, '{', le);
        ctx.lastWasNewline = false;

        if (shouldBeInline) {
            this.pushScope(ctx, 'curly', true, false);
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else {
            this.pushScope(ctx, 'curly', false, false);
            ctx.needsNewline = ctx.opts.prettyPrint;
            ctx.needsSpace = false;
        }

        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;

        // Track the VALUES block depth so we can clear inValuesClause
        // when the matching close brace is encountered.
        if (ctx.inValuesClause && ctx.valuesDepth === 0) {
            ctx.valuesDepth = ctx.indentLevel;
        }

        // The source-originated newline/blank-line information has now been
        // consumed for this brace, so it should not affect the next token.
        ctx.sourceNewline = false;
    }

    private handleCloseBrace(ctx: SparqlFormatterContext, prevWasComment = false): void {
        const scope = this.currentScope(ctx);
        const isInline = scope?.isInline ?? false;
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        this.popScope(ctx);

        if (isInline) {
            this.addPart(ctx, ' }', le);
        } else if (ctx.opts.prettyPrint) {
            // A preceding comment already forced the dedented break.
            if (!prevWasComment) {
                this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            }
            this.addPart(ctx, '}', le);
        } else {
            this.addPart(ctx, '}', le);
        }

        ctx.lastWasNewline = false;
        ctx.needsNewline = ctx.opts.prettyPrint && !isInline;
        ctx.needsSpace = isInline;
        // Only clear inWhereBlock when exiting the outermost WHERE block
        // (i.e. indent level returns to 0). Inner blocks like VALUES { }
        // or FILTER NOT EXISTS { } should not clear this flag.
        if (ctx.indentLevel === 0) {
            ctx.inWhereBlock = false;
        }
        ctx.triplePosition = 0;
        ctx.inlineStatement = false;
        ctx.lastSubject = null;
        ctx.lastWasInlineBlock = isInline;

        // Clear VALUES clause tracking when matching brace closes.
        if (ctx.inValuesClause && ctx.indentLevel < ctx.valuesDepth) {
            ctx.inValuesClause = false;
            ctx.valuesDepth = 0;
        }
    }

    private handleSparqlPeriod(ctx: SparqlFormatterContext, nextToken: IToken | undefined): void {
        const le = ctx.opts.lineEnd;
        if (ctx.opts.spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, '.', le);

        if (ctx.inPrefix) {
            ctx.needsNewline = ctx.opts.prettyPrint;
            const nextIsPrefix = nextToken && (
                nextToken.tokenType === RdfToken.PREFIX || nextToken.tokenType === RdfToken.BASE
            );
            if (!nextIsPrefix && nextToken) {
                ctx.needsNewline = ctx.opts.prettyPrint;
            }
        } else if (ctx.indentLevel > 0) {
            ctx.needsNewline = ctx.opts.prettyPrint;
        }

        ctx.needsSpace = true;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.inlineStatement = false;
    }

    private handleSparqlSemicolon(ctx: SparqlFormatterContext): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (ctx.opts.spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, ';', le);

        // Inline statement takes priority: source had it on one line and it fits.
        if (ctx.inlineStatement) {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
            ctx.triplePosition = 1;
            return;
        }

        const shouldMultiLine = ctx.opts.predicateListStyle === 'multi-line' ||
            (ctx.opts.predicateListStyle === 'first-same-line' && ctx.indentLevel > 0);

        if (ctx.opts.predicateListStyle === 'single-line') {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else if (ctx.opts.prettyPrint && this.inBracketScope(ctx) && this.currentScope(ctx)?.isInline) {
            // Inside an inline blank node property list — stay on the same line.
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else if (shouldMultiLine && ctx.opts.prettyPrint) {
            const extra = this.inBracketScope(ctx) ? '' : ind;
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind) + extra, le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else if (ctx.opts.prettyPrint) {
            const extra = this.inBracketScope(ctx) ? '' : ind;
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind) + extra, le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        }

        ctx.triplePosition = 1;
    }

    private handleSparqlComma(ctx: SparqlFormatterContext, nextToken: IToken | undefined): void {
        const le = ctx.opts.lineEnd;
        this.addPart(ctx, ',', le);

        if (ctx.opts.objectListStyle === 'multi-line') {
            ctx.needsNewline = ctx.opts.prettyPrint && ctx.indentLevel > 0;
            ctx.needsSpace = !ctx.needsNewline;
        } else if (ctx.opts.objectListStyle === 'auto' && ctx.opts.maxLineWidth > 0) {
            const nextObjLen = nextToken ? nextToken.image.length + 1 : 0;
            if (this.shouldWrap(ctx, nextObjLen, ctx.opts.maxLineWidth)) {
                ctx.needsNewline = ctx.opts.prettyPrint;
                ctx.needsSpace = !ctx.needsNewline;
            } else {
                ctx.needsSpace = true;
            }
        } else {
            ctx.needsSpace = true;
        }
    }

    private handleSparqlOpenParen(ctx: SparqlFormatterContext, token: IToken, tokens: IToken[], index: number): void {
        const isLParen = token.tokenType === RdfToken.LPARENT;
        const isLBracket = token.tokenType === RdfToken.LBRACKET;
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (isLParen) {
            const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);
            if (lastWasFunction) ctx.functionCallDepth++;
        }

        const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);

        // Normally newlines are suppressed inside function-call argument lists so
        // expressions stay on one line. A newline that originates from the source
        // layout (e.g. an operand placed on its own line after `||` inside a
        // FILTER) is preserved, so author-chosen line breaks before a sub-group
        // survive. A break is never inserted right after the function name itself.
        const breakBeforeParen = ctx.needsNewline && !lastWasFunction &&
            (ctx.functionCallDepth === 0 || ctx.sourceNewline);

        if (breakBeforeParen) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (!isLParen || !lastWasFunction) {
                this.addPart(ctx, ' ', le);
            }
        }
        ctx.needsNewline = false;
        ctx.sourceNewline = false;

        this.addPart(ctx, token.image, le);
        ctx.needsSpace = false;

        // Square bracket [ ] → push bracket scope (for blank node property lists)
        if (isLBracket) {
            const maxLineWidth = ctx.opts.maxLineWidth;
            let isInlineBracket = false;

            if (ctx.opts.prettyPrint && maxLineWidth > 0) {
                const blockLength = this.calculateBracketBlockInlineLength(tokens, index);
                isInlineBracket = blockLength >= 0 && ctx.currentLineLength + blockLength <= maxLineWidth;
            }

            this.pushScope(ctx, 'bracket', isInlineBracket, false);
            if (isInlineBracket) {
                // Emit the space between '[' and first content token immediately.
                this.addPart(ctx, ' ', le);
            }
        }

        // Record this paren so its matching ')' can be resolved unambiguously.
        if (isLParen) {
            const isMultiLine = this.isParenBlockMultiLine(tokens, index);

            ctx.parenStack.push({ isFunction: !!lastWasFunction, isMultiLine });

            // Multi-line parenthesis → push paren scope for proper indent
            if (isMultiLine) {
                this.pushScope(ctx, 'paren', false, true);
            }
        }
    }

    private handleSparqlCloseParen(ctx: SparqlFormatterContext, token: IToken, prevWasComment = false): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        // Resolve this ')' against the matching '(' recorded on the paren stack
        // so an inline sub-group never closes an outer function call or
        // multi-line paren scope.
        const openParen = token.tokenType === RdfToken.RPARENT ? ctx.parenStack.pop() : undefined;

        if (openParen?.isFunction && ctx.functionCallDepth > 0) {
            ctx.functionCallDepth--;
        }

        // Closing bracket ] for blank-node property lists
        if (token.tokenType === RdfToken.RBRACKET) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'bracket') {
                // A preceding comment already forced the dedented break; just close
                // the scope and emit ']' on the line the break opened.
                if (prevWasComment) {
                    this.popScope(ctx);
                    this.addPart(ctx, token.image, le);
                    ctx.needsSpace = true;
                    ctx.needsNewline = false;
                    return;
                }
                if (!scope.isInline) {
                    // Pop any trailing newline+indent from a semicolon
                    if (ctx.lastWasNewline && ctx.parts.length > 0) {
                        const lastPart = ctx.parts[ctx.parts.length - 1];
                        if (lastPart.includes(le) || /^\s+$/.test(lastPart)) {
                            ctx.parts.pop();
                        }
                    }
                }
                this.popScope(ctx);
                if (ctx.opts.prettyPrint && !scope.isInline) {
                    this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                } else if (scope.isInline) {
                    // Emit the space between last content token and ']'.
                    this.addPart(ctx, ' ', le);
                }
                this.addPart(ctx, token.image, le);
                ctx.lastWasNewline = false;
                ctx.needsSpace = true;
                ctx.needsNewline = false;
                return;
            }
        }

        // Closing multi-line paren
        if (token.tokenType === RdfToken.RPARENT && openParen?.isMultiLine) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'paren' && scope.isMultiLine) {
                this.popScope(ctx);
                // A preceding comment already forced the dedented break.
                if (ctx.opts.prettyPrint && !prevWasComment) {
                    this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                }
                this.addPart(ctx, token.image, le);
                ctx.lastWasNewline = false;
                ctx.needsSpace = true;
                ctx.needsNewline = false;
                return;
            }
        }

        this.addPart(ctx, token.image, le);
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    // ========================================================================
    // Comment handling
    // ========================================================================

    private handleGroupComment(ctx: SparqlFormatterContext, comment: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine) {
                const lineGap = comment.startLine - ctx.lastNonWsToken.endLine;
                if (lineGap > 1) {
                    if (!ctx.lastWasNewline) this.addPart(ctx, le, le, true);
                    this.addPart(ctx, le, le, true);
                    this.addPart(ctx, this.getIndent(ctx.indentLevel, ind), le);
                } else {
                    this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                }
            } else {
                this.addPart(ctx, ' ', le);
            }
        }
        this.addPart(ctx, comment.image, le);
        ctx.lastWasNewline = false;
        ctx.needsNewline = true;
        ctx.needsSpace = false;
        ctx.lastWasComment = true;
        ctx.lastNonWsToken = comment;
    }

    private handleInlineComment(ctx: SparqlFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        // Track where the first comment in a consecutive series starts in parts[],
        // so that blank-line-between-subjects can be retroactively placed before the comment.
        if (!ctx.lastWasComment) {
            ctx.lastCommentPartIndex = ctx.parts.length;
            ctx.lastCommentHadBlankLine = false;
        }
        // If the comment is on the same source line as the previous non-WS token
        // but a newline+indent was already emitted (e.g. by handleSparqlSemicolon),
        // undo the newline so the comment stays inline.
        const sameSourceLine = ctx.lastNonWsToken &&
            token.startLine !== undefined && ctx.lastNonWsToken.endLine !== undefined &&
            token.startLine === ctx.lastNonWsToken.endLine;

        if (sameSourceLine && ctx.lastWasNewline && ctx.parts.length > 0) {
            while (ctx.parts.length > 0) {
                const last = ctx.parts[ctx.parts.length - 1];
                if (last.includes(le) || last.trim() === '') {
                    ctx.parts.pop();
                } else {
                    break;
                }
            }
            ctx.lastWasNewline = false;
            this.addPart(ctx, ' ', le);
        } else if (ctx.needsNewline) {
            if (!ctx.lastWasNewline) this.addPart(ctx, le, le, true);
            if (ctx.needsBlankLine) {
                this.addPart(ctx, le, le, true);
                ctx.needsBlankLine = false;
                ctx.lastCommentHadBlankLine = true;
            }
            this.addPart(ctx, this.getIndent(ctx.indentLevel, ind), le);
            ctx.lastWasNewline = false;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, token.image, le);
        ctx.lastWasNewline = false;
        ctx.needsNewline = true;
        ctx.needsSpace = false;
        ctx.lastWasComment = true;
    }

    // ========================================================================
    // State tracking
    // ========================================================================

    private updateClauseState(ctx: SparqlFormatterContext, token: IToken): void {
        if (token.tokenType === RdfToken.PREFIX || token.tokenType === RdfToken.BASE) ctx.inPrefix = true;
        if (token.tokenType === RdfToken.WHERE) ctx.inWhereBlock = true;
        if (token.tokenType === RdfToken.ASK) ctx.isAskQuery = true;
        if (token.tokenType === RdfToken.FROM) ctx.hasFromClause = true;
        if (token.tokenType === RdfToken.VALUES) ctx.inValuesClause = true;
    }

    private handleClauseSeparation(ctx: SparqlFormatterContext, token: IToken): void {
        const justOpenedBrace = ctx.lastNonWsToken?.tokenType === RdfToken.LCURLY;
        const justClosedBrace = ctx.lastNonWsToken?.tokenType === RdfToken.RCURLY;
        const isTopLevel = ctx.indentLevel === 0;

        if (ctx.opts.separateClauses &&
            this.isMajorClauseKeyword(token) &&
            ctx.parts.length > 0 &&
            !ctx.inPrefix &&
            !ctx.justEndedPrefix &&
            !ctx.lastWasComment &&
            !ctx.lastWasInlineBlock &&
            !justOpenedBrace &&
            !justClosedBrace &&
            !isTopLevel) {
            ctx.needsBlankLine = true;
            ctx.needsNewline = true;
        }

        if (ctx.opts.separateClauses &&
            this.isNewlineKeyword(token) &&
            ctx.parts.length > 0 &&
            !ctx.inPrefix) {
            if (token.tokenType === RdfToken.WHERE && ctx.isAskQuery && !ctx.hasFromClause) {
                ctx.needsNewline = false;
                ctx.needsSpace = true;
            } else if (token.tokenType === RdfToken.NAMED && ctx.lastNonWsToken?.tokenType === RdfToken.FROM) {
                // FROM NAMED should stay on the same line
                ctx.needsNewline = false;
                ctx.needsSpace = true;
            } else {
                ctx.needsNewline = true;
            }
        }

        if (token.tokenType !== RdfToken.PREFIX && token.tokenType !== RdfToken.BASE) {
            ctx.justEndedPrefix = false;
        }
    }

    private handleTriplePosition(ctx: SparqlFormatterContext, token: IToken, tokens: IToken[], index: number, prevWasComment = false): void {
        if (!ctx.inWhereBlock || ctx.indentLevel <= 0 || ctx.functionCallDepth > 0 || ctx.inValuesClause) {
            return;
        }

        if (this.isTermToken(token)) {
            if (ctx.triplePosition === 0) {
                // A term immediately followed by '{' is a graph label of a
                // GRAPH/SERVICE pattern (e.g. `GRAPH ?og { ... }`), not a triple
                // subject. Treating it as a subject would wrongly trigger
                // blank-line-between-subjects spacing between the keyword and the
                // label. The opening brace resets the triple position itself.
                let n = index + 1;
                while (n < tokens.length &&
                    (tokens[n].tokenType === RdfToken.WS || tokens[n].tokenType === RdfToken.COMMENT)) {
                    n++;
                }
                if (tokens[n]?.tokenType === RdfToken.LCURLY) {
                    return;
                }

                if (ctx.opts.blankLinesBetweenSubjects && ctx.lastSubject !== null && token.image !== ctx.lastSubject) {
                    if (!ctx.needsBlankLine) {
                        if (prevWasComment && !ctx.lastCommentHadBlankLine) {
                            // A comment precedes this new subject. Insert the blank line
                            // *before* the comment block so the comment stays attached to
                            // its associated statement, not floating after a blank line.
                            ctx.parts.splice(ctx.lastCommentPartIndex, 0, ctx.opts.lineEnd);
                        } else if (!prevWasComment) {
                            ctx.needsBlankLine = true;
                        }
                    }

                    ctx.needsNewline = true;
                }

                ctx.lastSubject = token.image;

                this.detectInlineStatement(ctx, tokens, index, ctx.opts.indent, ctx.opts.maxLineWidth);
            }

            ctx.triplePosition++;

            if (ctx.triplePosition > 2) ctx.triplePosition = 2;
        }
    }

    // ========================================================================
    // Spacing & wrapping
    // ========================================================================

    /**
     * Detects a postfix property-path operator (`*`, `+`, `?`).
     *
     * These tokens share their token types with the arithmetic `*` / `+`
     * operators (and `?` with nothing else), so they are disambiguated by
     * source adjacency: a property-path operator hugs its operand with no
     * intervening whitespace (`rdfs:subClassOf+`), whereas an arithmetic
     * operator is surrounded by spaces (`?a + ?b`). When the operator
     * directly abuts the preceding token in the source it must stay attached
     * with no leading space.
     */
    private isPostfixPathOperator(ctx: SparqlFormatterContext, token: IToken): boolean {
        if (token.tokenType !== RdfToken.STAR &&
            token.tokenType !== RdfToken.PLUS_SIGN &&
            token.tokenType !== RdfToken.QUESTION_MARK) {
            return false;
        }
        const prev = ctx.lastNonWsToken;
        if (!prev || token.startOffset === undefined) return false;
        const prevEnd = prev.endOffset ?? prev.startOffset + prev.image.length - 1;
        return token.startOffset === prevEnd + 1;
    }

    private handleLineWrapping(ctx: SparqlFormatterContext, value: string): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        // Never break a `FROM` / `FROM NAMED` dataset clause keyword from its IRI: the IRI
        // cannot wrap, so a newline here only orphans `FROM` on its own line.
        if (ctx.lastNonWsToken?.tokenType === RdfToken.FROM || ctx.lastNonWsToken?.tokenType === RdfToken.NAMED) {
            return;
        }

        if (ctx.opts.maxLineWidth > 0 && !ctx.needsNewline && ctx.needsSpace) {
            const spaceNeeded = ctx.parts.length > 0 && ctx.lastNonWsToken &&
                !this.isOpeningBracket(ctx.lastNonWsToken) ? 1 : 0;

            if (this.shouldWrap(ctx, spaceNeeded + value.length, ctx.opts.maxLineWidth)) {
                this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);

                ctx.lastWasNewline = true;
                ctx.needsNewline = false;
                ctx.needsSpace = false;
            }
        }
    }

    private handleSparqlTokenSpacing(ctx: SparqlFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        const isDatatypeContext = token.tokenType === RdfToken.DCARET ||
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const inFunctionCall = ctx.functionCallDepth > 0;
        // Only suppress newlines in function calls when they are NOT from source.
        // Source newlines (detected from token positions) should always be preserved.
        const shouldAvoidNewline = isDatatypeContext || (inFunctionCall && !ctx.sourceNewline);

        // Inside an inline bracket scope, suppress source-layout newlines so the
        // entire blank node property list stays on one line.
        if (ctx.needsNewline && this.inBracketScope(ctx) && this.currentScope(ctx)?.isInline) {
            ctx.needsNewline = false;
            ctx.needsBlankLine = false;
        }

        if (ctx.needsNewline && !shouldAvoidNewline) {
            if (!ctx.lastWasNewline) {
                this.addPart(ctx, le, le, true);
            }

            if (ctx.needsBlankLine) {
                this.addPart(ctx, le, le, true);
                ctx.needsBlankLine = false;
            }

            this.addPart(ctx, this.getIndent(ctx.indentLevel, ind), le);

            ctx.lastWasNewline = false;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                const isOpenParen = token.tokenType === RdfToken.LPARENT;
                const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);

                if (!(isOpenParen && lastWasFunction) && !isDatatypeContext) {
                    this.addPart(ctx, ' ', le);
                }
            }

            ctx.lastWasNewline = false;
        } else {
            ctx.lastWasNewline = false;
        }

        if (shouldAvoidNewline) {
            ctx.needsNewline = false;
            ctx.needsBlankLine = false;
        }

        ctx.sourceNewline = false;
    }

    private detectBlankLines(ctx: SparqlFormatterContext, token: IToken): void {
        if (ctx.lastNonWsToken && token.startLine !== undefined && ctx.lastNonWsToken.endLine !== undefined) {
            const lineGap = token.startLine - ctx.lastNonWsToken.endLine;

            if (lineGap > 1) {
                ctx.needsBlankLine = true;
                ctx.needsNewline = true;
                ctx.sourceNewline = true;
            } else if (lineGap === 1 && !ctx.lastWasNewline) {
                ctx.needsNewline = true;
                ctx.sourceNewline = true;
            }
        }
    }

    private handleSparqlPrefixIri(ctx: SparqlFormatterContext, value: string): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;

        if (ctx.needsNewline) {
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);

            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                this.addPart(ctx, ' ', le);
            }
        }

        this.addPart(ctx, value, le);

        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
        ctx.justEndedPrefix = true;
    }

    private formatTokenStream(tokens: IToken[], options: Required<SparqlFormatterOptions>): SerializationResult {
        const ctx = this.createContext(options);
        const le = options.lineEnd;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const nextToken = tokens[i + 1];

            // Skip whitespace
            if (token.tokenType === RdfToken.WS) {
                ctx.lastToken = token;
                continue;
            }

            // Detect source blank lines
            this.detectBlankLines(ctx, token);

            // Handle inline comments
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleInlineComment(ctx, token);

                ctx.lastToken = token;
                ctx.lastNonWsToken = token;

                continue;
            }

            const value = this.formatTokenValue(token, options);

            // State tracking
            this.updateClauseState(ctx, token);
            this.handleClauseSeparation(ctx, token);

            const prevWasComment = ctx.lastWasComment;

            ctx.lastWasComment = false;
            ctx.lastWasInlineBlock = false;

            // A '#' comment runs to end-of-line, so the next token MUST start on a
            // new line in every mode — SPARQL has no inline/block comment form.
            // Without this the comment swallows the following token(s) and the
            // output becomes invalid. The closing-token handlers (`}`, `)`, `]`)
            // are told via `prevWasComment` to skip their own break, so this stays
            // the single source of the post-comment break.
            if (prevWasComment) {
                const le = ctx.opts.lineEnd;
                // Closing tokens dedent: each `}`/`)`/`]` closes a scope whose
                // opener incremented `indentLevel`, so they sit one level shallower.
                const isCloser = token.tokenType === RdfToken.RCURLY ||
                    token.tokenType === RdfToken.RPARENT ||
                    token.tokenType === RdfToken.RBRACKET;
                const level = isCloser ? Math.max(0, ctx.indentLevel - 1) : ctx.indentLevel;
                if (!ctx.lastWasNewline) this.addPart(ctx, le, le, true);
                this.addPart(ctx, this.getIndent(level, ctx.opts.indent), le);
                ctx.lastWasNewline = true;
                ctx.needsNewline = false;
                ctx.needsSpace = false;
                ctx.sourceNewline = false;
            }

            // ── Structural tokens ──────────────────────────────────────
            if (token.tokenType === RdfToken.LCURLY) {
                this.handleOpenBrace(ctx, tokens, i + 1);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                this.handleCloseBrace(ctx, prevWasComment);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                this.handleSparqlPeriod(ctx, nextToken);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.SEMICOLON) {
                this.handleSparqlSemicolon(ctx);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                this.handleSparqlComma(ctx, nextToken);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.LPARENT || token.tokenType === RdfToken.LBRACKET) {
                this.handleSparqlOpenParen(ctx, token, tokens, i);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            if (token.tokenType === RdfToken.RPARENT || token.tokenType === RdfToken.RBRACKET) {
                this.handleSparqlCloseParen(ctx, token, prevWasComment);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            // PREFIX/BASE IRI completion
            if (ctx.inPrefix && (token.tokenType === RdfToken.IRIREF || token.tokenType === RdfToken.IRIREF_ABS)) {
                this.handleSparqlPrefixIri(ctx, value);
                ctx.lastToken = token; ctx.lastNonWsToken = token; continue;
            }

            // Triple position tracking
            this.handleTriplePosition(ctx, token, tokens, i, prevWasComment);

            // Keep postfix property-path operators (`*`, `+`, `?`) attached to
            // their operand, e.g. `rdfs:subClassOf+`, never `rdfs:subClassOf +`.
            if (this.isPostfixPathOperator(ctx, token)) {
                ctx.needsSpace = false;
                ctx.needsNewline = false;
            }

            // Line wrapping
            this.handleLineWrapping(ctx, value);

            // Spacing
            this.handleSparqlTokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value, le);

            ctx.needsSpace = true;
            ctx.lastToken = token;
            ctx.lastNonWsToken = token;
        }

        return { output: ctx.parts.join('').trim() };
    }
}
