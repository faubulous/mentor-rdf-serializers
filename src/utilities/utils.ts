import type { Literal, Quad, Term } from '@rdfjs/types';
import type { Rdf12Quad, Rdf12Term, TripleTerm, Reifier } from '../types.js';
import { _RDF, _XSD } from '../ontologies/index.js'

/**
 * Escapes special characters in an IRI for N-Triples/N-Quads format.
 * @param iri The IRI string to escape.
 * @returns The escaped IRI string.
 */
export function escapeIri(iri: string): string {
    let result = '';

    for (let i = 0; i < iri.length; i++) {
        const char = iri[i];
        const code = char.charCodeAt(0);

        // Characters that must be escaped in IRIs
        if (code < 0x20 || char === '<' || char === '>' || char === '"' ||
            char === '{' || char === '}' || char === '|' || char === '^' ||
            char === '`' || char === '\\') {
            if (code <= 0xFFFF) {
                result += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
            } else {
                result += '\\U' + code.toString(16).toUpperCase().padStart(8, '0');
            }
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Escapes special characters in a string literal.
 * @param str The string to escape.
 * @param longString Whether this is a long string (triple-quoted).
 * @returns The escaped string.
 */
export function escapeString(str: string, longString: boolean = false): string {
    let result = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        switch (char) {
            case '\\':
                result += '\\\\';
                break;
            case '\t':
                result += '\\t';
                break;
            case '\n':
                if (longString) {
                    result += char; // Preserve newlines in long strings
                } else {
                    result += '\\n';
                }
                break;
            case '\r':
                if (longString) {
                    result += char; // Preserve carriage returns in long strings
                } else {
                    result += '\\r';
                }
                break;
            case '\b':
                result += '\\b';
                break;
            case '\f':
                result += '\\f';
                break;
            case '"':
                if (longString) {
                    // In long strings, only escape if followed by two more quotes
                    if (i + 2 < str.length && str[i + 1] === '"' && str[i + 2] === '"') {
                        result += '\\"';
                    } else {
                        result += char;
                    }
                } else {
                    result += '\\"';
                }
                break;
            case "'":
                // Single quotes don't need escaping in double-quoted strings
                result += char;
                break;
            default:
                // Escape control characters
                if (code < 0x20) {
                    result += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
                } else {
                    result += char;
                }
        }
    }

    return result;
}

// Characters that need escaping in local names: _~.-!$&'()*+,;=/?#@%
const escapeChars = new Set(['_', '~', '.', '-', '!', '$', '&', "'", '(', ')', '*', '+', ',', ';', '=', '/', '?', '#', '@', '%']);

/**
 * Escapes a local name for use in prefixed names.
 * @param localName The local name to escape.
 * @returns The escaped local name.
 */
export function escapeLocalName(localName: string): string {
    let result = '';

    for (let i = 0; i < localName.length; i++) {
        const char = localName[i];

        if (escapeChars.has(char)) {
            result += '\\' + char;
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Checks if an IRI can be abbreviated using a prefix.
 * @param iri The IRI to check.
 * @param prefixes The prefix mappings.
 * @returns The prefix and local name, or undefined if no match.
 */
export function findPrefix(iri: string, prefixes: Record<string, string>): { prefix: string; localName: string } | undefined {
    for (const [prefix, namespace] of Object.entries(prefixes)) {
        if (iri.startsWith(namespace)) {
            const localName = iri.slice(namespace.length);

            // Check if local name is valid for prefixed names
            if (isValidLocalName(localName)) {
                return { prefix, localName };
            }
        }
    }

    return undefined;
}

/**
 * Checks if a string is a valid local name for prefixed names.
 * @param localName The string to check.
 * @returns True if valid, false otherwise.
 */
export function isValidLocalName(localName: string): boolean {
    if (localName.length === 0) {
        return true; // Empty local name is valid (e.g., ex:)
    }

    // First character must be PN_CHARS_U or digit or certain escaped chars
    const firstChar = localName[0];

    if (!isValidLocalNameStart(firstChar)) {
        return false;
    }

    // Rest of characters must be PN_CHARS or . or : or escaped chars
    for (let i = 1; i < localName.length; i++) {
        const char = localName[i];

        if (!isValidLocalNameChar(char)) {
            return false;
        }
    }

    // Cannot end with a dot
    if (localName.endsWith('.')) {
        return false;
    }

    return true;
}

/**
 * Checks if a character is valid at the start of a local name.
 */
function isValidLocalNameStart(char: string): boolean {
    const code = char.charCodeAt(0);

    return (
        (code >= 0x41 && code <= 0x5A) || // A-Z
        (code >= 0x61 && code <= 0x7A) || // a-z
        code === 0x5F || // _
        (code >= 0x30 && code <= 0x39) || // 0-9
        (code >= 0x00C0 && code <= 0x00D6) ||
        (code >= 0x00D8 && code <= 0x00F6) ||
        (code >= 0x00F8 && code <= 0x02FF) ||
        (code >= 0x0370 && code <= 0x037D) ||
        (code >= 0x037F && code <= 0x1FFF) ||
        (code >= 0x200C && code <= 0x200D) ||
        (code >= 0x2070 && code <= 0x218F) ||
        (code >= 0x2C00 && code <= 0x2FEF) ||
        (code >= 0x3001 && code <= 0xD7FF) ||
        (code >= 0xF900 && code <= 0xFDCF) ||
        (code >= 0xFDF0 && code <= 0xFFFD) ||
        char === ':'
    );
}

/**
 * Checks if a character is valid in the middle/end of a local name.
 */
function isValidLocalNameChar(char: string): boolean {
    if (isValidLocalNameStart(char)) {
        return true;
    } else {
        const code = char.charCodeAt(0);

        return (
            code === 0x2D || // -
            code === 0x2E || // .
            code === 0xB7 || // ·
            (code >= 0x0300 && code <= 0x036F) ||
            (code >= 0x203F && code <= 0x2040)
        );
    }
}

/**
 * Checks if a term is an RDF 1.2 Triple Term.
 */
export function isTripleTerm(term: Term | Rdf12Term): term is TripleTerm {
    return term && term.termType === 'TripleTerm';
}

/**
 * Checks if a term is an RDF 1.2 Reifier.
 */
export function isReifier(term: Term | Rdf12Term): term is Reifier {
    return term && term.termType === 'Reifier';
}

/**
 * Checks if a quad has annotations (RDF 1.2 feature).
 */
export function hasAnnotations(quad: Quad | Rdf12Quad): quad is Rdf12Quad {
    return (quad as Rdf12Quad).annotations !== undefined &&
        (quad as Rdf12Quad).annotations!.length > 0;
}

/**
 * Checks if a quad has a reifier (RDF 1.2 feature).
 */
export function hasReifier(quad: Quad | Rdf12Quad): quad is Rdf12Quad {
    return (quad as Rdf12Quad).reifier !== undefined;
}

/**
 * Checks if a literal needs long string quoting (contains newlines or quotes).
 */
export function needsLongString(value: string): boolean {
    return value.includes('\n') ||
        value.includes('\r') ||
        value.includes('"""') ||
        (value.includes('"') && value.length > 60);
}

/**
 * Checks if a number can be serialized as an integer literal.
 */
export function isInteger(value: string): boolean {
    return /^[+-]?\d+$/.test(value);
}

/**
 * Checks if a number can be serialized as a decimal literal.
 */
export function isDecimal(value: string): boolean {
    return /^[+-]?\d*\.\d+$/.test(value);
}

/**
 * Checks if a number can be serialized as a double literal.
 */
export function isDouble(value: string): boolean {
    return /^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(value);
}

/**
 * Groups quads by subject for more compact serialization.
 */
export function groupQuadsBySubject(quads: Iterable<Quad | Rdf12Quad>): Map<string, Array<Quad | Rdf12Quad>> {
    const groups = new Map<string, Array<Quad | Rdf12Quad>>();

    for (const quad of quads) {
        const key = termToString(quad.subject);

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key)!.push(quad);
    }

    return groups;
}

/**
 * Groups quads by subject and predicate for even more compact serialization.
 */
export function groupQuadsBySubjectPredicate(quads: Iterable<Quad | Rdf12Quad>): Map<string, Map<string, Array<Quad | Rdf12Quad>>> {
    const groups = new Map<string, Map<string, Array<Quad | Rdf12Quad>>>();

    for (const quad of quads) {
        const subjectKey = termToString(quad.subject);

        if (!groups.has(subjectKey)) {
            groups.set(subjectKey, new Map());
        }

        const predicateMap = groups.get(subjectKey)!;
        const predicateKey = termToString(quad.predicate);

        if (!predicateMap.has(predicateKey)) {
            predicateMap.set(predicateKey, []);
        }

        predicateMap.get(predicateKey)!.push(quad);
    }

    return groups;
}

/**
 * Groups quads by graph for TriG serialization.
 */
export function groupQuadsByGraph(quads: Iterable<Quad | Rdf12Quad>): Map<string, Array<Quad | Rdf12Quad>> {
    const groups = new Map<string, Array<Quad | Rdf12Quad>>();

    for (const quad of quads) {
        const key = quad.graph ? termToString(quad.graph) : '';

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key)!.push(quad);
    }

    return groups;
}

/**
 * Converts a term to a string key for grouping purposes.
 */
export function termToString(term: Term | Rdf12Term): string {
    if (!term) {
        return '';
    }

    switch (term.termType) {
        case 'NamedNode':
            return `<${term.value}>`;
        case 'BlankNode':
            return `_:${term.value}`;
        case 'Literal':
            return `"${term.value}"@${(term as Literal).language || ''}^^${(term as Literal).datatype?.value || ''}`;
        case 'Variable':
            return `?${term.value}`;
        case 'DefaultGraph':
            return '';
        case 'TripleTerm':
            const tt = term as TripleTerm;
            return `<<(${termToString(tt.subject)} ${termToString(tt.predicate)} ${termToString(tt.object)})>>`;
        default:
            // For unknown term types, try to access value property safely
            return (term as { value?: string }).value || '';
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

/**
 * Counter for generating unique blank node IDs.
 */
let blankNodeCounter = 0;

/**
 * Resets the blank node counter (useful for testing).
 */
export function resetBlankNodeCounter(): void {
    blankNodeCounter = 0;
}

/**
 * Generates a unique blank node ID.
 */
export function generateBlankNodeId(generator?: (counter: number) => string): string {
    const g = generator || ((n: number) => `b${n}`);

    return g(blankNodeCounter++);
}
