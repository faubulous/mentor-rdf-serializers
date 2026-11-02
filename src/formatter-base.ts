import { ILexer, IToken, RdfSyntax } from '@faubulous/mentor-rdf-parsers';
import { FormattingGuard } from './formatting-guard';
import { SerializationOptions } from './serialization-options';
import { SerializationResult } from './serialization-result';
import { TokenSerializerOptions } from './token-serializer';
import { formatTemplate } from './triplate-template-format';

/**
 * Base class of all formatters. Formats a document from its text: templates, lexing and the
 * guard against formatting text with syntax errors are handled here, so that a formatter only
 * lays out the tokens of a document.
 */
export abstract class FormatterBase<TOptions extends SerializationOptions = SerializationOptions> {
    /**
     * The syntax of the documents the formatter handles.
     */
    abstract readonly syntax: RdfSyntax;

    /**
     * The lexer of the syntax.
     */
    protected abstract readonly lexer: ILexer;

    /**
     * Keeps documents with syntax errors from being formatted, and verifies the result when asked to.
     * Created on first use, because the syntax and the lexer are set by the subclass.
     */
    private _guard: FormattingGuard | undefined;

    /**
     * Merges the given options with the defaults of the formatter.
     * @param options The options given by the caller, if any.
     * @returns The merged options, which include every option shared by all formatters.
     */
    protected abstract getOptions(options?: TOptions): Required<TOptions> & Required<SerializationOptions>;

    /**
     * Lays out the tokens of a document.
     * @param tokens The tokens of the document.
     * @param options The merged options.
     * @param comments The comments the lexer put in a separate group, if any.
     * @returns The formatted text.
     */
    protected abstract formatTokens(tokens: IToken[], options: Required<TOptions>, comments?: IToken[]): SerializationResult;

    /**
     * Formats a document. A document with syntax errors is returned unchanged, with a warning.
     * @param input The document text.
     * @param options The formatting options.
     * @returns The formatted document.
     */
    formatFromText(input: string, options?: TOptions): SerializationResult {
        const opts = this.getOptions(options);
        const guard = this._getGuard();

        const templated = formatTemplate(input, this.lexer, guard, opts.indent, tokens => this.formatTokens(tokens, opts));

        if (templated) {
            return templated;
        }

        const result = this.lexer.tokenize(input);

        if (result.errors.length > 0) {
            return { output: input };
        }

        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];

        return guard.format(input, result, opts.verifyRoundTrip, () => this.formatTokens(result.tokens, opts, comments));
    }

    /**
     * Formats a document from its tokens, without checking it for syntax errors.
     * @param tokens The tokens of the document.
     * @param options The formatting options.
     * @returns The formatted document.
     */
    formatFromTokens(tokens: IToken[], options?: TOptions & TokenSerializerOptions): SerializationResult {
        return this.formatTokens(tokens, this.getOptions(options));
    }

    /**
     * Returns the guard of the formatter, creating it on first use.
     */
    private _getGuard(): FormattingGuard {
        this._guard ??= new FormattingGuard(this.syntax, this.lexer);

        return this._guard;
    }
}
