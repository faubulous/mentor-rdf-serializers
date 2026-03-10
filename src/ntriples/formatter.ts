import type { IToken, TokenType } from 'chevrotain';
import type { TokenMetadata } from '@faubulous/mentor-rdf-parsers';
import { RdfToken, NTriplesLexer } from '@faubulous/mentor-rdf-parsers';
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
 * N-Triples-specific formatting options.
 */
export interface NTriplesFormatterOptions extends SerializerOptions {
    /**
     * Whether to normalize whitespace to single spaces.
     * Default: true
     */
    normalizeWhitespace?: boolean;
}

/**
 * Formatter for N-Triples (line-based RDF format).
 * 
 * N-Triples is a simple line-based format where each line contains
 * exactly one triple: subject predicate object .
 * 
 * This formatter normalizes spacing and ensures proper line endings.
 * 
 * @see https://www.w3.org/TR/rdf12-n-triples/
 */
export class NTriplesFormatter implements IRdfFormatter {
    readonly syntax: RdfSyntaxType = RdfSyntax.NTriples;
    private lexer = new NTriplesLexer();

    /**
     * Formats an N-Triples document.
     */
    format(input: string, options?: NTriplesFormatterOptions): SerializationResult {
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
        const opts = this.getOptions(options as NTriplesFormatterOptions);
        return this.formatTokens(tokens, opts);
    }

    /**
     * Formats tokens into a string.
     */
    private formatTokens(
        tokens: IToken[],
        opts: Required<NTriplesFormatterOptions>,
        comments: IToken[] = []
    ): SerializationResult {
        const parts: string[] = [];
        const sortedComments = [...comments].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
        let commentIndex = 0;
        let needsSpace = false;
        let lastNonWsToken: IToken | null = null;

        for (const token of tokens) {
            // Insert comments that appear before this token
            while (commentIndex < sortedComments.length) {
                const comment = sortedComments[commentIndex];
                if ((comment.startOffset ?? 0) < (token.startOffset ?? 0)) {
                    if (parts.length > 0) {
                        parts.push(opts.lineEnd);
                    }
                    parts.push(comment.image);
                    parts.push(opts.lineEnd);
                    commentIndex++;
                    needsSpace = false;
                } else {
                    break;
                }
            }

            // Skip whitespace tokens
            if (token.tokenType === RdfToken.WS) {
                continue;
            }

            // Handle comment tokens in stream
            if (token.tokenType === RdfToken.COMMENT) {
                if (parts.length > 0 && lastNonWsToken?.tokenType !== RdfToken.PERIOD) {
                    parts.push(' ');
                }
                parts.push(token.image);
                parts.push(opts.lineEnd);
                needsSpace = false;
                lastNonWsToken = token;
                continue;
            }

            // Handle period (end of triple)
            if (token.tokenType === RdfToken.PERIOD) {
                parts.push(' .');
                parts.push(opts.lineEnd);
                needsSpace = false;
                lastNonWsToken = token;
                continue;
            }

            // Add space before term tokens
            if (needsSpace) {
                parts.push(' ');
            }

            parts.push(token.image);
            needsSpace = true;
            lastNonWsToken = token;
        }

        // Add trailing comments
        while (commentIndex < sortedComments.length) {
            parts.push(sortedComments[commentIndex].image);
            parts.push(opts.lineEnd);
            commentIndex++;
        }

        return { output: parts.join('').trim() + (parts.length > 0 ? opts.lineEnd : '') };
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: NTriplesFormatterOptions): Required<NTriplesFormatterOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            normalizeWhitespace: options?.normalizeWhitespace ?? true,
        };
    }
}
