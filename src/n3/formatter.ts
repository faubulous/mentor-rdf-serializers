import type { IToken } from 'chevrotain';
import { RdfToken, N3Lexer } from '@faubulous/mentor-rdf-parsers';
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

// ============================================================================
// Options & Context
// ============================================================================

/**
 * N3-specific formatting options.
 */
export interface N3FormatterOptions extends BaseFormatterOptions {
    /**
     * Use lowercase for @prefix and @base.
     * Default: true
     */
    lowercaseDirectives?: boolean;

    /**
     * Put opening braces on the same line.
     * Default: true
     */
    sameBraceLine?: boolean;
}

/**
 * Internal formatting context for N3.
 */
interface N3FormatterContext extends BaseFormatterContext {
    opts: Required<N3FormatterOptions>;
}

// ============================================================================
// N3Formatter
// ============================================================================

/**
 * Formatter for Notation3 (N3).
 *
 * N3 extends Turtle with formulas (graph literals), implications (`=>`),
 * reverse implications (`<=`), quick variables, and other features.
 * Uses the scope stack for both formula braces (curly) and blank node
 * brackets, replacing the manual `formulaDepth` / `blankNodeDepth` counters.
 *
 * @see https://www.w3.org/TeamSubmission/n3/
 */
export class N3Formatter
    extends BaseTokenFormatter<N3FormatterContext, N3FormatterOptions>
    implements IRdfFormatter
{
    readonly syntax: RdfSyntaxType = RdfSyntax.N3;
    private lexer = new N3Lexer();

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Formats an N3 document.
     */
    format(input: string, options?: N3FormatterOptions): SerializationResult {
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
    formatFromTokens(tokens: IToken[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options as N3FormatterOptions);
        return this.formatTokens(tokens, opts);
    }

    // ========================================================================
    // BaseTokenFormatter implementations
    // ========================================================================

    protected getOptions(options?: N3FormatterOptions): Required<N3FormatterOptions> {
        const base = this.mergeBaseOptions(options);
        return {
            ...base,
            lowercaseDirectives: options?.lowercaseDirectives ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            sameBraceLine: options?.sameBraceLine ?? true,
        };
    }

    protected createContext(opts: Required<N3FormatterOptions>): N3FormatterContext {
        return {
            ...this.createBaseContext(),
            opts,
        };
    }

    protected formatTokenValue(token: IToken, opts: Required<N3FormatterOptions>): string {
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

    /**
     * Handles comment tokens.
     */
    private handleN3Comment(ctx: N3FormatterContext, comment: IToken): void {
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

    /**
     * Handles opening curly brace (formula start).
     * Uses the scope stack to track formula nesting.
     */
    private handleN3OpenCurly(ctx: N3FormatterContext): void {
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
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles closing curly brace (formula end).
     * Pops the curly scope.
     */
    private handleN3CloseCurly(ctx: N3FormatterContext): void {
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
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles opening bracket tokens ([ for blank nodes, ( for collections).
     */
    private handleN3OpenBracket(ctx: N3FormatterContext, token: IToken): void {
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
     * Handles closing bracket tokens (] for blank nodes, ) for collections).
     */
    private handleN3CloseBracket(ctx: N3FormatterContext, token: IToken): void {
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

    /**
     * Handles period (statement terminator).
     */
    private handleN3Period(ctx: N3FormatterContext): void {
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

    /**
     * Handles semicolon (predicate separator).
     * Always adds extra indent for continuation.
     */
    private handleN3Semicolon(ctx: N3FormatterContext): void {
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
    private handleN3Comma(ctx: N3FormatterContext): void {
        const le = ctx.opts.lineEnd;
        this.addPart(ctx, ',', le);
        ctx.needsSpace = true;
    }

    /**
     * Handles N3 implication operator =>.
     */
    private handleN3Implication(ctx: N3FormatterContext): void {
        const le = ctx.opts.lineEnd;
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, '=>', le);
        ctx.needsSpace = true;
    }

    /**
     * Handles N3 reverse implication operator <=.
     */
    private handleN3ReverseImplication(ctx: N3FormatterContext): void {
        const le = ctx.opts.lineEnd;
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, '<=', le);
        ctx.needsSpace = true;
    }

    /**
     * Handles PREFIX/BASE IRI completion.
     */
    private handleN3PrefixIri(ctx: N3FormatterContext, value: string): void {
        const le = ctx.opts.lineEnd;
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ', le);
        }
        this.addPart(ctx, value, le);
        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
    }

    /**
     * Handles token spacing.
     * N3 additionally suppresses space after opening curly braces.
     */
    private handleN3TokenSpacing(ctx: N3FormatterContext, token: IToken): void {
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
        opts: Required<N3FormatterOptions>,
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
                    this.handleN3Comment(ctx, comment);
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
                this.handleN3Comment(ctx, token);
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

            // Handle formula braces (must come before generic bracket handling)
            if (token.tokenType === RdfToken.LCURLY) {
                this.handleN3OpenCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                this.handleN3CloseCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle N3 implications
            if (token.tokenType === RdfToken.IMPLIES) {
                this.handleN3Implication(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.IMPLIED_BY) {
                this.handleN3ReverseImplication(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle structural tokens
            if (this.isOpeningBracket(token)) {
                this.handleN3OpenBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (this.isClosingBracket(token)) {
                this.handleN3CloseBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                this.handleN3Period(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.SEMICOLON) {
                this.handleN3Semicolon(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                this.handleN3Comma(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle PREFIX/BASE IRI completion
            if (ctx.inPrefix && (token.tokenType === RdfToken.IRIREF || token.tokenType === RdfToken.IRIREF_ABS)) {
                this.handleN3PrefixIri(ctx, value);
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
            this.handleN3TokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value, le);
            ctx.needsSpace = true;
            ctx.lastToken = token;
            ctx.lastNonWsToken = token;
        }

        // Add trailing comments
        while (commentIndex < sortedComments.length) {
            this.handleN3Comment(ctx, sortedComments[commentIndex]);
            commentIndex++;
        }

        return { output: ctx.parts.join('').trim() };
    }
}
