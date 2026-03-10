import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken, SparqlLexer } from '@faubulous/mentor-rdf-parsers';
import type {
    ISparqlFormatter,
    SerializationResult,
    SerializerOptions,
    TokenSerializerOptions
} from '../types.js';
import { mergeOptions } from '../utils.js';

/**
 * SPARQL-specific formatting options.
 */
export interface SparqlFormatterOptions extends SerializerOptions {
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

    /**
     * Whether to add a space before punctuation (. and ;).
     * Default: false
     */
    spaceBeforePunctuation?: boolean;
}

/**
 * Internal formatting context that tracks state during token processing.
 */
interface FormatterContext {
    parts: string[];
    opts: Required<SparqlFormatterOptions>;
    indentLevel: number;
    needsNewline: boolean;
    needsBlankLine: boolean;
    needsSpace: boolean;
    lastToken: IToken | null;
    lastNonWsToken: IToken | null;
    inPrefix: boolean;
    justEndedPrefix: boolean;
    inWhereBlock: boolean;
    currentLineLength: number;
    lastSubject: string | null;
    triplePosition: number;
    functionCallDepth: number;
    hasFromClause: boolean;
    isAskQuery: boolean;
    lastWasNewline: boolean;
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
 * 
 * @see https://www.w3.org/TR/sparql12-query/
 */
export class SparqlFormatter implements ISparqlFormatter {
    private lexer = new SparqlLexer();

    /**
     * Formats a SPARQL query string.
     */
    formatQuery(query: string, options?: SparqlFormatterOptions): SerializationResult {
        return this.formatSparql(query, options);
    }

    /**
     * Formats a SPARQL update string.
     */
    formatUpdate(update: string, options?: SparqlFormatterOptions): SerializationResult {
        return this.formatSparql(update, options);
    }

    /**
     * Formats SPARQL from parsed tokens.
     */
    formatFromTokens(tokens: IToken[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options as SparqlFormatterOptions);
        return this.formatTokens(tokens, opts);
    }

    /**
     * Main formatting method for SPARQL strings.
     */
    private formatSparql(input: string, options?: SparqlFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const result = this.lexer.tokenize(input);
        
        if (result.errors.length > 0) {
            // Return original input if there are lexing errors
            return { output: input };
        }
        
        // Get comments from lexer groups (they're not in the main token stream)
        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];
        
        return this.formatTokens(result.tokens, opts, comments);
    }

    /**
     * Checks if a token is a keyword (uses token metadata).
     */
    private isKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isKeyword === true;
    }

    /**
     * Checks if a token is a function keyword (uses token metadata).
     */
    private isFunctionKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isFunction === true;
    }

    /**
     * Checks if a token must remain lowercase (uses token metadata).
     */
    private isLowercaseOnly(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isLowercaseOnly === true;
    }

    /**
     * Checks if a token starts a major clause (uses token metadata).
     */
    private isMajorClauseKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isMajorClause === true;
    }

    /**
     * Checks if a token should be on a new line (uses token metadata).
     */
    private isNewlineKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isNewlineKeyword === true;
    }

    /**
     * Checks if a token is a term token (uses token metadata).
     */
    private isTermToken(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isTerm === true;
    }

    /**
     * Checks if a token is an opening bracket (parenthesis or square bracket).
     */
    private isOpeningBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.LPARENT || token.tokenType === RdfToken.LBRACKET;
    }

    /**
     * Formats the token's value with appropriate casing.
     */
    private formatTokenValue(token: IToken, opts: Required<SparqlFormatterOptions>): string {
        const image = token.image;

        // Tokens marked as lowercase-only (true, false, a) must stay lowercase
        if (this.isLowercaseOnly(token)) {
            return image.toLowerCase();
        }

        // Keywords can be uppercased or lowercased based on options
        if (this.isKeyword(token)) {
            if (opts.lowercaseKeywords) {
                return image.toLowerCase();
            } else if (opts.uppercaseKeywords) {
                return image.toUpperCase();
            }
        }

        return image;
    }

    // ========================================================================
    // Context Management
    // ========================================================================

    /**
     * Creates a new formatting context.
     */
    private createContext(opts: Required<SparqlFormatterOptions>): FormatterContext {
        return {
            parts: [],
            opts,
            indentLevel: 0,
            needsNewline: false,
            needsBlankLine: false,
            needsSpace: false,
            lastToken: null,
            lastNonWsToken: null,
            inPrefix: false,
            justEndedPrefix: false,
            inWhereBlock: false,
            currentLineLength: 0,
            lastSubject: null,
            triplePosition: 0,
            functionCallDepth: 0,
            hasFromClause: false,
            isAskQuery: false,
            lastWasNewline: false,
        };
    }

    /**
     * Adds content to output and tracks line length.
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
     * Checks if we should wrap based on maxLineWidth.
     */
    private shouldWrap(ctx: FormatterContext, nextLength: number): boolean {
        return ctx.opts.maxLineWidth > 0 && 
               ctx.currentLineLength + nextLength > ctx.opts.maxLineWidth;
    }

    // ========================================================================
    // Token Handlers
    // ========================================================================

    /**
     * Handles comment tokens from the comment group.
     */
    private handleGroupComment(ctx: FormatterContext, comment: IToken): void {
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
     * Handles inline comment tokens.
     */
    private handleInlineComment(ctx: FormatterContext, token: IToken): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, token.image);
        ctx.needsNewline = true;
        ctx.needsSpace = false;
    }

    /**
     * Handles opening brace '{'.
     */
    private handleOpenBrace(ctx: FormatterContext): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0 && ctx.opts.sameBraceLine) {
            this.addPart(ctx, ' ');
        } else if (!ctx.opts.sameBraceLine) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
        }
        this.addPart(ctx, '{');
        ctx.indentLevel++;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
        ctx.lastSubject = null;
    }

    /**
     * Handles closing brace '}'.
     */
    private handleCloseBrace(ctx: FormatterContext): void {
        ctx.indentLevel = Math.max(0, ctx.indentLevel - 1);
        if (ctx.opts.prettyPrint) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
        }
        this.addPart(ctx, '}');
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.needsSpace = false;
        ctx.inWhereBlock = false;
    }

    /**
     * Handles period '.'.
     */
    private handlePeriod(ctx: FormatterContext, nextToken: IToken | undefined): void {
        if (ctx.opts.spaceBeforePunctuation && !ctx.inPrefix && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, '.');
        
        if (ctx.inPrefix) {
            ctx.needsNewline = ctx.opts.prettyPrint;
            const nextIsPrefix = nextToken && (nextToken.tokenType === RdfToken.PREFIX || nextToken.tokenType === RdfToken.BASE);
            if (!nextIsPrefix && nextToken) {
                ctx.needsNewline = ctx.opts.prettyPrint;
            }
        } else if (ctx.indentLevel > 0) {
            ctx.needsNewline = ctx.opts.prettyPrint;
        }
        
        ctx.needsSpace = true;
        ctx.inPrefix = false;
        ctx.triplePosition = 0;
    }

    /**
     * Handles semicolon ';'.
     */
    private handleSemicolon(ctx: FormatterContext): void {
        if (ctx.opts.spaceBeforePunctuation && ctx.parts.length > 0) {
            this.addPart(ctx, ' ');
        }
        this.addPart(ctx, ';');
        
        const shouldMultiLine = ctx.opts.predicateListStyle === 'multi-line' || 
            (ctx.opts.predicateListStyle === 'first-same-line' && ctx.indentLevel > 0);
        
        if (ctx.opts.predicateListStyle === 'single-line') {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        } else if (shouldMultiLine && ctx.opts.prettyPrint && ctx.indentLevel > 0) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent) + ctx.opts.indent, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else if (ctx.opts.prettyPrint && ctx.indentLevel > 0) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent) + ctx.opts.indent, true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
            ctx.needsSpace = false;
        } else {
            ctx.needsNewline = false;
            ctx.needsSpace = true;
        }
        
        ctx.triplePosition = 1;
    }

    /**
     * Handles comma ','.
     */
    private handleComma(ctx: FormatterContext, nextToken: IToken | undefined): void {
        this.addPart(ctx, ',');
        
        if (ctx.opts.objectListStyle === 'multi-line') {
            ctx.needsNewline = ctx.opts.prettyPrint && ctx.indentLevel > 0;
            ctx.needsSpace = !ctx.needsNewline;
        } else if (ctx.opts.objectListStyle === 'auto' && ctx.opts.maxLineWidth > 0) {
            const nextObjLen = nextToken ? nextToken.image.length + 1 : 0;
            if (this.shouldWrap(ctx, nextObjLen)) {
                ctx.needsNewline = ctx.opts.prettyPrint;
                ctx.needsSpace = !ctx.needsNewline;
            } else {
                ctx.needsSpace = true;
            }
        } else {
            ctx.needsSpace = true;
        }
    }

    /**
     * Handles opening parenthesis '(' or bracket '['.
     */
    private handleOpenParen(ctx: FormatterContext, token: IToken): void {
        const isLParen = token.tokenType === RdfToken.LPARENT;
        
        if (isLParen) {
            const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);
            if (lastWasFunction) {
                ctx.functionCallDepth++;
            }
        }
        
        const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);
        
        if (ctx.needsNewline && ctx.functionCallDepth === 0 && !lastWasFunction) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (!isLParen || !lastWasFunction) {
                this.addPart(ctx, ' ');
            }
        }
        ctx.needsNewline = false;
        
        this.addPart(ctx, token.image);
        ctx.needsSpace = false;
    }

    /**
     * Handles closing parenthesis ')' or bracket ']'.
     */
    private handleCloseParen(ctx: FormatterContext, token: IToken): void {
        if (token.tokenType === RdfToken.RPARENT && ctx.functionCallDepth > 0) {
            ctx.functionCallDepth--;
        }
        this.addPart(ctx, token.image);
        ctx.needsSpace = true;
        ctx.needsNewline = false;
    }

    /**
     * Handles IRI in PREFIX/BASE declaration.
     */
    private handlePrefixIri(ctx: FormatterContext, value: string): void {
        if (ctx.needsNewline) {
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                this.addPart(ctx, ' ');
            }
        }
        this.addPart(ctx, value);
        ctx.needsSpace = false;
        ctx.needsNewline = ctx.opts.prettyPrint;
        ctx.inPrefix = false;
        ctx.justEndedPrefix = true;
    }

    // ========================================================================
    // State Tracking
    // ========================================================================

    /**
     * Updates clause tracking state.
     */
    private updateClauseState(ctx: FormatterContext, token: IToken): void {
        if (token.tokenType === RdfToken.PREFIX || token.tokenType === RdfToken.BASE) {
            ctx.inPrefix = true;
        }
        if (token.tokenType === RdfToken.WHERE) {
            ctx.inWhereBlock = true;
        }
        if (token.tokenType === RdfToken.ASK) {
            ctx.isAskQuery = true;
        }
        if (token.tokenType === RdfToken.FROM) {
            ctx.hasFromClause = true;
        }
    }

    /**
     * Handles clause separation (blank lines before major clauses).
     */
    private handleClauseSeparation(ctx: FormatterContext, token: IToken): void {
        if (ctx.opts.separateClauses && 
            this.isMajorClauseKeyword(token) && 
            ctx.parts.length > 0 &&
            !ctx.inPrefix &&
            !ctx.justEndedPrefix) {
            this.addPart(ctx, ctx.opts.lineEnd, true);
            ctx.needsNewline = true;
        }

        // Keywords that just need a newline: FROM, NAMED, WHERE
        if (ctx.opts.separateClauses &&
            this.isNewlineKeyword(token) &&
            ctx.parts.length > 0 &&
            !ctx.inPrefix) {
            if (token.tokenType === RdfToken.WHERE && ctx.isAskQuery && !ctx.hasFromClause) {
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

    /**
     * Handles triple position tracking for alignment.
     */
    private handleTriplePosition(ctx: FormatterContext, token: IToken): void {
        if (!ctx.inWhereBlock || ctx.indentLevel <= 0 || ctx.functionCallDepth > 0) {
            return;
        }
        
        if (this.isTermToken(token)) {
            if (ctx.triplePosition === 0) {
                if (ctx.opts.blankLinesBetweenSubjects && ctx.lastSubject !== null && token.image !== ctx.lastSubject) {
                    if (!ctx.needsNewline) {
                        this.addPart(ctx, ctx.opts.lineEnd, true);
                    }
                    this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
                    ctx.lastWasNewline = true;
                    ctx.needsNewline = false;
                    ctx.needsSpace = false;
                }
                ctx.lastSubject = token.image;
            }
            ctx.triplePosition++;
            if (ctx.triplePosition > 2) ctx.triplePosition = 2;
        }
    }

    /**
     * Handles line width wrapping.
     */
    private handleLineWrapping(ctx: FormatterContext, value: string): void {
        if (ctx.opts.maxLineWidth > 0 && !ctx.needsNewline && ctx.needsSpace) {
            const spaceNeeded = ctx.parts.length > 0 && ctx.lastNonWsToken && 
                !this.isOpeningBracket(ctx.lastNonWsToken) ? 1 : 0;
            if (this.shouldWrap(ctx, spaceNeeded + value.length)) {
                this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
                ctx.lastWasNewline = true;
                ctx.needsNewline = false;
                ctx.needsSpace = false;
            }
        }
    }

    /**
     * Handles token spacing (newlines and spaces).
     */
    private handleTokenSpacing(ctx: FormatterContext, token: IToken): void {
        const isDatatypeContext = token.tokenType === RdfToken.DCARET || 
            ctx.lastNonWsToken?.tokenType === RdfToken.DCARET;
        const inFunctionCall = ctx.functionCallDepth > 0;
        const shouldAvoidNewline = isDatatypeContext || inFunctionCall;
        
        if (ctx.needsNewline && !shouldAvoidNewline) {
            if (ctx.needsBlankLine && !ctx.lastWasNewline) {
                this.addPart(ctx, ctx.opts.lineEnd, true);
                ctx.needsBlankLine = false;
            }
            this.addPart(ctx, ctx.opts.lineEnd + this.getIndent(ctx.indentLevel, ctx.opts.indent), true);
            ctx.lastWasNewline = true;
            ctx.needsNewline = false;
        } else if (ctx.needsSpace && ctx.parts.length > 0) {
            if (ctx.lastNonWsToken && !this.isOpeningBracket(ctx.lastNonWsToken)) {
                const isOpenParen = token.tokenType === RdfToken.LPARENT;
                const lastWasFunction = ctx.lastNonWsToken && this.isFunctionKeyword(ctx.lastNonWsToken);
                if (!(isOpenParen && lastWasFunction) && !isDatatypeContext) {
                    this.addPart(ctx, ' ');
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
    }

    /**
     * Detects blank lines from token positions.
     */
    private detectBlankLines(ctx: FormatterContext, token: IToken): void {
        if (ctx.lastNonWsToken && token.startLine !== undefined && ctx.lastNonWsToken.endLine !== undefined) {
            const lineGap = token.startLine - ctx.lastNonWsToken.endLine;
            if (lineGap > 1) {
                ctx.needsBlankLine = true;
                ctx.needsNewline = true;
            }
        }
    }

    // ========================================================================
    // Main Formatting Method
    // ========================================================================

    /**
     * Formats tokens into a string.
     */
    private formatTokens(tokens: IToken[], opts: Required<SparqlFormatterOptions>, comments: IToken[] = []): SerializationResult {
        const ctx = this.createContext(opts);
        const sortedComments = [...comments].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
        let commentIndex = 0;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const nextToken = tokens[i + 1];

            // Insert comments that appear before this token
            while (commentIndex < sortedComments.length) {
                const comment = sortedComments[commentIndex];
                if ((comment.startOffset ?? 0) < (token.startOffset ?? 0)) {
                    this.handleGroupComment(ctx, comment);
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

            // Detect blank lines
            this.detectBlankLines(ctx, token);

            // Handle comment tokens in stream
            if (token.tokenType === RdfToken.COMMENT) {
                this.handleInlineComment(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            const value = this.formatTokenValue(token, opts);

            // Update clause state
            this.updateClauseState(ctx, token);

            // Handle clause separation
            this.handleClauseSeparation(ctx, token);

            // Handle structural tokens
            if (token.tokenType === RdfToken.LCURLY) {
                this.handleOpenBrace(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RCURLY) {
                this.handleCloseBrace(ctx);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.PERIOD) {
                this.handlePeriod(ctx, nextToken);
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
                this.handleComma(ctx, nextToken);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.LPARENT || token.tokenType === RdfToken.LBRACKET) {
                this.handleOpenParen(ctx, token);
                ctx.lastToken = token;
                ctx.lastNonWsToken = token;
                continue;
            }

            if (token.tokenType === RdfToken.RPARENT || token.tokenType === RdfToken.RBRACKET) {
                this.handleCloseParen(ctx, token);
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
            this.handleTriplePosition(ctx, token);

            // Handle line wrapping
            this.handleLineWrapping(ctx, value);

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
            this.handleGroupComment(ctx, sortedComments[commentIndex]);
            commentIndex++;
        }

        return { output: ctx.parts.join('').trim() };
    }

    /**
     * Gets the indentation string for a given level.
     */
    private getIndent(level: number, indent: string): string {
        return indent.repeat(level);
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: SparqlFormatterOptions): Required<SparqlFormatterOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            uppercaseKeywords: options?.uppercaseKeywords ?? true,
            lowercaseKeywords: options?.lowercaseKeywords ?? false,
            alignPatterns: options?.alignPatterns ?? true,
            sameBraceLine: options?.sameBraceLine ?? true,
            separateClauses: options?.separateClauses ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            // Use inherited options with sensible SPARQL defaults
            maxLineWidth: options?.maxLineWidth ?? base.maxLineWidth,
            alignPredicates: options?.alignPredicates ?? base.alignPredicates,
            alignObjects: options?.alignObjects ?? base.alignObjects,
            objectListStyle: options?.objectListStyle ?? base.objectListStyle,
            predicateListStyle: options?.predicateListStyle ?? base.predicateListStyle,
            blankLinesBetweenSubjects: options?.blankLinesBetweenSubjects ?? base.blankLinesBetweenSubjects
        };
    }
}
