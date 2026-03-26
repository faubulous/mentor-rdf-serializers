import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { hasAnnotations, hasReifier, groupQuadsBySubject, groupQuadsBySubjectPredicate, groupQuadsByGraph } from './quads';
import type { Rdf12Quad } from './types';

const s1 = DataFactory.namedNode('http://example.org/s1');
const s2 = DataFactory.namedNode('http://example.org/s2');
const p1 = DataFactory.namedNode('http://example.org/p1');
const p2 = DataFactory.namedNode('http://example.org/p2');
const g1 = DataFactory.namedNode('http://example.org/g1');

describe('hasAnnotations', () => {
    it('should return false for a regular quad', () => {
        const quad = DataFactory.quad(s1, p1, DataFactory.literal('o'));
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad without annotations', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: DataFactory.literal('o'), graph: DataFactory.defaultGraph() };
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad with an empty annotations array', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: DataFactory.literal('o'), graph: DataFactory.defaultGraph(), annotations: [] };
        expect(hasAnnotations(quad)).toBe(false);
    });

    it('should return true for an RDF 1.2 quad with annotations', () => {
        const annotation: Rdf12Quad = { subject: s2, predicate: p1, object: DataFactory.literal('ann'), graph: DataFactory.defaultGraph() };
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: DataFactory.literal('o'), graph: DataFactory.defaultGraph(), annotations: [annotation] };
        expect(hasAnnotations(quad)).toBe(true);
    });
});

describe('hasReifier', () => {
    it('should return false for a regular quad', () => {
        const quad = DataFactory.quad(s1, p1, DataFactory.literal('o'));
        expect(hasReifier(quad)).toBe(false);
    });

    it('should return false for an RDF 1.2 quad without a reifier', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: DataFactory.literal('o'), graph: DataFactory.defaultGraph() };
        expect(hasReifier(quad)).toBe(false);
    });

    it('should return true for an RDF 1.2 quad with a reifier', () => {
        const quad: Rdf12Quad = { subject: s1, predicate: p1, object: DataFactory.literal('o'), graph: DataFactory.defaultGraph(), reifier: DataFactory.namedNode('http://example.org/r') };
        expect(hasReifier(quad)).toBe(true);
    });
});

describe('groupQuadsBySubject', () => {
    it('should group quads by subject', () => {
        const quads = [
            DataFactory.quad(s1, p1, DataFactory.literal('o1')),
            DataFactory.quad(s1, p1, DataFactory.literal('o2')),
            DataFactory.quad(s2, p1, DataFactory.literal('o3'))
        ];

        const groups = groupQuadsBySubject(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('<http://example.org/s1>')!.length).toBe(2);
        expect(groups.get('<http://example.org/s2>')!.length).toBe(1);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsBySubject([])).toEqual(new Map());
    });
});

describe('groupQuadsBySubjectPredicate', () => {
    it('should group quads by subject and predicate', () => {
        const quads = [
            DataFactory.quad(s1, p1, DataFactory.literal('o1')),
            DataFactory.quad(s1, p2, DataFactory.literal('o2')),
            DataFactory.quad(s1, p1, DataFactory.literal('o3')),
            DataFactory.quad(s2, p1, DataFactory.literal('o4'))
        ];

        const groups = groupQuadsBySubjectPredicate(quads);

        expect(groups.size).toBe(2);
        const s1Group = groups.get('<http://example.org/s1>')!;
        expect(s1Group.size).toBe(2);
        expect(s1Group.get('<http://example.org/p1>')!.length).toBe(2);
        expect(s1Group.get('<http://example.org/p2>')!.length).toBe(1);
        const s2Group = groups.get('<http://example.org/s2>')!;
        expect(s2Group.size).toBe(1);
        expect(s2Group.get('<http://example.org/p1>')!.length).toBe(1);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsBySubjectPredicate([])).toEqual(new Map());
    });
});

describe('groupQuadsByGraph', () => {
    it('should group quads by graph', () => {
        const quads = [
            DataFactory.quad(s1, p1, DataFactory.literal('o1')),
            DataFactory.quad(s2, p1, DataFactory.literal('o2'), g1)
        ];

        const groups = groupQuadsByGraph(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('')!.length).toBe(1);
        expect(groups.get('<http://example.org/g1>')!.length).toBe(1);
    });

    it('should group multiple quads into the same graph', () => {
        const quads = [
            DataFactory.quad(s1, p1, DataFactory.literal('o1'), g1),
            DataFactory.quad(s2, p1, DataFactory.literal('o2'), g1)
        ];

        const groups = groupQuadsByGraph(quads);

        expect(groups.size).toBe(1);
        expect(groups.get('<http://example.org/g1>')!.length).toBe(2);
    });

    it('should return an empty map for an empty input', () => {
        expect(groupQuadsByGraph([])).toEqual(new Map());
    });
});
