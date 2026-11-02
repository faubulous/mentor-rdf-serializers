import type { Term } from '@rdfjs/types';
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
