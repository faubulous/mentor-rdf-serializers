import { IToken, TokenType, TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken } from '@faubulous/mentor-rdf-parsers';
import { SerializerOptions } from './serializer-options';
import { mergeOptions } from './serializer-base';

/**
 * Metadata attached to each token during the analysis pass. This captures 
 * source-layout information for the emit pass.
 */
export interface TokenAnnotation {
    /**
     * Source had a newline between this token and the previous non-WS token.
     * */
    sourceNewlineBefore: boolean;

    /**
     * Source had a blank line (2+ newlines) between this token and the previous non-WS token.
     */
    sourceBlankLineBefore: boolean;

    /**
     * Number of source newlines between this token and the previous non-WS token.
     */
    sourceLineGap: number;
}

/**
 * A token together with its analysis annotation.
 */
export interface AnnotatedToken {
    /**
     * The original token from the lexer.
     */
    token: IToken;

    /**
     * The annotation describing source-layout between this token and the previous non-WS token.
     */
    annotation: TokenAnnotation;
}

/**
 * Scope entry representing a nesting level.
 */
export interface Scope {
    /**
     * Type of the scope delimiter.
     */
    type: 'curly' | 'bracket' | 'paren';

    /**
     * Whether the block is formatted inline (no line breaks).
     */
    isInline: boolean;

    /**
     * Whether the block spans multiple source lines.
     */
    isMultiLine: boolean;

    /**
     * The indent level when this scope was entered.
     */
    indentLevel: number;
}

/**
 * Base formatting context with fields shared by all token-based formatters.
 * Subclasses extend this to add format-specific state.
 */
export interface BaseFormatterContext {
    /**
     * Accumulated output parts.
     */
    parts: string[];

    /**
     * Current indent nesting level.
     */
    indentLevel: number;

    /**
     * Current line length (for wrapping).
     */
    currentLineLength: number;

    /**
     * The scope stack.
     */
    scopeStack: Scope[];

    /**
     * A newline should be emitted before the next token.
     */
    needsNewline: boolean;

    /**
     * A blank line should be emitted before the next token.
     */
    needsBlankLine: boolean;

    /**
     * A space should be emitted before the next token.
     */
    needsSpace: boolean;

    /**
     * Whether the pending newline originated from source positions.
     */
    sourceNewline: boolean;

    /**
     * The last token that was processed (including whitespace and comments).
     */
    lastToken: IToken | null;

    /**
     * The last non-whitespace token that was processed (excluding WS but including comments).
     */
    lastNonWsToken: IToken | null;

    /**
     * Indicates whether the last emitted part ended with a newline (for spacing decisions).
     */
    lastWasNewline: boolean;

    /**
     * Indicates whether the last emitted part was a comment (for spacing decisions).
     */
    lastWasComment: boolean;

    /**
     * Whether we are inside a prefix/base declaration.
     */
    inPrefix: boolean;

    /**
     * Triple position counter (0=subject, 1=predicate, 2=object).
     */
    triplePosition: number;

    /**
     * Last-seen subject image (for blank line insertion).
     */
    lastSubject: string | null;

    /**
     * Whether the current statement should be rendered on a single line.
     */
    inlineStatement: boolean;
}

/**
 * Options common to all token-based formatters.
 */
export interface BaseFormatterOptions extends SerializerOptions {
    /**
     * Add a space before punctuation (. and ;). Default: false.
     */
    spaceBeforePunctuation?: boolean;
}

/**
 * Abstract base class for all token-based RDF formatters.
 */
export abstract class TokenFormatterBase<
    TContext extends BaseFormatterContext = BaseFormatterContext,
    TOptions extends BaseFormatterOptions = BaseFormatterOptions,
> {
    /**
     * Merge user options with defaults. Must be implemented by subclasses.
     * @param options User-provided options (may be partial).
     */
    protected abstract getOptions(options?: TOptions): Required<TOptions>;

    /**
     * Create the initial context. Subclasses extend the base context.
     * @param options The merged options.
     */
    protected abstract createContext(options: Required<TOptions>): TContext;

    /**
     * Format a token's image (e.g. keyword casing).
     * @param token The token to format.
     * @param options The merged options.
     * @return The formatted token string to emit. (Default: token.image)
     */
    protected formatTokenValue(token: IToken, _options: Required<TOptions>): string {
        return token.image;
    }

    /**
     * Indicates whether a token is a keyword (for spacing decisions).
     * @param token The token to check.
     * @returns `true` if the token is a keyword, `false` otherwise. (Default: false)
     */
    protected isKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isKeyword === true;
    }

    /**
     * Indicates whether a token is a keyword that should be lowercased (for spacing decisions).
     * @param token The token to check.
     * @returns `true` if the token is a lowercase-only keyword, `false` otherwise. (Default: false)
     */
    protected isLowercaseOnly(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isLowercaseOnly === true;
    }

    /**
     * Indicates whether a token is a term (IRI, literal, variable) for spacing decisions.
     * @param token The token to check.
     * @returns `true` if the token is a term, `false` otherwise. (Default: false)
     */
    protected isTermToken(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isTerm === true;
    }

    /**
     * Indicates whether a token is a function keyword (for spacing decisions).
     * @param token The token to check.
     * @returns `true` if the token is a function keyword, `false` otherwise. (Default: false)
     */
    protected isFunctionKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isFunction === true;
    }

    /**
     * Indicates whether a token is a major clause keyword (e.g. SELECT, WHERE) for spacing decisions.
     * @param token The token to check.
     * @returns `true` if the token is a major clause keyword, `false` otherwise. (Default: false)
     */
    protected isMajorClauseKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isMajorClause === true;
    }

    /**
     * Indicates whether a token is a newline keyword (for spacing decisions).
     * @param token The token to check.
     * @returns `true` if the token is a newline keyword, `false` otherwise. (Default: false)
     */
    protected isNewlineKeyword(token: IToken): boolean {
        return (token.tokenType as TokenType & TokenMetadata)?.isNewlineKeyword === true;
    }

    /**
     * Indicates whether a token is an opening bracket (for scope management).
     * @param token The token to check.
     * @returns `true` if the token is an opening bracket, `false` otherwise. (Default: false)
     */
    protected isOpeningBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.LBRACKET ||
            token.tokenType === RdfToken.LPARENT ||
            token.tokenType === RdfToken.OPEN_ANNOTATION ||
            token.tokenType === RdfToken.OPEN_REIFIED_TRIPLE ||
            token.tokenType === RdfToken.OPEN_TRIPLE_TERM;
    }

    /**
     * Indicates whether a token is a closing bracket (for scope management).
     * @param token The token to check.
     * @returns `true` if the token is a closing bracket, `false` otherwise. (Default: false)
     */
    protected isClosingBracket(token: IToken): boolean {
        return token.tokenType === RdfToken.RBRACKET ||
            token.tokenType === RdfToken.RPARENT ||
            token.tokenType === RdfToken.CLOSE_ANNOTATION ||
            token.tokenType === RdfToken.CLOSE_REIFIED_TRIPLE ||
            token.tokenType === RdfToken.CLOSE_TRIPLE_TERM;
    }

    /**
     * Push a new scope.
     * @param context The formatting context.
     * @param type The type of the scope.
     * @param isInline Whether the scope is inline.
     * @param isMultiLine Whether the scope is multiline.
     */
    protected pushScope(context: TContext, type: Scope['type'], isInline: boolean, isMultiLine: boolean): void {
        context.scopeStack.push({
            type,
            isInline,
            isMultiLine,
            indentLevel: context.indentLevel,
        });

        context.indentLevel++;
    }

    /**
     * Pop the current scope. Returns it, or undefined if the stack is empty.
     * @param context The formatting context.
     * @returns The popped scope, or `undefined` if the stack is empty.
     */
    protected popScope(context: TContext): Scope | undefined {
        const scope = context.scopeStack.pop();

        if (scope) {
            context.indentLevel = scope.indentLevel;
        }

        return scope;
    }

    /**
     * The current innermost scope, or `undefined`.
     * @param context The formatting context.
     * @returns The current innermost scope, or `undefined` if the stack is empty.
     */
    protected currentScope(context: TContext): Scope | undefined {
        return context.scopeStack[context.scopeStack.length - 1];
    }

    /**
     * Indicates if we are inside a bracket scope (blank-node property list).
     * @param context The formatting context.
     * @returns `true` if inside a bracket scope, `false` otherwise.
     */
    protected inBracketScope(context: TContext): boolean {
        return context.scopeStack.some(s => s.type === 'bracket');
    }

    /**
     * Append text to the output and track line length.
     * @param context The formatting context.
     * @param text The text to append.
     * @param lineEnd The line ending string.
     * @param forceNewline Whether to force a newline.
     */
    protected addPart(context: TContext, text: string, lineEnd: string, forceNewline = false): void {
        context.parts.push(text);

        if (forceNewline || text === lineEnd || text.includes(lineEnd)) {
            const lines = text.split(lineEnd);
            context.currentLineLength = lines[lines.length - 1].length;
        } else {
            context.currentLineLength += text.length;
        }
    }

    /**
     * Get indentation string for a level.
     * @param level The indentation level.
     * @param indent The string to use for a single indentation level.
     * @returns The indentation string for the given level.
     */
    protected getIndent(level: number, indent: string): string {
        return indent.repeat(level);
    }

    /**
     * Indicates if a wrap is needed.
     * @param context The formatting context.
     * @param nextLength The length of the next token or text segment.
     * @param maxLineWidth The maximum allowed line width.
     * @returns `true` if a wrap is needed, `false` otherwise.
     */
    protected shouldWrap(context: TContext, nextLength: number, maxLineWidth: number): boolean {
        return maxLineWidth > 0 && context.currentLineLength + nextLength > maxLineWidth;
    }

    /**
     * Scans forward from `startIndex` to the statement-terminating period
     * (at nesting depth 0) and determines whether the source had the
     * entire statement on a single line.
     *
     * Nested brackets `[]` and parentheses `()` are traversed but their 
     * tokens are counted towards the total length.  Comments force multi-line.
     * 
     * @returns The approximate inline character-length of the statement,
     * or `-1` if the source contained newlines within the statement (meaning 
     * the author intended multi-line layout).
     */
    protected calculateStatementLength(tokens: IToken[], startIndex: number): number {
        let length = 0;
        let depth = 0;
        let lastEndLine: number | undefined;
        let count = 0;

        for (let i = startIndex; i < tokens.length; i++) {
            const t = tokens[i];

            if (t.tokenType === RdfToken.WS) {
                continue;
            }

            // A comment anywhere in the statement forces multi-line.
            if (t.tokenType === RdfToken.COMMENT) {
                return -1;
            }

            // Check whether a closing delimiter closes an *enclosing* scope
            // (i.e. we started inside a bracket/paren/curly block).
            // Stop the scan without including the closer in the newline check.
            const isClosingToken = t.tokenType === RdfToken.RBRACKET ||
                t.tokenType === RdfToken.RPARENT ||
                t.tokenType === RdfToken.RCURLY;

            if (isClosingToken) {
                depth--;

                if (depth < 0) {
                    // The closing token belongs to the enclosing scope — 
                    // return the statement length accumulated so far.
                    return length + Math.max(0, count - 1);
                }
            }

            // If the source had a newline between consecutive non-WS tokens
            // the author explicitly broke the statement → multi-line.
            if (lastEndLine !== undefined &&
                t.startLine !== undefined &&
                t.startLine > lastEndLine) {
                return -1;
            }

            // Track opening delimiters.
            if (t.tokenType === RdfToken.LBRACKET ||
                t.tokenType === RdfToken.LPARENT ||
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
     * @param context The formatting context.
     * @param tokens The full token stream.
     * @param startIndex Index of the subject token.
     * @param indent The indent string for one level.
     * @param maxLineWidth The configured maximum line width (0 = no limit).
     */
    protected detectInlineStatement(context: TContext, tokens: IToken[], startIndex: number, indent: string, maxLineWidth: number): void {
        const statementLength = this.calculateStatementLength(tokens, startIndex);

        if (statementLength < 0) {
            // Source had newlines → force multi-line.
            context.inlineStatement = false;
            return;
        }

        if (maxLineWidth <= 0) {
            // No width limit – keep inline since source was inline.
            context.inlineStatement = true;
            return;
        }

        // Account for the current indent.
        const indentWidth = context.indentLevel * indent.length;
        context.inlineStatement = indentWidth + statementLength <= maxLineWidth;
    }

    /**
     * Checks if a parenthesis block (starting at `(` at index) contains
     * source newlines between the open and close parens.
     * 
     * @param tokens The full token stream.
     * @param openIndex The index of the opening parenthesis token.
     * @returns `true` if the parenthesis block contains source newlines, `false` otherwise.
     */
    protected isParenBlockMultiLine(tokens: IToken[], openIndex: number): boolean {
        const openToken = tokens[openIndex];

        let depth = 1;

        for (let i = openIndex + 1; i < tokens.length; i++) {
            const t = tokens[i];

            if (t.tokenType === RdfToken.WS) {
                continue;
            }

            if (t.tokenType === RdfToken.LPARENT) {
                depth++;
            } else if (t.tokenType === RdfToken.RPARENT) {
                depth--;

                if (depth === 0) {
                    return openToken.startLine !== undefined &&
                        t.startLine !== undefined &&
                        t.startLine > openToken.startLine;
                }
            }
        }

        return false;
    }

    /**
     * Returns a base context with all shared fields initialised. Subclasses call 
     * this and spread into their own context literal.
     * 
     * @returns A base context with all shared fields initialised.
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
     * Merges user options with defaults. Subclasses can override this to add their own options.
     * 
     * @param options User-provided options (may be partial).
     * @returns The merged options with defaults applied.
     */
    protected mergeBaseOptions(options?: SerializerOptions): Required<SerializerOptions> {
        return mergeOptions(options);
    }
}
