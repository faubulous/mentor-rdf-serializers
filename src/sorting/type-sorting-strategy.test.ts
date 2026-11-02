import { describe, it, expect } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { TypeSortingStrategy } from './type-sorting-strategy';

const termValue = (term: unknown) => (term as { value: string }).value;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

describe('TypeSortingStrategy', () => {
    it('groups quads by their rdf:type', () => {
        const strategy = new TypeSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/instance1'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/TypeB')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/instance1'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Instance 1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/instance2'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/TypeA')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/instance2'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Instance 2'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/instance2');
        expect(termValue(quads[1].subject)).toBe('http://example.org/instance2');
        expect(termValue(quads[2].subject)).toBe('http://example.org/instance1');
    });

    it('groups typed subjects before untyped subjects by default', () => {
        const strategy = new TypeSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/u'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Untyped')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/t'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/TypeA')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/t'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Typed'))
        ];

        strategy.prepare(quads);

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/t');
        expect(termValue(quads[2].subject)).toBe('http://example.org/u');
    });

    it('places untyped resources at the end by default', () => {
        const strategy = new TypeSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/untyped'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('No type')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/typed'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/Type')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/typed'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Has type'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/typed');
        expect(termValue(quads[quads.length - 1].subject)).toBe('http://example.org/untyped');
    });

    it('can place untyped subjects at the start', () => {
        const strategy = new TypeSortingStrategy({ unmatchedPosition: 'start' });
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/t'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/TypeA')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/u'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Untyped'))
        ];

        strategy.prepare(quads);
        
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/u');
    });
});
