import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken } from '@faubulous/mentor-rdf-parsers';
import type {
    SerializationResult,
    SourceMapEntry,
    TokenSerializerOptions
} from './types.js';
import { escapeIri, escapeString, mergeOptions } from './utils.js';

/**
 * Chevrotain token interface (subset of IToken).
 */
export interface Token {
    image: string;
    startOffset: number;
    endOffset?: number;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
    tokenType: TokenType & Partial<TokenMetadata>;
    payload?: {
        blankNodeId?: string;
        [key: string]: unknown;
    };
}

/**
 * Checks if a token is a whitespace token.
 */
function isWhitespaceToken(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isWhitespace === true ||
           token.tokenType === RdfToken.WS ||
           name === 'WS' || name === 'NL' || name === 'NEWLINE';
}

/**
 * Checks if a token is a comment token.
 */
function isCommentToken(token: Token): boolean {
    return token.tokenType.isComment === true ||
           token.tokenType === RdfToken.COMMENT ||
           token.tokenType.name === 'COMMENT';
}

/**
 * Checks if a token is a blank node token.
 */
function isBlankNodeType(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isBlankNodeScope === true ||
           token.tokenType === RdfToken.BLANK_NODE_LABEL ||
           token.tokenType === RdfToken.LBRACKET ||
           token.tokenType === RdfToken.LPARENT ||
           token.tokenType === RdfToken.OPEN_ANNOTATION ||
           token.tokenType === RdfToken.TILDE ||
           token.tokenType === RdfToken.OPEN_REIFIED_TRIPLE ||
           token.tokenType === RdfToken.LCURLY ||
           name === 'BLANK_NODE_LABEL' || name === 'LBRACKET' || name === 'LPARENT' ||
           name === 'OPEN_ANNOTATION' || name === 'TILDE' || name === 'OPEN_REIFIED_TRIPLE' ||
           name === 'LCURLY';
}

/**
 * Checks if a token is an opening bracket.
 */
function isOpeningBracket(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isOpeningBracket === true ||
           token.tokenType === RdfToken.LBRACKET ||
           token.tokenType === RdfToken.LPARENT ||
           token.tokenType === RdfToken.LCURLY ||
           token.tokenType === RdfToken.OPEN_TRIPLE_TERM ||
           token.tokenType === RdfToken.OPEN_REIFIED_TRIPLE ||
           token.tokenType === RdfToken.OPEN_ANNOTATION ||
           name === 'LBRACKET' || name === 'LPARENT' || name === 'LCURLY' ||
           name === 'OPEN_TRIPLE_TERM' || name === 'OPEN_REIFIED_TRIPLE' || name === 'OPEN_ANNOTATION';
}

/**
 * Checks if a token is a closing bracket.
 */
function isClosingBracket(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isClosingBracket === true ||
           token.tokenType === RdfToken.RBRACKET ||
           token.tokenType === RdfToken.RPARENT ||
           token.tokenType === RdfToken.RCURLY ||
           token.tokenType === RdfToken.CLOSE_TRIPLE_TERM ||
           token.tokenType === RdfToken.CLOSE_REIFIED_TRIPLE ||
           token.tokenType === RdfToken.CLOSE_ANNOTATION ||
           name === 'RBRACKET' || name === 'RPARENT' || name === 'RCURLY' ||
           name === 'CLOSE_TRIPLE_TERM' || name === 'CLOSE_REIFIED_TRIPLE' || name === 'CLOSE_ANNOTATION';
}

/**
 * Checks if a token is punctuation.
 */
function isPunctuationToken(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isPunctuation === true ||
           token.tokenType === RdfToken.PERIOD ||
           token.tokenType === RdfToken.SEMICOLON ||
           token.tokenType === RdfToken.COMMA ||
           name === 'PERIOD' || name === 'SEMICOLON' || name === 'COMMA';
}

/**
 * Checks if a token is an IRI token.
 */
function isIriToken(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isIri === true ||
           token.tokenType === RdfToken.IRIREF ||
           token.tokenType === RdfToken.IRIREF_ABS ||
           token.tokenType === RdfToken.PNAME_LN ||
           token.tokenType === RdfToken.PNAME_NS ||
           name === 'IRIREF' || name === 'IRIREF_ABS' || name === 'IRIREF_REL' ||
           name === 'PNAME_LN' || name === 'PNAME_NS';
}

/**
 * Checks if a token is a literal token.
 */
function isLiteralToken(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.isLiteral === true ||
           token.tokenType === RdfToken.STRING_LITERAL_QUOTE ||
           token.tokenType === RdfToken.STRING_LITERAL_SINGLE_QUOTE ||
           token.tokenType === RdfToken.STRING_LITERAL_LONG_QUOTE ||
           token.tokenType === RdfToken.STRING_LITERAL_LONG_SINGLE_QUOTE ||
           token.tokenType === RdfToken.INTEGER ||
           token.tokenType === RdfToken.DECIMAL ||
           token.tokenType === RdfToken.DOUBLE ||
           name === 'STRING_LITERAL_QUOTE' || name === 'STRING_LITERAL_SINGLE_QUOTE' ||
           name === 'STRING_LITERAL_LONG_QUOTE' || name === 'STRING_LITERAL_LONG_SINGLE_QUOTE' ||
           name === 'INTEGER' || name === 'DECIMAL' || name === 'DOUBLE';
}

/**
 * Checks if a token needs no space before it.
 */
function noSpaceBefore(token: Token): boolean {
    const name = token.tokenType.name;
    return token.tokenType.noSpaceBefore === true ||
           token.tokenType === RdfToken.DCARET ||
           token.tokenType === RdfToken.LANGTAG ||
           name === 'DCARET' || name === 'LANGTAG';
}

/**
 * Serializes RDF content directly from parser tokens, preserving source information.
 * 
 * This approach is useful for:
 * - Formatting while preserving comments
 * - Maintaining blank node ID assignments from parsing
 * - Partial document serialization
 * - Building source maps for debugging
 */
export class TokenSerializer {
    /**
     * Serializes tokens to a formatted string.
     * 
     * @param tokens Array of Chevrotain tokens from the parser
     * @param options Serialization options
     * @returns Serialization result with output and source map
     */
    serialize(tokens: Token[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);
        const sourceMap: SourceMapEntry[] = [];
        const parts: string[] = [];

        let currentOffset = 0;
        let lastToken: Token | null = null;
        let lastNonCommentToken: Token | null = null;
        let pendingComment: Token | null = null;

        for (const token of tokens) {
            // Skip whitespace tokens (we regenerate formatting)
            if (isWhitespaceToken(token)) {
                continue;
            }

            // Handle comments
            if (isCommentToken(token)) {
                if (opts.preserveComments) {
                    // Store comment to emit with appropriate spacing
                    pendingComment = token;
                }
                continue;
            }

            // Emit pending comment before this token
            if (pendingComment) {
                // Add newline before comment if not at start
                if (parts.length > 0) {
                    const spacing = opts.lineEnd + this.getCurrentIndent(lastNonCommentToken, opts);
                    parts.push(spacing);
                    currentOffset += spacing.length;
                }
                
                // Add the comment
                parts.push(pendingComment.image);
                currentOffset += pendingComment.image.length;
                
                // Add newline after comment
                const afterNewline = opts.lineEnd + this.getCurrentIndent(lastNonCommentToken, opts);
                parts.push(afterNewline);
                currentOffset += afterNewline.length;
                
                pendingComment = null;
            } else {
                // Add spacing between tokens
                if (lastToken && !this.shouldOmitSpace(lastToken, token)) {
                    parts.push(this.getSpacing(lastToken, token, opts));
                }
            }

            // Serialize the token
            const serialized = this.serializeToken(token, opts);
            const startOffset = currentOffset;

            parts.push(serialized);
            currentOffset += serialized.length;

            // Add source map entry
            sourceMap.push({
                outputOffset: startOffset,
                outputLength: serialized.length,
                inputOffset: token.startOffset,
                inputLength: token.endOffset !== undefined 
                    ? token.endOffset - token.startOffset + 1 
                    : token.image.length,
                type: this.getTokenType(token)
            });

            lastToken = token;
            lastNonCommentToken = token;
        }

        // Handle trailing comment
        if (pendingComment && opts.preserveComments) {
            if (parts.length > 0) {
                const spacing = opts.lineEnd + this.getCurrentIndent(lastNonCommentToken, opts);
                parts.push(spacing);
            }
            parts.push(pendingComment.image);
        }

        return {
            output: parts.join(''),
            sourceMap: opts.prettyPrint ? sourceMap : undefined
        };
    }

    /**
     * Gets the current indentation based on context.
     */
    private getCurrentIndent(lastToken: Token | null, opts: Required<TokenSerializerOptions>): string {
        // Simple indent tracking - could be enhanced with bracket depth
        return '';
    }

    /**
     * Serializes a partial selection of tokens.
     * Useful for formatting a selected region of a document.
     * 
     * @param tokens Tokens from the full document
     * @param startOffset Start offset of the selection
     * @param endOffset End offset of the selection
     * @param options Serialization options
     */
    serializeRange(
        tokens: Token[],
        startOffset: number,
        endOffset: number,
        options?: TokenSerializerOptions
    ): SerializationResult {
        // Filter tokens that fall within the range
        const rangeTokens = tokens.filter(t => 
            t.startOffset >= startOffset && 
            (t.endOffset ?? t.startOffset + t.image.length - 1) <= endOffset
        );

        return this.serialize(rangeTokens, options);
    }

    /**
     * Serializes a single token to a string.
     */
    private serializeToken(token: Token, opts: Required<TokenSerializerOptions>): string {
        const tokenType = token.tokenType;

        // Handle blank node tokens with preserved IDs
        if (isBlankNodeType(token) && opts.preserveBlankNodeIds) {
            const blankNodeId = token.payload?.blankNodeId;
            if (blankNodeId && tokenType === RdfToken.LBRACKET) {
                // Keep the bracket but associate with the blank node ID
                // The ID will be used when generating _:id references
            }
        }

        // Handle different token types using direct type comparison
        // IRIs
        if (tokenType === RdfToken.IRIREF || tokenType === RdfToken.IRIREF_ABS) {
            return token.image; // Already includes < >
        }

        // Prefixed names
        if (tokenType === RdfToken.PNAME_LN || tokenType === RdfToken.PNAME_NS) {
            return token.image;
        }

        // Blank node labels
        if (tokenType === RdfToken.BLANK_NODE_LABEL) {
            return token.image;
        }

        // Literals
        if (tokenType === RdfToken.STRING_LITERAL_QUOTE ||
            tokenType === RdfToken.STRING_LITERAL_SINGLE_QUOTE ||
            tokenType === RdfToken.STRING_LITERAL_LONG_QUOTE ||
            tokenType === RdfToken.STRING_LITERAL_LONG_SINGLE_QUOTE) {
            return token.image;
        }

        // Numbers
        if (tokenType === RdfToken.INTEGER ||
            tokenType === RdfToken.DECIMAL ||
            tokenType === RdfToken.DOUBLE) {
            return token.image;
        }

        // Keywords that stay lowercase
        if (tokenType === RdfToken.A ||
            tokenType === RdfToken.TRUE ||
            tokenType === RdfToken.FALSE) {
            return token.image.toLowerCase();
        }

        // Turtle-style keywords (@base, @prefix)
        if (tokenType === RdfToken.TTL_BASE || tokenType === RdfToken.TTL_PREFIX) {
            return token.image;
        }

        // SPARQL-style keywords (also BASE/PREFIX without @)
        if (tokenType === RdfToken.BASE ||
            tokenType === RdfToken.PREFIX ||
            tokenType === RdfToken.GRAPH ||
            tokenType === RdfToken.VERSION ||
            tokenType === RdfToken.SPARQL_VERSION) {
            return token.image.toUpperCase();
        }

        // Variables (SPARQL)
        if (tokenType === RdfToken.VAR1 || tokenType === RdfToken.VAR2) {
            return token.image;
        }

        // Language tag
        if (tokenType === RdfToken.LANGTAG) {
            return token.image;
        }

        // RDF 1.2 specific tokens
        if (tokenType === RdfToken.OPEN_TRIPLE_TERM) return '<<(';
        if (tokenType === RdfToken.CLOSE_TRIPLE_TERM) return ')>>';
        if (tokenType === RdfToken.OPEN_REIFIED_TRIPLE) return '<<';
        if (tokenType === RdfToken.CLOSE_REIFIED_TRIPLE) return '>>';
        if (tokenType === RdfToken.OPEN_ANNOTATION) return '{|';
        if (tokenType === RdfToken.CLOSE_ANNOTATION) return '|}';
        if (tokenType === RdfToken.TILDE) return '~';

        // Punctuation
        if (tokenType === RdfToken.PERIOD) return '.';
        if (tokenType === RdfToken.SEMICOLON) return ';';
        if (tokenType === RdfToken.COMMA) return ',';
        if (tokenType === RdfToken.LBRACKET) return '[';
        if (tokenType === RdfToken.RBRACKET) return ']';
        if (tokenType === RdfToken.LPARENT) return '(';
        if (tokenType === RdfToken.RPARENT) return ')';
        if (tokenType === RdfToken.LCURLY) return '{';
        if (tokenType === RdfToken.RCURLY) return '}';
        if (tokenType === RdfToken.DCARET) return '^^';

        // Default: use the image as-is
        return token.image;
    }

    /**
     * Determines the spacing needed between two tokens.
     */
    private getSpacing(
        prev: Token,
        current: Token,
        opts: Required<TokenSerializerOptions>
    ): string {
        // No space after opening brackets/parens
        if (isOpeningBracket(prev)) {
            return '';
        }

        // No space before closing brackets/parens
        if (isClosingBracket(current)) {
            return '';
        }

        // No space before datatype marker or language tag
        if (noSpaceBefore(current)) {
            return '';
        }

        // No space after datatype marker
        if (prev.tokenType === RdfToken.DCARET || prev.tokenType.name === 'DCARET') {
            return '';
        }

        // No space before punctuation (period, semicolon, comma)
        if (isPunctuationToken(current)) {
            return '';
        }

        // Newline after period (but compact if not pretty printing)
        if (prev.tokenType === RdfToken.PERIOD || prev.tokenType.name === 'PERIOD') {
            return opts.prettyPrint ? opts.lineEnd : ' ';
        }

        // Newline after semicolon in pretty print mode
        if ((prev.tokenType === RdfToken.SEMICOLON || prev.tokenType.name === 'SEMICOLON') && opts.prettyPrint) {
            return opts.lineEnd + opts.indent;
        }

        // Space after comma
        if (prev.tokenType === RdfToken.COMMA || prev.tokenType.name === 'COMMA') {
            return ' ';
        }

        // Default: single space
        return ' ';
    }

    /**
     * Determines if space should be omitted between tokens.
     */
    private shouldOmitSpace(prev: Token, current: Token): boolean {
        // No space between prefix namespace and local name
        const prevIsPnameNs = prev.tokenType === RdfToken.PNAME_NS || prev.tokenType.name === 'PNAME_NS';
        const currIsPnameLn = current.tokenType === RdfToken.PNAME_LN || current.tokenType.name === 'PNAME_LN';
        if (prevIsPnameNs && currIsPnameLn) {
            return true;
        }

        return false;
    }

    /**
     * Gets the type category for a token.
     */
    private getTokenType(token: Token): SourceMapEntry['type'] {
        const tokenType = token.tokenType;
        const name = tokenType.name;

        if (isIriToken(token)) {
            const isPrefixed = tokenType === RdfToken.PNAME_LN || tokenType === RdfToken.PNAME_NS ||
                               name === 'PNAME_LN' || name === 'PNAME_NS';
            return isPrefixed ? 'prefixedName' : 'iri';
        }

        if (isBlankNodeType(token)) {
            return 'blankNode';
        }

        if (isLiteralToken(token) || tokenType === RdfToken.LANGTAG || name === 'LANGTAG') {
            return 'literal';
        }

        if (tokenType.isKeyword === true) {
            return 'keyword';
        }

        if (isPunctuationToken(token) || isOpeningBracket(token) || isClosingBracket(token)) {
            return 'punctuation';
        }

        if (tokenType === RdfToken.VAR1 || tokenType === RdfToken.VAR2 ||
            name === 'VAR1' || name === 'VAR2') {
            return 'variable';
        }

        return 'punctuation'; // Default fallback
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: TokenSerializerOptions): Required<TokenSerializerOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            preserveBlankNodeIds: options?.preserveBlankNodeIds ?? true,
            preserveComments: options?.preserveComments ?? true
        };
    }
}

/**
 * Extracts blank node ID from a token's payload.
 * @param token The token to check
 * @returns The blank node ID if present, undefined otherwise
 */
export function getBlankNodeIdFromToken(token: Token): string | undefined {
    return token.payload?.blankNodeId;
}

/**
 * Checks if a token represents a blank node.
 * @param token The token to check
 */
export function isBlankNodeToken(token: Token): boolean {
    return isBlankNodeType(token);
}

/**
 * Gets the source position from a token.
 */
export function getTokenPosition(token: Token): {
    startOffset: number;
    endOffset: number;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
} {
    return {
        startOffset: token.startOffset,
        endOffset: token.endOffset ?? token.startOffset + token.image.length - 1,
        startLine: token.startLine,
        startColumn: token.startColumn,
        endLine: token.endLine,
        endColumn: token.endColumn
    };
}
