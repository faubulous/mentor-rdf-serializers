import { ILexer, IToken, tokenizeTemplateForFormatting } from '@faubulous/mentor-rdf-parsers';
import { SerializationResult } from './serialization-result';
import { TriplateFrontmatterFormatter } from './formatters/triplate-frontmatter-formatter';

const frontmatterFormatter = new TriplateFrontmatterFormatter();

/**
 * Formats a document that uses Triplate templating, or returns `null` when `input` is
 * not a template (the caller then formats it as ordinary host syntax).
 *
 * The frontmatter is reprinted from Triplate's AST and the body is formatted from the
 * host token stream — interpolations (`${…}`) are real term tokens, so they reflow as
 * terms and keep their text — then the two halves are joined with one shared indent.
 * Templates whose body contains `{% … %}` control directives are returned unchanged, so
 * formatting never corrupts control flow.
 *
 * @param input The full document text.
 * @param lexer The host lexer (`TurtleLexer`, `SparqlLexer`, …).
 * @param indent The indent string for one nesting level (from the caller's options).
 * @param formatBody Formats the host body token stream (the caller's `formatTokens`).
 */
export function formatTemplate(
    input: string,
    lexer: ILexer,
    indent: string,
    formatBody: (bodyTokens: IToken[]) => SerializationResult
): SerializationResult | null {
    // Triplate template formatting requires `tokenizeTemplateForFormatting` from
    // mentor-rdf-parsers. If the installed parsers version predates it, degrade
    // gracefully: treat the document as non-template so the host formatter still runs.
    if (typeof tokenizeTemplateForFormatting !== 'function') {
        return null;
    }

    const prep = tokenizeTemplateForFormatting(lexer, input);

    if (!prep) {
        return null;
    }

    if (prep.hasDirectives) {
        return { output: input };
    }

    const frontmatter = frontmatterFormatter.format(input, { indent });
    const body = formatBody(prep.bodyTokens).output;

    return { output: frontmatter + body };
}
