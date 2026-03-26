import { IToken, RdfSyntax, RdfToken, NQuadsLexer } from '@faubulous/mentor-rdf-parsers';
import { SerializationResult } from '../serialization-result';
import { SerializerOptions } from '../serializer-options';
import { mergeOptions } from '../quad-serializer-base';
import { TokenSerializerOptions } from '../token-serializer';
import { ITokenFormatter } from '../token-formatter.interface';

/**
 * N-Quads-specific formatting options.
 */
export interface NQuadsFormatterOptions extends SerializerOptions {
    /**
     * Whether to normalize whitespace to single spaces.
     * Default: true
     */
    normalizeWhitespace?: boolean;
}

/**
 * Formatter for N-Quads (line-based RDF dataset format).
 * 
 * N-Quads extends N-Triples to support named graphs.
 * Each line contains: subject predicate object [graph] .
 * 
 * This formatter normalizes spacing and ensures proper line endings.
 * 
 * @see https://www.w3.org/TR/rdf12-n-quads/
 */
export class NQuadsFormatter implements ITokenFormatter {
    readonly syntax: RdfSyntax = RdfSyntax.NQuads;

    private lexer = new NQuadsLexer();

    /**
     * Formats an N-Quads document.
     */
    formatFromText(input: string, options?: NQuadsFormatterOptions): SerializationResult {
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
    formatFromTokens(tokens: IToken[], options?: NQuadsFormatterOptions & TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options);
        return this.formatTokens(tokens, opts);
    }

    // Backwards-compatible alias
    format(input: string, options?: NQuadsFormatterOptions): SerializationResult {
        return this.formatFromText(input, options);
    }

    /**
     * Formats tokens into a string.
     */
    private formatTokens(tokens: IToken[], opts: Required<NQuadsFormatterOptions>, comments: IToken[] = []): SerializationResult {
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

            // Handle period (end of quad)
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
    private getOptions(options?: NQuadsFormatterOptions): Required<NQuadsFormatterOptions> {
        return {
            ...mergeOptions(options),
            normalizeWhitespace: options?.normalizeWhitespace ?? true,
        };
    }
}
