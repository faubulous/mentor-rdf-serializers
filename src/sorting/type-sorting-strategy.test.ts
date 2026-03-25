import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TypeSortingStrategy } from './type-sorting-strategy.js';

const termValue = (term: unknown) => (term as { value: string }).value;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

describe('TypeSortingStrategy', () => {
    it('groups quads by their rdf:type', () => {
        const strategy = new TypeSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/instance1'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeB')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/instance1'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Instance 1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/instance2'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeA')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/instance2'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Instance 2'))
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
            DataFactory.quad(DataFactory.namedNode('http://example.org/u'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Untyped')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/t'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeA')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/t'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Typed'))
        ];

        strategy.prepare(quads);

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/t');
        expect(termValue(quads[2].subject)).toBe('http://example.org/u');
    });

    it('places untyped resources at the end by default', () => {
        const strategy = new TypeSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/untyped'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('No type')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/Type')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Has type'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/typed');
        expect(termValue(quads[quads.length - 1].subject)).toBe('http://example.org/untyped');
    });

    it('can place untyped subjects at the start', () => {
        const strategy = new TypeSortingStrategy({ unmatchedPosition: 'start' });
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/t'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeA')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/u'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Untyped'))
        ];

        strategy.prepare(quads);
        
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/u');
    });
});
