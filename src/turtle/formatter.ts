import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken, TurtleLexer } from '@faubulous/mentor-rdf-parsers';
import type {
    IRdfFormatter,
    SerializationResult,
    TokenSerializerOptions,
    RdfSyntax as RdfSyntaxType
} from '../types.js';
import { RdfSyntax } from '../types.js';
import {
    BaseTokenFormatter,
    type BaseFormatterContext,
    type BaseFormatterOptions,
} from '../base-token-formatter.js';

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
}

/**
 * Internal formatting context for Turtle.
 */
interface TurtleFormatterContext extends BaseFormatterContext {
    opts: Required<TurtleFormatterOptions>;
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
    extends BaseTokenFormatter<TurtleFormatterContext, TurtleFormatterOptions>
    implements IRdfFormatter
{
    readonly syntax: RdfSyntaxType = RdfSyntax.Turtle;
    protected lexer = new TurtleLexer();

    // ========================================================================
    // Public API
    // ========================================================================

    format(input: string, options?: TurtleFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const result = this.lexer.tokenize(input);

        if (result.errors.length > 0) {
            return { output: input };
        }

        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];
        return this.formatTokens(result.tokens, opts, comments);
    }

    formatFromTokens(tokens: IToken[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options as TurtleFormatterOptions);
        return this.formatTokens(tokens, opts);
    }

    // ========================================================================
    // BaseTokenFormatter implementations
    // ========================================================================

    protected getOptions(options?: TurtleFormatterOptions): Required<TurtleFormatterOptions> {
        const base = this.mergeBaseOptions(options);
        return {
            ...base,
            lowercaseDirectives: options?.lowercaseDirectives ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
        };
    }

    protected createContext(opts: Required<TurtleFormatterOptions>): TurtleFormatterContext {
        return {
            ...this.createBaseContext(),
            opts,
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
        if (ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine) {
                this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                ctx.lastWasNewline = true;
            } else {
                this.addPart(ctx, ' ', le);
            }
        }
        this.addPart(ctx, comment.image, le);
        ctx.needsNewline = true;
        ctx.needsSpace = false;
    }

    protected handleTurtleOpenBracket(ctx: TurtleFormatterContext, token: IToken): void {
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

    protected handleTurtleCloseBracket(ctx: TurtleFormatterContext, token: IToken): void {
        const le = ctx.opts.lineEnd;
        const ind = ctx.opts.indent;
        if (token.tokenType === RdfToken.RBRACKET) {
            const scope = this.currentScope(ctx);
            if (scope?.type === 'bracket') {
                this.popScope(ctx);
                if (ctx.opts.prettyPrint) {
                    this.addPart(ctx, le + this.getIndent(ctx.indentLevel, ind), le, true);
                    ctx.lastWasNewline = true;
                }
            }
        }

        this.addPart(ctx, token.image, le);
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    protected handleTurtlePeriod(ctx: TurtleFormatterContext): void {
        const le = ctx.opts.lineEnd;
        if (ctx.opts.spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, '.', le);
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = true;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
        ctx.inlineStatement = false;
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

            // Handle comment tokens in stream
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleTurtleComment(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            const value = this.formatTokenValue(token, opts);

            // Track prefix declarations
            if (token.tokenType === RdfToken.TTL_PREFIX || token.tokenType === RdfToken.PREFIX ||
                token.tokenType === RdfToken.TTL_BASE || token.tokenType === RdfToken.BASE) {
                ctx.inPrefix = true;
            }

            // Handle structural tokens
            if (this.isOpeningBracket(token)) {
                this.handleTurtleOpenBracket(ctx, token);
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

            // Handle triple position tracking
            if (this.isTermToken(token) && ctx.triplePosition === 0 && !ctx.inPrefix) {
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
            this.handleTurtleTokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value, le);
            ctx.needsSpace = true;
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
