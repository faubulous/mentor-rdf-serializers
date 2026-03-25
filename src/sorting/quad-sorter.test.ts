import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { QuadSorter } from '../quad-sorter.js';
import { AlphabeticalSortingStrategy } from './alphabetical-sorting-strategy.js';

const termValue = (term: unknown) => (term as { value: string }).value;

describe('QuadSorter', () => {
    it('does not sort when strategy is false', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
        ];

        const result = QuadSorter.apply(quads, false);

        expect(termValue(result[0].subject)).toBe('http://example.org/b');
    });

    it('uses default alphabetical strategy when strategy is true', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
        ];

        const result = QuadSorter.apply(quads, true);

        expect(termValue(result[0].subject)).toBe('http://example.org/a');
    });

    it('accepts a custom comparator function', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/short'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/verylongname'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
        ];

        const result = QuadSorter.apply(quads, (a, b) => termValue(a.subject).length - termValue(b.subject).length);

        expect(termValue(result[0].subject)).toBe('http://example.org/short');
    });

    it('accepts a strategy object and runs prepare + compare', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
        ];

        const result = QuadSorter.apply(quads, strategy);

        expect(termValue(result[0].subject)).toBe('http://example.org/a');
    });

    it('does not mutate the original input array', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
        ];

        const original = [...quads];
        QuadSorter.apply(quads, true);

        expect(termValue(quads[0].subject)).toBe(termValue(original[0].subject));
    });
});
