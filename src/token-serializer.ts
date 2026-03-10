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
    tokenType: {
        name: string;
    };
    payload?: {
        blankNodeId?: string;
        [key: string]: unknown;
    };
}

/**
 * Token names that represent blank node tokens.
 */
const BLANK_NODE_TOKEN_NAMES = new Set([
    'LBRACKET',           // Anonymous blank nodes [ ... ]
    'LPARENT',            // Collections (list heads)
    'OPEN_ANNOTATION',    // Annotations {| ... |}
    'TILDE',              // N3 quick variables ~
    'OPEN_REIFIED_TRIPLE', // Anonymous reified triples <<
    'LCURLY',             // N3 formulas { ... }
]);

/**
 * Token names that represent whitespace/formatting.
 */
const WHITESPACE_TOKEN_NAMES = new Set([
    'WS',
    'NL',
    'NEWLINE'
]);

/**
 * Token names that represent comments.
 */
const COMMENT_TOKEN_NAMES = new Set([
    'COMMENT'
]);

/**
 * Token names that represent keywords.
 */
const KEYWORD_TOKEN_NAMES = new Set([
    'A',
    'BASE',
    'PREFIX',
    'SPARQL_BASE',
    'SPARQL_PREFIX',
    'VERSION',
    'GRAPH',
    'TRUE',
    'FALSE'
]);

/**
 * Token names that represent IRIs.
 */
const IRI_TOKEN_NAMES = new Set([
    'IRIREF',
    'IRIREF_REL',
    'PNAME_LN',
    'PNAME_NS'
]);

/**
 * Token names that represent literals.
 */
const LITERAL_TOKEN_NAMES = new Set([
    'STRING_LITERAL_QUOTE',
    'STRING_LITERAL_SINGLE_QUOTE',
    'STRING_LITERAL_LONG_SINGLE_QUOTE',
    'STRING_LITERAL_LONG_QUOTE',
    'INTEGER',
    'DECIMAL',
    'DOUBLE'
]);

/**
 * Token names that represent punctuation.
 */
const PUNCTUATION_TOKEN_NAMES = new Set([
    'PERIOD',
    'SEMICOLON',
    'COMMA',
    'LBRACKET',
    'RBRACKET',
    'LPARENT',
    'RPARENT',
    'LCURLY',
    'RCURLY',
    'DCARET',
    'LANGTAG',
    'OPEN_ANNOTATION',
    'CLOSE_ANNOTATION',
    'OPEN_REIFIED_TRIPLE',
    'CLOSE_REIFIED_TRIPLE',
    'OPEN_TRIPLE_TERM',
    'CLOSE_TRIPLE_TERM',
    'TILDE'
]);

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
            if (WHITESPACE_TOKEN_NAMES.has(token.tokenType.name)) {
                continue;
            }

            // Handle comments
            if (COMMENT_TOKEN_NAMES.has(token.tokenType.name)) {
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
        const { name } = token.tokenType;

        // Handle blank node tokens with preserved IDs
        if (BLANK_NODE_TOKEN_NAMES.has(name) && opts.preserveBlankNodeIds) {
            const blankNodeId = token.payload?.blankNodeId;
            if (blankNodeId && name === 'LBRACKET') {
                // Keep the bracket but associate with the blank node ID
                // The ID will be used when generating _:id references
            }
        }

        // Handle different token types
        switch (name) {
            // IRIs
            case 'IRIREF':
            case 'IRIREF_REL':
                return token.image; // Already includes < >

            // Prefixed names
            case 'PNAME_LN':
            case 'PNAME_NS':
                return token.image;

            // Blank node labels
            case 'BLANK_NODE_LABEL':
                return token.image;

            // Literals
            case 'STRING_LITERAL_QUOTE':
            case 'STRING_LITERAL_SINGLE_QUOTE':
            case 'STRING_LITERAL_LONG_QUOTE':
            case 'STRING_LITERAL_LONG_SINGLE_QUOTE':
                return token.image;

            // Numbers
            case 'INTEGER':
            case 'DECIMAL':
            case 'DOUBLE':
                return token.image;

            // Keywords - optionally uppercase/lowercase
            case 'A':
            case 'TRUE':
            case 'FALSE':
                return token.image.toLowerCase();

            case 'BASE':
            case 'PREFIX':
                return token.image; // @base, @prefix

            case 'SPARQL_BASE':
            case 'SPARQL_PREFIX':
            case 'GRAPH':
            case 'VERSION':
                return token.image.toUpperCase();

            // Variables (SPARQL)
            case 'VAR1':
            case 'VAR2':
                return token.image;

            // Language tag
            case 'LANGTAG':
                return token.image;

            // RDF 1.2 specific tokens
            case 'OPEN_TRIPLE_TERM':
                return '<<(';
            case 'CLOSE_TRIPLE_TERM':
                return ')>>';
            case 'OPEN_REIFIED_TRIPLE':
                return '<<';
            case 'CLOSE_REIFIED_TRIPLE':
                return '>>';
            case 'OPEN_ANNOTATION':
                return '{|';
            case 'CLOSE_ANNOTATION':
                return '|}';
            case 'TILDE':
                return '~';

            // Punctuation
            case 'PERIOD':
                return '.';
            case 'SEMICOLON':
                return ';';
            case 'COMMA':
                return ',';
            case 'LBRACKET':
                return '[';
            case 'RBRACKET':
                return ']';
            case 'LPARENT':
                return '(';
            case 'RPARENT':
                return ')';
            case 'LCURLY':
                return '{';
            case 'RCURLY':
                return '}';
            case 'DCARET':
                return '^^';

            // Default: use the image as-is
            default:
                return token.image;
        }
    }

    /**
     * Determines the spacing needed between two tokens.
     */
    private getSpacing(
        prev: Token,
        current: Token,
        opts: Required<TokenSerializerOptions>
    ): string {
        const prevName = prev.tokenType.name;
        const currName = current.tokenType.name;

        // No space after opening brackets/parens
        if (['LBRACKET', 'LPARENT', 'LCURLY', 'OPEN_TRIPLE_TERM', 'OPEN_REIFIED_TRIPLE', 'OPEN_ANNOTATION'].includes(prevName)) {
            return '';
        }

        // No space before closing brackets/parens
        if (['RBRACKET', 'RPARENT', 'RCURLY', 'CLOSE_TRIPLE_TERM', 'CLOSE_REIFIED_TRIPLE', 'CLOSE_ANNOTATION'].includes(currName)) {
            return '';
        }

        // No space before datatype marker
        if (currName === 'DCARET') {
            return '';
        }

        // No space after datatype marker
        if (prevName === 'DCARET') {
            return '';
        }

        // No space before language tag
        if (currName === 'LANGTAG') {
            return '';
        }

        // No space before punctuation (period, semicolon, comma)
        if (['PERIOD', 'SEMICOLON', 'COMMA'].includes(currName)) {
            return '';
        }

        // Newline after period (but compact if not pretty printing)
        if (prevName === 'PERIOD') {
            return opts.prettyPrint ? opts.lineEnd : ' ';
        }

        // Newline after semicolon in pretty print mode
        if (prevName === 'SEMICOLON' && opts.prettyPrint) {
            return opts.lineEnd + opts.indent;
        }

        // Space after comma
        if (prevName === 'COMMA') {
            return ' ';
        }

        // Default: single space
        return ' ';
    }

    /**
     * Determines if space should be omitted between tokens.
     */
    private shouldOmitSpace(prev: Token, current: Token): boolean {
        const prevName = prev.tokenType.name;
        const currName = current.tokenType.name;

        // No space between prefix namespace and local name
        if (prevName === 'PNAME_NS' && currName === 'PNAME_LN') {
            return true;
        }

        return false;
    }

    /**
     * Gets the type category for a token.
     */
    private getTokenType(token: Token): SourceMapEntry['type'] {
        const name = token.tokenType.name;

        if (IRI_TOKEN_NAMES.has(name)) {
            return name === 'PNAME_LN' || name === 'PNAME_NS' ? 'prefixedName' : 'iri';
        }

        if (name === 'BLANK_NODE_LABEL' || BLANK_NODE_TOKEN_NAMES.has(name)) {
            return 'blankNode';
        }

        if (LITERAL_TOKEN_NAMES.has(name) || name === 'LANGTAG') {
            return 'literal';
        }

        if (KEYWORD_TOKEN_NAMES.has(name)) {
            return 'keyword';
        }

        if (PUNCTUATION_TOKEN_NAMES.has(name)) {
            return 'punctuation';
        }

        if (name === 'VAR1' || name === 'VAR2') {
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
    return token.tokenType.name === 'BLANK_NODE_LABEL' || 
           BLANK_NODE_TOKEN_NAMES.has(token.tokenType.name);
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
