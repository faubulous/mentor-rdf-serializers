import { IToken, RdfSyntax, RdfToken, NTriplesLexer } from '@faubulous/mentor-rdf-parsers';
import { SerializationResult } from '../serialization-result';
import { FormatterBase } from '../formatter-base';
import { SerializationOptions } from '../serialization-options';
import { ITokenFormatter } from '../token-formatter.interface';
import { mergeOptions } from '../quad-serializer-base';

/**
 * N-Triples-specific formatting options.
 */
export interface NTriplesFormatterOptions extends SerializationOptions {
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
export class NTriplesFormatter extends FormatterBase<NTriplesFormatterOptions> implements ITokenFormatter {
    readonly syntax: RdfSyntax = RdfSyntax.NTriples;

    protected readonly lexer = new NTriplesLexer();

    // Backwards-compatible alias
    format(input: string, options?: NTriplesFormatterOptions): SerializationResult {
        return this.formatFromText(input, options);
    }

    /**
     * Formats tokens into a string.
     */
    protected formatTokens(
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
                        // Preserve blank line between previous token and comment.
                        if (lastNonWsToken &&
                            comment.startLine !== undefined &&
                            lastNonWsToken.endLine !== undefined &&
                            comment.startLine - lastNonWsToken.endLine > 1) {
                            parts.push(opts.lineEnd);
                        }

                        parts.push(opts.lineEnd);
                    }

                    parts.push(comment.image);
                    parts.push(opts.lineEnd);

                    lastNonWsToken = comment;
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
                } else if (parts.length > 0 && lastNonWsToken &&
                    token.startLine !== undefined &&
                    lastNonWsToken.endLine !== undefined &&
                    token.startLine - lastNonWsToken.endLine > 1) {
                    // Preserve blank line between previous token and comment.
                    parts.push(opts.lineEnd);
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
    protected getOptions(options?: NTriplesFormatterOptions): Required<NTriplesFormatterOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            normalizeWhitespace: options?.normalizeWhitespace ?? true,
        };
    }
}
