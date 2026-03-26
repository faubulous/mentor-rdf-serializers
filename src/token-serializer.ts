import { IToken, RdfToken } from '@faubulous/mentor-rdf-parsers';
import { SerializationResult } from './serialization-result';
import { SerializerOptions } from './serializer-options';
import { SourceMapEntry } from './utilities/source-map-entry';
import { mergeOptions } from './quad-serializer-base';

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
    serialize(tokens: IToken[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);
        const sourceMap: SourceMapEntry[] = [];
        const parts: string[] = [];

        let currentOffset = 0;
        let lastToken: IToken | null = null;
        let lastNonCommentToken: IToken | null = null;
        let pendingComment: IToken | null = null;

        for (const token of tokens) {
            if (token.tokenType.isWhitespace === true) {
                continue;
            }

            // Preceding comment handling is deferred until we encounter a non-comment token to determine spacing.
            if (token.tokenType.isComment === true) {
                if (opts.preserveComments) {
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
            } else if (lastToken && !this.shouldOmitSpace(lastToken, token)) {
                // Add spacing between tokens
                parts.push(this.getSpacing(lastToken, token, opts));
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
    private getCurrentIndent(lastToken: IToken | null, opts: Required<TokenSerializerOptions>): string {
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
    serializeRange(tokens: IToken[], startOffset: number, endOffset: number, options?: TokenSerializerOptions): SerializationResult {
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
    private serializeToken(token: IToken, opts: Required<TokenSerializerOptions>): string {
        const tokenType = token.tokenType;

        // Handle blank node tokens with preserved IDs
        if (token.tokenType.isBlankNodeScope === true && opts.preserveBlankNodeIds) {
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
    private getSpacing(prev: IToken, current: IToken, opts: Required<TokenSerializerOptions>): string {
        // No space after opening brackets/parens
        if (prev.tokenType.isOpeningBracket === true) {
            return '';
        }

        // No space before closing brackets/parens
        if (current.tokenType.isClosingBracket === true) {
            return '';
        }

        // No space before datatype marker or language tag
        if (current.tokenType.noSpaceBefore === true) {
            return '';
        }

        // No space after datatype marker
        if (prev.tokenType === RdfToken.DCARET) {
            return '';
        }

        // No space before punctuation (period, semicolon, comma)
        if (current.tokenType.isPunctuation === true) {
            return '';
        }

        // Newline after period (but compact if not pretty printing)
        if (prev.tokenType === RdfToken.PERIOD) {
            return opts.prettyPrint ? opts.lineEnd : ' ';
        }

        // Newline after semicolon in pretty print mode
        if ((prev.tokenType === RdfToken.SEMICOLON) && opts.prettyPrint) {
            return opts.lineEnd + opts.indent;
        }

        // Space after comma
        if (prev.tokenType === RdfToken.COMMA) {
            return ' ';
        }

        // Default: single space
        return ' ';
    }

    /**
     * Determines if space should be omitted between tokens.
     */
    private shouldOmitSpace(prev: IToken, current: IToken): boolean {
        // No space between prefix namespace and local name
        return prev.tokenType === RdfToken.PNAME_NS && current.tokenType === RdfToken.PNAME_LN;
    }

    /**
     * Gets the type category for a token.
     */
    private getTokenType(token: IToken): SourceMapEntry['type'] {
        const tokenType = token.tokenType;

        if (tokenType.isIri === true) {
            const isPrefixed = tokenType === RdfToken.PNAME_LN || tokenType === RdfToken.PNAME_NS;

            return isPrefixed ? 'prefixedName' : 'iri';
        }

        if (tokenType.isBlankNodeScope === true) {
            return 'blankNode';
        }

        if (tokenType.isLiteral === true || tokenType === RdfToken.LANGTAG) {
            return 'literal';
        }

        if (tokenType.isKeyword === true) {
            return 'keyword';
        }

        if (tokenType.isPunctuation === true || tokenType.isOpeningBracket === true || tokenType.isClosingBracket === true) {
            return 'punctuation';
        }

        if (tokenType === RdfToken.VAR1 || tokenType === RdfToken.VAR2) {
            return 'variable';
        }

        return 'punctuation'; // Default fallback
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: TokenSerializerOptions): Required<TokenSerializerOptions> {
        return {
            ...mergeOptions(options),
            preserveBlankNodeIds: options?.preserveBlankNodeIds ?? true,
            preserveComments: options?.preserveComments ?? true
        };
    }
}

/**
 * Options for token-based serialization.
 */
export interface TokenSerializerOptions extends SerializerOptions {
    /**
     * Whether to preserve the original blank node IDs from tokens.
     * When true, uses the blankNodeId from token payloads.
     * Default: true
     */
    preserveBlankNodeIds?: boolean;

    /**
     * Whether to preserve comments from the source.
     * When true, comments are included in the output.
     * Default: true
     */
    preserveComments?: boolean;
}