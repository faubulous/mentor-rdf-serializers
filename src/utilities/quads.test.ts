import { describe, it, expect } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { hasAnnotations, hasReifier, groupQuadsBySubject, groupQuadsBySubjectPredicate, groupQuadsByGraph } from './quads';
import type { Rdf12Quad } from './types';

const s1 = RdfDataFactory.namedNode('http://example.org/s1');
const s2 = RdfDataFactory.namedNode('http://example.org/s2');
const p1 = RdfDataFactory.namedNode('http://example.org/p1');
const p2 = RdfDataFactory.namedNode('http://example.org/p2');
const g1 = RdfDataFactory.namedNode('http://example.org/g1');

describe('hasAnnotations', () => {
    it('should return false for a regular quad', () => {
        const quad = RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o'));
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad without annotations', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: RdfDataFactory.literal('o'), graph: RdfDataFactory.defaultGraph() };
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad with an empty annotations array', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: RdfDataFactory.literal('o'), graph: RdfDataFactory.defaultGraph(), annotations: [] };
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return true for an RDF 1.2 quad with annotations', () => {
        const annotation: Rdf12Quad = { subject: s2, predicate: p1, object: RdfDataFactory.literal('ann'), graph: RdfDataFactory.defaultGraph() };
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: RdfDataFactory.literal('o'), graph: RdfDataFactory.defaultGraph(), annotations: [annotation] };
        expect(hasAnnotations(quad)).toBe(true);
    });
});

describe('hasReifier', () => {
    it('should return false for a regular quad', () => {
        const quad = RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o'));
        expect(hasReifier(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad without a reifier', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: RdfDataFactory.literal('o'), graph: RdfDataFactory.defaultGraph() };
        expect(hasReifier(quad)).toBe(false);
    });

    it('should return true for an RDF 1.2 quad with a reifier', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: RdfDataFactory.literal('o'), graph: RdfDataFactory.defaultGraph(), reifier: RdfDataFactory.namedNode('http://example.org/r') };
        expect(hasReifier(quad)).toBe(true);
    });
});

describe('groupQuadsBySubject', () => {
    it('should group quads by subject', () => {
        const quads = [
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o1')),
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o2')),
            RdfDataFactory.quad(s2, p1, RdfDataFactory.literal('o3'))
        ];

        const groups = groupQuadsBySubject(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('http://example.org/s1')!.length).toBe(2);
        expect(groups.get('http://example.org/s2')!.length).toBe(1);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsBySubject([])).toEqual(new Map());
    });
});

describe('groupQuadsBySubjectPredicate', () => {
    it('should group quads by subject and predicate', () => {
        const quads = [
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o1')),
            RdfDataFactory.quad(s1, p2, RdfDataFactory.literal('o2')),
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o3')),
            RdfDataFactory.quad(s2, p1, RdfDataFactory.literal('o4'))
        ];

        const groups = groupQuadsBySubjectPredicate(quads);

        expect(groups.size).toBe(2);
        const s1Group = groups.get('http://example.org/s1')!;
        expect(s1Group.size).toBe(2);
        expect(s1Group.get('http://example.org/p1')!.length).toBe(2);
        expect(s1Group.get('http://example.org/p2')!.length).toBe(1);
        const s2Group = groups.get('http://example.org/s2')!;
        expect(s2Group.size).toBe(1);
        expect(s2Group.get('http://example.org/p1')!.length).toBe(1);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsBySubjectPredicate([])).toEqual(new Map());
    });
});

describe('groupQuadsByGraph', () => {
    it('should group quads by graph', () => {
        const quads = [
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o1')),
            RdfDataFactory.quad(s2, p1, RdfDataFactory.literal('o2'), g1)
        ];

        const groups = groupQuadsByGraph(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('')!.length).toBe(1);
        expect(groups.get('http://example.org/g1')!.length).toBe(1);
    });

    it('should group multiple quads into the same graph', () => {
        const quads = [
            RdfDataFactory.quad(s1, p1, RdfDataFactory.literal('o1'), g1),
            RdfDataFactory.quad(s2, p1, RdfDataFactory.literal('o2'), g1)
        ];

        const groups = groupQuadsByGraph(quads);

        expect(groups.size).toBe(1);
        expect(groups.get('http://example.org/g1')!.length).toBe(2);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsByGraph([])).toEqual(new Map());
    });
});

describe('grouping keys', () => {
    it('tell apart an IRI and a blank node with the same value', () => {
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('b0'), p1, s1),
            RdfDataFactory.quad(RdfDataFactory.blankNode('b0'), p1, s1)
        ];

        expect(groupQuadsBySubject(quads).size).toBe(2);
    });
});
