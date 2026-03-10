import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken, N3Lexer } from '@faubulous/mentor-rdf-parsers';
import type {
    IRdfFormatter,
    SerializationResult,
    SerializerOptions,
    TokenSerializerOptions,
    RdfSyntax as RdfSyntaxType
} from '../types.js';
import { RdfSyntax } from '../types.js';
import { mergeOptions } from '../utils.js';

/**
 * N3-specific formatting options.
 */
export interface N3FormatterOptions extends SerializerOptions {
    /**
     * Use lowercase for @prefix and @base.
     * Default: true
     */
    lowercaseDirectives?: boolean;

    /**
     * Add a space before punctuation like . and ;
     * Default: false
     */
    spaceBeforePunctuation?: boolean;

    /**
     * Put opening braces on the same line.
     * Default: true
     */
    sameBraceLine?: boolean;

    /**
     * Add a blank line between subjects.
     * Default: false
     */
    blankLinesBetweenSubjects?: boolean;
}

/**
 * Internal formatting context for N3.
 */
interface FormatterContext {
    parts: string[];
    opts: Required<N3FormatterOptions>;
    indentLevel: number;
    needsNewline: boolean;
    needsSpace: boolean;
    lastToken: IToken | null;
    lastNonWsToken: IToken | null;
    inPrefix: boolean;
    currentLineLength: number;
    triplePosition: number;
    lastSubject: string | null;
    lastWasNewline: boolean;
    blankNodeDepth: number;
    formulaDepth: number;
}

/**
 * Formatter for Notation3 (N3).
 * 
 * N3 extends Turtle with formulas (graph literals), implications,
 * quick variables, and other features.
 * 
 * @see https://www.w3.org/TeamSubmission/n3/
 */
export class N3Formatter implements IRdfFormatter {
    readonly syntax: RdfSyntaxType = RdfSyntax.N3;
    private lexer = new N3Lexer();

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

    /**
     * Checks if a token is a keyword.
     */
    private isKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isKeyword === true;
    }

    /**
     * Checks if a token must remain lowercase.
     */
    private isLowercaseOnly(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isLowercaseOnly === true;
    }

    /**
     * Checks if a token is an opening bracket.
     */
    private isOpeningBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.LBRACKET ||
               token.tokenType === RdfToken.LPARENT;
    }

    /**
     * Checks if a token is a closing bracket.
     */
    private isClosingBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.RBRACKET ||
               token.tokenType === RdfToken.RPARENT;
    }

    /**
     * Checks if a token is a term token.
     */
    private isTermToken(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isTerm === true;
    }

    /**
     * Formats the token's value with appropriate casing.
     */
    private formatTokenValue(token: IToken, opts: Required<N3FormatterOptions>): string {
        const tokenType = token.tokenType;

        if (this.isLowercaseOnly(token)) {
            return token.image.toLowerCase();
        }

        if (tokenType === RdfToken.TTL_PREFIX || tokenType === RdfToken.TTL_BASE) {
            return opts.lowercaseDirectives ? token.image.toLowerCase() : token.image.toUpperCase().replace('@', '');
        }

        if (tokenType === RdfToken.PREFIX || tokenType === RdfToken.BASE) {
            return opts.lowercaseDirectives ? '@' + token.image.toLowerCase() : token.image.toUpperCase();
        }

        return token.image;
    }

    /**
     * Creates a new formatting context.
     */
    private createContext(opts: Required<N3FormatterOptions>): FormatterContext {
        return {
            parts: [],
            opts,
            indentLevel: 0,
            needsNewline: false,
            needsSpace: false,
            lastToken: null,
            lastNonWsToken: null,
            inPrefix: false,
            currentLineLength: 0,
            triplePosition: 0,
            lastSubject: null,
            lastWasNewline: false,
            blankNodeDepth: 0,
            formulaDepth: 0,
        };
    }

    /**
     * Adds content to output.
     */
    private addPart(ctx: FormatterContext, text: string, forceNewline = false): void {
        const lineEnd = ctx.opts.lineEnd;
        if (forceNewline || text === lineEnd || text.includes(lineEnd)) {
            ctx.parts.push(text);
            const lines = text.split(lineEnd);
            ctx.currentLineLength = lines[lines.length - 1].length;
        } else {
            ctx.parts.push(text);
            ctx.currentLineLength += text.length;
        }
    }

    /**
     * Gets the indentation string for a given level.
     */
    private getIndent(level: number, indent: string): string {
        return indent.repeat(level);
    }

    /**
     * Handles comment tokens.
     */
    private handleComment(ctx: FormatterContext, comment: IToken): void {
        if (ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && comment.startLine !== undefined &&
                ctx.lastNonWsToken.endLine !== undefined &&
                comment.startLine > ctx.lastNonWsToken.endLine) {
                this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
                ctx.lastWasNewline = true;
            } else {
                this.addPart(ctx, ' ');
            }
        }
        this.addPart(ctx, comment.image);
        ctx.needsNewline = true;
        ctx.needsSpace = false;
    }

    /**
     * Handles opening curly brace (formula start).
     */
    private handleOpenCurly(ctx: FormatterContext): void {
        if (ctx.needsNewline && !ctx.opts.sameBraceLine) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }

        this.addPart(ctx, '{');
        ctx.formulaDepth++;
        ctx.indentLevel++;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles closing curly brace (formula end).
     */
    private handleCloseCurly(ctx: FormatterContext): void {
        ctx.formulaDepth = Math.max(0, ctx.formulaDepth - 1);
        ctx.indentLevel = Math.max(0, ctx.indentLevel - 1);

        if (ctx.opts.prettyPrint) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
        }

        this.addPart(ctx, '}');
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles opening bracket tokens.
     */
    private handleOpenBracket(ctx: FormatterContext, token: IToken): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }

        this.addPart(ctx, token.image);

        if (token.tokenType === RdfToken.LBRACKET) {
            ctx.blankNodeDepth++;
            ctx.indentLevel++;
            ctx.needsNewline = ctx.opts.prettyPrint;
        }

        ctx.needsSpace = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles closing bracket tokens.
     */
    private handleCloseBracket(ctx: FormatterContext, token: IToken): void {
        if (token.tokenType === RdfToken.RBRACKET && ctx.blankNodeDepth > 0) {
            ctx.blankNodeDepth--;
            ctx.indentLevel = Math.max(0, ctx.indentLevel - 1);
            if (ctx.opts.prettyPrint) {
                this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
                ctx.lastWasNewline = true;
            }
        }

        this.addPart(ctx, token.image);
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles period.
     */
    private handlePeriod(ctx: FormatterContext): void {
        if (ctx.opts.spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, '.');
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = true;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
    }

    /**
     * Handles semicolon.
     */
    private handleSemicolon(ctx: FormatterContext): void {
        if (ctx.opts.spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, ';');

        if (ctx.opts.prettyPrint && ctx.indentLevel > 0) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent) + ctx.opts.indent, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else if (ctx.opts.prettyPrint) {
            this.addPart(ctx, ctx.opts.lineEnd + ctx.opts.indent, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else {
            ctx.needsSpace = true;
        }

        ctx.triplePosition = 1;
    }

    /**
     * Handles comma.
     */
    private handleComma(ctx: FormatterContext): void {
        this.addPart(ctx, ',');
        ctx.needsSpace = true;
    }

    /**
     * Handles N3 implication operator =>.
     */
    private handleImplication(ctx: FormatterContext): void {
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, '=>');
        ctx.needsSpace = true;
    }

    /**
     * Handles N3 reverse implication operator <=.
     */
    private handleReverseImplication(ctx: FormatterContext): void {
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, '<=');
        ctx.needsSpace = true;
    }

    /**
     * Handles prefix IRI.
     */
    private handlePrefixIri(ctx: FormatterContext, value: string): void {
        if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, value);
        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
    }

    /**
     * Handles token spacing.
     */
    private handleTokenSpacing(ctx: FormatterContext, token: IToken): void {
        const isDatatypeContext = token.tokenType === RdfToken.DCARET ||
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const isLangTag = token.tokenType === RdfToken.LANGTAG;

        if (ctx.needsNewline && !isDatatypeContext && !isLangTag) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && !isDatatypeContext && !isLangTag) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken) &&
                ctx.lastNonWsToken.tokenType !== RdfToken.LCURLY) {
                this.addPart(ctx, ' ');
            }
            ctx.lastWasNewline = false;
        } else {
            ctx.lastWasNewline = false;
        }
    }

    /**
     * Formats tokens into a string.
     */
    private formatTokens(
        tokens: IToken[],
        opts: Required<N3FormatterOptions>,
        comments: IToken[] = []
    ): SerializationResult {
        const ctx = this.createContext(opts);
        const sortedComments = [...comments].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
        let commentIndex = 0;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Insert comments
            while (commentIndex < sortedComments.length) {
                const comment = sortedComments[commentIndex];
                if ((comment.startOffset ?? 0) < (token.startOffset ?? 0)) {
                    this.handleComment(ctx, comment);
                    commentIndex++;
                } else {
                    break;
                }
            }

            // Skip whitespace
            if (token.tokenType === RdfToken.WS) {
                ctx.lastToken = token;
                continue;
            }

            // Handle comments
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleComment(ctx, token);
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

            // Handle formula braces
            if (token.tokenType === RdfToken.LCURLY) {
                this.handleOpenCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                this.handleCloseCurly(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle N3 implications
            if (token.tokenType === RdfToken.IMPLIES) {
                this.handleImplication(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.IMPLIED_BY) {
                this.handleReverseImplication(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle structural tokens
            if (this.isOpeningBracket(token)) {
                this.handleOpenBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (this.isClosingBracket(token)) {
                this.handleCloseBracket(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                this.handlePeriod(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.SEMICOLON) {
                this.handleSemicolon(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.COMMA) {
                this.handleComma(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle PREFIX/BASE IRI completion
            if (ctx.inPrefix && (token.tokenType === RdfToken.IRIREF || token.tokenType === RdfToken.IRIREF_ABS)) {
                this.handlePrefixIri(ctx, value);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            // Handle triple position tracking
            if (this.isTermToken(token) && ctx.triplePosition === 0 && !ctx.inPrefix) {
                if (opts.blankLinesBetweenSubjects && ctx.lastSubject !== null && token.image !== ctx.lastSubject) {
                    if (!ctx.needsNewline && ctx.parts.length > 0) {
                        this.addPart(ctx, ctx.opts.lineEnd, true);
                    }
                }
                ctx.lastSubject = token.image;
                ctx.triplePosition++;
            } else if (this.isTermToken(token) && !ctx.inPrefix) {
                ctx.triplePosition++;
                if (ctx.triplePosition > 2) ctx.triplePosition = 2;
            }

            // Handle spacing
            this.handleTokenSpacing(ctx, token);

            // Output the token
            this.addPart(ctx, value);
            ctx.needsSpace = true;
            ctx.lastToken = token;
            ctx.lastNonWsToken = token;
        }

        // Add trailing comments
        while (commentIndex < sortedComments.length) {
            this.handleComment(ctx, sortedComments[commentIndex]);
            commentIndex++;
        }

        return { output: ctx.parts.join('').trim() };
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: N3FormatterOptions): Required<N3FormatterOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            lowercaseDirectives: options?.lowercaseDirectives ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            sameBraceLine: options?.sameBraceLine ?? true,
            blankLinesBetweenSubjects: options?.blankLinesBetweenSubjects ?? false,
        };
    }
}
