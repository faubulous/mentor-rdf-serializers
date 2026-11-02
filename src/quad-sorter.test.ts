import { describe, it, expect } from 'vitest';
import { RdfDataFactory } from './data-factory';
import { QuadSorter } from './quad-sorter';
import { AlphabeticalSortingStrategy } from './sorting/alphabetical-sorting-strategy';

const termValue = (term: unknown) => (term as { value: string }).value;

describe('QuadSorter', () => {
    it('does not sort when strategy is false', () => {
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/b'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/a'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('2'))
        ];

        const result = QuadSorter.sort(quads, false);

        expect(termValue(result[0].subject)).toBe('http://example.org/b');
    });

    it('uses default alphabetical strategy when strategy is true', () => {
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/b'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/a'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('2'))
        ];

        const result = QuadSorter.sort(quads, true);

        expect(termValue(result[0].subject)).toBe('http://example.org/a');
    });

    it('accepts a custom comparator function', () => {
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/short'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/verylongname'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('2'))
        ];

        const result = QuadSorter.sort(quads, (a, b) => termValue(a.subject).length - termValue(b.subject).length);

        expect(termValue(result[0].subject)).toBe('http://example.org/short');
    });

    it('accepts a strategy object and runs prepare + compare', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/b'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/a'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('2'))
        ];

        const result = QuadSorter.sort(quads, strategy);

        expect(termValue(result[0].subject)).toBe('http://example.org/a');
    });

    it('does not mutate the original input array', () => {
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/b'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('1')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/a'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('2'))
        ];

        const original = [...quads];
        
        QuadSorter.sort(quads, true);

        expect(termValue(quads[0].subject)).toBe(termValue(original[0].subject));
    });
});
