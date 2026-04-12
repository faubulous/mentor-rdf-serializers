import { IToken, RdfSyntax, RdfToken, TurtleLexer } from '@faubulous/mentor-rdf-parsers';
import { ITokenFormatter } from '../token-formatter.interface';
import { TokenSerializerOptions } from '../token-serializer';
import { TokenFormatterBase, BaseFormatterContext, BaseFormatterOptions } from '../token-formatter-base';
import { SerializationResult } from '../serialization-result';

/**
 * Turtle-specific formatting options.
 */
export interface TurtleFormatterOptions extends BaseFormatterOptions {
    /**
     * Whether to use lowercase `@prefix` and `@base` (Turtle style).
     * When false, uses uppercase `PREFIX` and `BASE` (SPARQL style).
     * Default: true
     */
    lowercaseDirectives?: boolean;

    /**
     * When true (and prettyPrint is enabled), place the subject on its own line
     * and start the predicate list on the next line.
     *
     * Example:
     * ex:s
     *   a ex:T;
     *   ex:p ex:o.
     *
     * Default: false
     */
    newlineAfterSubject?: boolean;
}

/**
 * Internal formatting context for Turtle.
 */
interface TurtleFormatterContext extends BaseFormatterContext {
    opts: Required<TurtleFormatterOptions>;
    /** Whether at least one @prefix/PREFIX directive was seen in this document. */
    sawPrefixDefinition: boolean;
    /** Whether we still need to insert the prefix→first-subject blank line. */
    pendingPrefixToSubjectBlankLine: boolean;
}

/**
 * Formatter for Turtle (Terse RDF Triple Language).
 *
 * Uses the W3C-compliant TurtleLexer from mentor-rdf-parsers for tokenization.
 *
 * This formatter can:
 * - Format Turtle documents with consistent indentation
 * - Normalize prefix directive style
 * - Apply consistent spacing around punctuation
 * - Preserve comments
 * - Support RDF 1.2 features (triple terms, annotations)
 *
 * @see https://www.w3.org/TR/rdf12-turtle/
 */
export class TurtleFormatter
    extends TokenFormatterBase<TurtleFormatterContext, TurtleFormatterOptions>
    implements ITokenFormatter {
    readonly syntax: RdfSyntax = RdfSyntax.Turtle;
    protected lexer = new TurtleLexer();

    // ========================================================================
    // Public API
    // ========================================================================

    formatFromText(input: string, options?: TurtleFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const result = this.lexer.tokenize(input);

        if (result.errors.length > 0) {
            return { output: input };
        }

        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];
        return this.formatTokens(result.tokens, opts, comments);
    }

    formatFromTokens(tokens: IToken[], options?: TurtleFormatterOptions & TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);
        return this.formatTokens(tokens, opts);
    }

    // Backwards-compatible alias
    format(input: string, options?: TurtleFormatterOptions): SerializationResult {
        return this.formatFromText(input, options);
    }

    // ========================================================================
    // BaseTokenFormatter implementations
    // ========================================================================

    protected getOptions(options?: TurtleFormatterOptions): Required<TurtleFormatterOptions> {
        const base = this.mergeBaseOptions(options);
        return {
            ...base,
            lowercaseDirectives: options?.lowercaseDirectives ?? true,
            newlineAfterSubject: options?.newlineAfterSubject ?? false,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
        };
    }

    protected createContext(opts: Required<TurtleFormatterOptions>): TurtleFormatterContext {
        return {
            ...this.createBaseContext(),
            opts,
            sawPrefixDefinition: false,
            pendingPrefixToSubjectBlankLine: false,
        };
    }

    protected formatTokenValue(token: IToken, opts: Required<TurtleFormatterOptions>): string {
        const tokenType = token.tokenType;

        // Tokens marked as lowercase-only (true, false, a) stay lowercase
        if (this.isLowercaseOnly(token)) {
            return token.image.toLowerCase();
        }

        // Handle directive keywords (@prefix, @base vs PREFIX, BASE)
        if (tokenType === RdfToken.TTL_PREFIX || tokenType === RdfToken.TTL_BASE) {
            return opts.lowercaseDirectives ? token.image.toLowerCase() : token.image.toUpperCase().replace('@', '');
        }

        if (tokenType === RdfToken.PREFIX || tokenType === RdfToken.BASE) {
            return opts.lowercaseDirectives ? '@' + token.image.toLowerCase() : token.image.toUpperCase();
        }

        return token.image;
    }

    // ========================================================================
    // Token handlers
    // ========================================================================

    protected handleTurtleComment(ctx: TurtleFormatterContext, comment: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        const isRootLevel = !ctx.inPrefix && !this.inBracketScope(ctx);
        const shouldConsumePendingPrefixBlankLine =
            isRootLevel &&
            ctx.opts.prettyPrint &&
            ctx.opts.blankLinesBetweenSubjects &&
            ctx.lastSubject === null &&
            ctx.sawPrefixDefinition &&
            ctx.pendingPrefixToSubjectBlankLine;

        if (ctx.parts.length > 0) {
            if (
                ctx.lastNonWsToken &&
                comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine
            ) {
                const lineGap = comment.startLine - ctx.lastNonWsToken.endLine;
                const needsBlankLineBeforeComment =
                    lineGap > 1 || (shouldConsumePendingPrefixBlankLine && lineGap <= 1);

                const indentText = this.getIndent(ctx.indentLevel, ind);
                if (ctx.lastWasNewline) {
                    // A newline+indent was already emitted (e.g. after `;`
                    // in pretty-print mode).  If the source also had a blank
                    // line before the comment we still need the extra `le`.
                    if (needsBlankLineBeforeComment) {
                        this.addPart(ctx, le + indentText, le, true);
                        ctx.needsBlankLine = false;
                    }
                    // Otherwise nothing — the newline is already there.
                } else if (needsBlankLineBeforeComment) {
                    this.addPart(ctx, le + le + indentText, le, true);
                    ctx.needsBlankLine = false;
                } else {
                    this.addPart(ctx, le + indentText, le, true);
                }

                ctx.lastWasNewline = true;
            } else {
                // Comment is on the same line as the previous token.
                // If a newline was already emitted (e.g. after `;`), undo it
                // so the comment stays inline.
                if (ctx.lastWasNewline && ctx.parts.length > 0) {
                    // Remove the trailing newline+indent that was eagerly
                    // emitted by the previous handler (e.g. handleTurtleSemicolon).
                    let removed = '';
                    while (ctx.parts.length > 0) {
                        const last = ctx.parts[ctx.parts.length - 1];
                        if (last.includes(le) || last.trim() === '') {
                            removed = ctx.parts.pop()! + removed;
                        } else {
                            break;
                        }
                    }
                    ctx.lastWasNewline = false;
                }
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

        // If a leading comment appears between the prefix block and the first
        // subject, treat the prefix→subject separator as belonging before the
        // comment, not between the comment and the subject.
        if (shouldConsumePendingPrefixBlankLine) {
            ctx.pendingPrefixToSubjectBlankLine = false;
        }
    }

    protected handleTurtleOpenBracket(ctx: TurtleFormatterContext, token: IToken, tokens?: IToken[], tokenIndex?: number): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (ctx.needsNewline) {
            if (ctx.needsBlankLine) {
                this.addPart(ctx, le, le, true);
                ctx.needsBlankLine = false;
            }
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }

        this.addPart(ctx, token.image, le);

        if (token.tokenType === RdfToken.LBRACKET) {
            const maxLineWidth = ctx.opts.maxLineWidth;
            let isInline = false;

            if (ctx.opts.prettyPrint && tokens !== undefined && tokenIndex !== undefined) {
                // Determine whether the source placed the first content token on
                // the same line as `[`.  When it did, we preserve that layout
                // (subject to the maxLineWidth limit).  When the source already
                // had a newline after `[` we always keep it multi-line.
                let nextNonWs: IToken | undefined;
                for (let j = tokenIndex + 1; j < tokens.length; j++) {
                    if (tokens[j].tokenType !== RdfToken.WS) {
                        nextNonWs = tokens[j];
                        break;
                    }
                }

                const sourceIsInline =
                    nextNonWs !== undefined &&
                    nextNonWs.startLine !== undefined &&
                    token.startLine !== undefined &&
                    nextNonWs.startLine === token.startLine;

                if (sourceIsInline) {
                    const blockLength = this.calculateBracketBlockInlineLength(tokens, tokenIndex);
                    // Inline if the content has no comment and fits within the
                    // line-width limit (or there is no limit).
                    isInline = blockLength >= 0 &&
                        (maxLineWidth === 0 || ctx.currentLineLength + blockLength <= maxLineWidth);
                }
                // Source was multi-line → isInline stays false.
            }

            this.pushScope(ctx, 'bracket', isInline, false);
            ctx.needsNewline = ctx.opts.prettyPrint && !isInline;
            if (isInline) {
                // Emit the space between '[' and first content token immediately.
                this.addPart(ctx, ' ', le);
            }
        } else if (token.tokenType === RdfToken.LPARENT) {
            const isMultiLine = ctx.opts.prettyPrint &&
                tokens !== undefined &&
                tokenIndex !== undefined &&
                this.isParenBlockMultiLine(tokens, tokenIndex);
            this.pushScope(ctx, 'paren', !isMultiLine, isMultiLine);
            ctx.needsNewline = isMultiLine;
        }

        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    protected handleTurtleCloseBracket(ctx: TurtleFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (token.tokenType === RdfToken.RBRACKET) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'bracket') {
                this.popScope(ctx);
                if (ctx.opts.prettyPrint && !scope.isInline) {
                    // For blank node property lists, the closing ']' should
                    // align with the predicate that introduced the '['.
                    // The scope's indentLevel represents the indentation at
                    // the point where '[' was seen (the predicate line).
                    const baseIndentLevel = scope.indentLevel;

                    // If a previous token handler already emitted a newline
                    // and indentation for this line (for example after ';'
                    // inside a bracket scope), avoid adding another newline.
                    if (!ctx.lastWasNewline) {
                        this.addPart(ctx, le + this.getIndent(baseIndentLevel, ind), le, true);
                        ctx.lastWasNewline = true;
                    }
                } else if (scope.isInline) {
                    // Emit the space between last content token and ']'.
                    this.addPart(ctx, ' ', le);
                }
            }
        } else if (token.tokenType === RdfToken.RPARENT) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'paren') {
                this.popScope(ctx);
                if (scope.isMultiLine) {
                    // In a multi-line collection (...), the closing ')' goes on its own line
                    // at the scope's base indentation level.
                    if (!ctx.lastWasNewline) {
                        this.addPart(ctx, le + this.getIndent(scope.indentLevel, ind), le, true);
                        ctx.lastWasNewline = true;
                    }
                }
            }
        }

        this.addPart(ctx, token.image, le);
        ctx.needsSpace = true;
        ctx.lastWasNewline = false;

        // After closing a bracket/paren, if we are now directly inside a multi-line
        // collection (...), the next element should start on a new line.
        const outerScope = this.currentScope(ctx);
        ctx.needsNewline = ctx.opts.prettyPrint &&
            outerScope?.type === 'paren' && outerScope.isMultiLine;
        if (ctx.needsNewline) {
            ctx.needsSpace = false;
            ctx.lastWasNewline = false;
        }
    }

    protected handleTurtlePeriod(ctx: TurtleFormatterContext): void {
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
        ctx.inlineStatement = false;

        // Reset indentation back to the current structural scope (if any).
        // This prevents predicate-list indentation from leaking into the next
        // statement.
        const scope = this.currentScope(ctx);
        ctx.indentLevel = scope ? scope.indentLevel + 1 : 0;
    }

    protected handleTurtleSemicolon(ctx: TurtleFormatterContext): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (ctx.opts.spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, ';', le);

        if (ctx.inlineStatement) {
            // Source had the statement on one line and it fits → keep inline.
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else if (ctx.opts.prettyPrint) {
            // Turtle predicate-object lists indent continuation predicates.
            // At the top level, that means moving from column 0 to 1 indent.
            // Inside blank node property lists ([ ... ]), we keep the same
            // indentation level for subsequent predicates.
            const inBlankNodePropertyList = this.inBracketScope(ctx);

            if (!inBlankNodePropertyList) {
                const scope = this.currentScope(ctx);
                const statementBaseIndentLevel = scope ? scope.indentLevel + 1 : 0;
                ctx.indentLevel = statementBaseIndentLevel + 1;
                this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                ctx.lastWasNewline = true;
            } else if (this.currentScope(ctx)?.isInline) {
                // Inside an inline blank node property list — stay on the same line.
                ctx.needsNewline = false;
                ctx.needsSpace = true;
                ctx.triplePosition = 1;
                return;
            } else {
                // Inside a multi-line blank node property list, defer the newline so
                // that the next token handler (including ']') can emit it at the
                // correct indentation level.
                ctx.lastWasNewline = false;
            }

            ctx.needsNewline = !ctx.lastWasNewline;
            ctx.needsSpace = false;
        } else {
            ctx.needsSpace = true;
        }

        ctx.triplePosition = 1;
    }

    protected handleTurtleComma(ctx: TurtleFormatterContext): void {
        const le = ctx.opts.lineEnd;
        this.addPart(ctx, ',', le);
        ctx.needsSpace = true;
    }

    protected handleTurtlePrefixIri(ctx: TurtleFormatterContext, value: string): void {
        const le = ctx.opts.lineEnd;
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, value, le);
        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
    }

    protected handleTurtleTokenSpacing(ctx: TurtleFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        const isDatatypeContext = token.tokenType === RdfToken.DCARET ||
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const isLangTag = token.tokenType === RdfToken.LANGTAG;

        if (ctx.needsNewline && !isDatatypeContext && !isLangTag) {
            if (ctx.needsBlankLine) {
                // Insert an extra line break so we end up with an empty line
                // before the next root-level subject.
                this.addPart(ctx, le, le, true);
                ctx.needsBlankLine = false;
            }
            this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && !isDatatypeContext && !isLangTag) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
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

    protected formatTokens(
        tokens: IToken[],
        opts: Required<TurtleFormatterOptions>,
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
                    this.handleTurtleComment(ctx, comment);
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

            // Preserve source blank lines at statement boundaries.
            // When the source has a blank line after a '.' (root-level, outside any scope)
            // carry it through to the output even if blankLinesBetweenSubjects is false.
            if (ctx.opts.prettyPrint && !ctx.needsBlankLine &&
                ctx.needsNewline && ctx.indentLevel === 0 &&
                !this.inBracketScope(ctx) && !this.inParenScope(ctx) &&
                token.startLine !== undefined && ctx.lastNonWsToken?.endLine !== undefined &&
                token.startLine - ctx.lastNonWsToken.endLine > 1) {
                ctx.needsBlankLine = true;
            }

            // Handle comment tokens in stream
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleTurtleComment(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            const value = this.formatTokenValue(token, opts);

            // Reset comment tracking — this is a non-comment token.
            const prevWasComment = ctx.lastWasComment;
            ctx.lastWasComment = false;

            // Track prefix declarations
            if (token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.PREFIX ||
                token.tokenType === RdfToken.TTL_BASE || token.tokenType === RdfToken.BASE) {
                ctx.inPrefix = true;
            }

            // Track that we have seen at least one PREFIX/@prefix directive.
            // Used to insert a blank line between the prefix block and the first subject.
            if (token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.PREFIX) {
                ctx.sawPrefixDefinition = true;
                ctx.pendingPrefixToSubjectBlankLine = true;
            }

            // Handle structural tokens
            if (this.isOpeningBracket(token)) {
                this.handleTurtleOpenBracket(ctx, token, tokens, i);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (this.isClosingBracket(token)) {
                this.handleTurtleCloseBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                this.handleTurtlePeriod(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.SEMICOLON) {
                this.handleTurtleSemicolon(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                this.handleTurtleComma(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle PREFIX/BASE IRI completion
            if (ctx.inPrefix && (token.tokenType === RdfToken.IRIREF || token.tokenType === RdfToken.IRIREF_ABS)) {
                this.handleTurtlePrefixIri(ctx, value);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            const isStatementSubjectToken =
                this.isTermToken(token) &&
                ctx.triplePosition === 0 &&
                !ctx.inPrefix &&
                !this.inBracketScope(ctx) &&
                !this.inParenScope(ctx);

            // Handle triple position tracking
            if (this.isTermToken(token) && ctx.triplePosition === 0 && !ctx.inPrefix) {
                // If the document started with prefix declarations, optionally insert
                // a blank line between the last prefix definition and the first statement subject.
                if (
                    isStatementSubjectToken &&
                    ctx.opts.prettyPrint &&
                    ctx.opts.blankLinesBetweenSubjects &&
                    ctx.lastSubject === null &&
                    ctx.sawPrefixDefinition &&
                    ctx.pendingPrefixToSubjectBlankLine
                ) {
                    ctx.needsBlankLine = true;
                    ctx.needsNewline = true;
                    ctx.needsSpace = false;
                    ctx.pendingPrefixToSubjectBlankLine = false;
                }

                // When a leading comment block consumed the prefix→subject
                // blank line, the source may still have had a blank line
                // between the last comment and this first subject.  Preserve
                // it so the visual grouping is maintained.
                if (
                    isStatementSubjectToken &&
                    ctx.opts.prettyPrint &&
                    ctx.lastSubject === null &&
                    prevWasComment &&
                    ctx.lastNonWsToken &&
                    token.startLine !== undefined &&
                    ctx.lastNonWsToken.endLine !== undefined
                ) {
                    const gapToSubject = token.startLine - ctx.lastNonWsToken.endLine;
                    if (gapToSubject > 1) {
                        ctx.needsBlankLine = true;
                        ctx.needsNewline = true;
                        ctx.needsSpace = false;
                    }
                }

                // Root-level subject separation (before each new subject block)
                if (isStatementSubjectToken &&
                    ctx.opts.prettyPrint &&
                    ctx.opts.blankLinesBetweenSubjects &&
                    ctx.lastSubject !== null &&
                    token.image !== ctx.lastSubject) {
                    // When the previous output was a comment, the blank line
                    // between subject blocks was already emitted before the
                    // comment (or should not be inserted between comment and
                    // subject).  Only request it when the last output was NOT
                    // a comment, unless the source explicitly had a blank
                    // line between the comment and this subject.
                    if (prevWasComment &&
                        ctx.lastNonWsToken &&
                        token.startLine !== undefined &&
                        ctx.lastNonWsToken.endLine !== undefined) {
                        const gapToSubject = token.startLine - ctx.lastNonWsToken.endLine;
                        if (gapToSubject > 1) {
                            ctx.needsBlankLine = true;
                        }
                    } else {
                        ctx.needsBlankLine = true;
                    }
                    ctx.needsNewline = true;
                    ctx.needsSpace = false;
                }

                if (isStatementSubjectToken) {
                    ctx.lastSubject = token.image;
                }
                if (!this.inParenScope(ctx) && !this.inBracketScope(ctx)) {
                    this.detectInlineStatement(ctx, tokens, i, ctx.opts.indent, ctx.opts.maxLineWidth);
                }
                ctx.triplePosition++;
            } else if (this.isTermToken(token) && !ctx.inPrefix) {
                ctx.triplePosition++;
                if (ctx.triplePosition > 2) ctx.triplePosition = 2;
            }

            // Handle spacing
            this.handleTurtleTokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value, le);
            ctx.needsSpace = true;

            // Option: force predicate list onto a new line after the subject.
            // Only applies to real statement subjects (not blank node property lists).
            if (isStatementSubjectToken && ctx.opts.prettyPrint && ctx.opts.newlineAfterSubject) {
                const scope = this.currentScope(ctx);
                const statementBaseIndentLevel = scope ? scope.indentLevel + 1 : 0;
                ctx.indentLevel = statementBaseIndentLevel + 1;
                ctx.inlineStatement = false;
                ctx.needsNewline = true;
                ctx.needsSpace = false;
            }

            // When a term is a direct child of a multi-line collection (...),
            // the next collection item should start on a new line.
            if (ctx.opts.prettyPrint && !ctx.inPrefix) {
                const scope = this.currentScope(ctx);
                if (scope?.type === 'paren' && scope.isMultiLine) {
                    ctx.needsNewline = true;
                    ctx.needsSpace = false;
                    ctx.lastWasNewline = false;
                }
            }

            ctx.lastToken = token;
            ctx.lastNonWsToken = token;
        }

        // Add trailing comments
        while (commentIndex < sortedComments.length) {
            this.handleTurtleComment(ctx, sortedComments[commentIndex]);
            commentIndex++;
        }

        return { output: ctx.parts.join('').trim() };
    }
}
