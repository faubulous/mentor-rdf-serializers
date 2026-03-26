import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from './types.js';
import { termToString } from './terms.js';

/**
 * Checks if a quad has annotations (RDF 1.2 feature).
 */
export function hasAnnotations(quad: Quad | Rdf12Quad): quad is Rdf12Quad {
    const q = quad as Rdf12Quad;
    return q.annotations !== undefined && q.annotations!.length > 0;
}

/**
 * Checks if a quad has a reifier (RDF 1.2 feature).
 */
export function hasReifier(quad: Quad | Rdf12Quad): quad is Rdf12Quad {
    const q = quad as Rdf12Quad;
    return q.reifier !== undefined;
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
