import type { Term } from '@rdfjs/types';
import type { IToken } from '@faubulous/mentor-rdf-parsers';
import type { Rdf12Term, TripleTerm, Reifier } from './types.js';
import { getTermSortKey } from '../sorting/term-sort-key';

/**
 * Checks if a term is an RDF 1.2 Triple Term.
 */
export function isTripleTerm(term: Term | Rdf12Term): term is TripleTerm {
    return term?.termType === 'TripleTerm';
}

/**
 * Checks if a term is an RDF 1.2 Reifier.
 */
export function isReifier(term: Term | Rdf12Term): term is Reifier {
    return term?.termType === 'Reifier';
}

/**
 * Converts a term to the key the sorting strategies order terms by.
 * @deprecated Identify terms with `termToString` of `rdf-string`, as the serializers do. This
 * function will be removed in the next major version.
 * @param term The term.
 * @returns The key.
 */
export function termToString(term: Term | Rdf12Term): string {
    return getTermSortKey(term);
}

/**
 * Parses a language tag to extract base language and direction (RDF 1.2).
 * @param languageTag The full language tag (e.g., "en--ltr", "ar--rtl")
 * @returns Object with language and optional direction
 */
export function parseLanguageTag(languageTag: string): { language: string; direction?: 'ltr' | 'rtl' } {
    const directionMatch = languageTag.match(/^(.+?)--(ltr|rtl)$/);

    if (directionMatch) {
        return {
            language: directionMatch[1],
            direction: directionMatch[2] as 'ltr' | 'rtl'
        };
    } else {
        return { language: languageTag };
    }
}

/**
 * Formats a language tag with optional direction (RDF 1.2).
 * @param language The base language code
 * @param direction Optional text direction
 * @returns The formatted language tag
 */
export function formatLanguageTag(language: string, direction?: 'ltr' | 'rtl'): string {
    if (direction) {
        return `${language}--${direction}`;
    } else {
        return language;
    }
}

/**
 * Get the spellings a document writes its language tags in, by their lower case form, to keep
 * them when the document is written again from its terms, which hold the tags in lower case. The
 * first spelling of a tag is kept; the base direction (`--rtl`) is not part of it.
 * @param tokens The tokens of the document.
 * @returns The spelling of each language tag, by its lower case form.
 */
export function getLanguageTagSpellings(tokens: Iterable<IToken>): Record<string, string> {
    const spellings: Record<string, string> = {};

    for (const token of tokens) {
        if (token.tokenType.name !== 'LANGTAG') {
            continue;
        }

        const { language } = parseLanguageTag(token.image.slice(1));
        const key = language.toLowerCase();

        spellings[key] ??= language;
    }

    return spellings;
}
