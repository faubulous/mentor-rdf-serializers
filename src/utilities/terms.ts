import type { Literal, Term } from '@rdfjs/types';
import type { Rdf12Term, TripleTerm, Reifier } from './types.js';

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
 * Converts a term to a string key for grouping purposes.
 */
export function termToString(term: Term | Rdf12Term): string {
    if (!term) {
        return '';
    }

    switch (term.termType) {
        case 'NamedNode': {
            const v = term.value;
            return `<${v}>`;
        }
        case 'BlankNode': {
            const v = term.value;
            return `_:${v}`;
        }
        case 'Literal': {
            const v = term.value;
            const l = (term as Literal).language || '';
            const d = (term as Literal).datatype?.value || '';
            return `"${v}"@${l}^^${d}`;
        }
        case 'Variable': {
            const v = term.value;
            return `?${v}`;
        }
        case 'DefaultGraph': {
            return '';
        }
        case 'TripleTerm': {
            const t = term as TripleTerm;
            const s = termToString(t.subject);
            const p = termToString(t.predicate);
            const o = termToString(t.object);
            return `<<(${s} ${p} ${o})>>`;
        }
        default: {
            // For unknown term types, try to access value property safely
            return (term as { value?: string }).value || '';
        }
    }
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
