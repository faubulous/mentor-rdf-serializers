import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { SemanticSortingStrategy } from './semantic-sorting-strategy.js';

const termValue = (term: unknown) => (term as { value: string }).value;

describe('SemanticSortingStrategy', () => {
    it('orders resources so dependencies come first', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/dependsOn'), DataFactory.namedNode('http://example.org/A')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('A'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/A');
        expect(termValue(quads[1].subject)).toBe('http://example.org/B');
    });

    it('orders dependency chains topologically', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/C'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/B')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/A')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('A'))
        ];

        strategy.prepare(quads);

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/A');
        expect(termValue(quads[1].subject)).toBe('http://example.org/B');
        expect(termValue(quads[2].subject)).toBe('http://example.org/C');
    });

    it('uses alphabetical order when resources have no dependencies', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/Z'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Z')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('A'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/A');
        expect(termValue(quads[1].subject)).toBe('http://example.org/Z');
    });

    it('handles cycles without throwing', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/B')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/A'))
        ];

        strategy.prepare(quads);
        
        const sorted = [...quads].sort((a, b) => strategy.compare(a, b));

        expect(sorted).toHaveLength(2);
    });
});
