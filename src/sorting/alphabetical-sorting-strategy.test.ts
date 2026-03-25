import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { AlphabeticalSortingStrategy } from './alphabetical-sorting-strategy';

const termValue = (term: unknown) => (term as { value: string }).value;

describe('AlphabeticalSortingStrategy', () => {
    it('sorts by subject first', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('x')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('y'))
        ];

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/a');
        expect(termValue(quads[1].subject)).toBe('http://example.org/b');
    });

    it('sorts by predicate when subjects are equal', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p2'), DataFactory.literal('x')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p1'), DataFactory.literal('y'))
        ];

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].predicate)).toBe('http://example.org/p1');
        expect(termValue(quads[1].predicate)).toBe('http://example.org/p2');
    });

    it('sorts by object when subject and predicate are equal', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('z')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('a'))
        ];

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].object)).toBe('a');
        expect(termValue(quads[1].object)).toBe('z');
    });

    it('sorts by subject, then predicate, then object', () => {
        const strategy = new AlphabeticalSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/z'), DataFactory.literal('2')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1'))
        ];

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/a');
        expect(termValue(quads[0].predicate)).toBe('http://example.org/p');
        expect(termValue(quads[1].predicate)).toBe('http://example.org/z');
        expect(termValue(quads[2].subject)).toBe('http://example.org/b');
    });
});
