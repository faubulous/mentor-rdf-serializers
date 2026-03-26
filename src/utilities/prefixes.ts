import { isValidLocalName } from './escaping.js';

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
