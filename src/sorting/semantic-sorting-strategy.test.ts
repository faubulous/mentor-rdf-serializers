import { describe, it, expect } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { SemanticSortingStrategy } from './semantic-sorting-strategy';

const termValue = (term: unknown) => (term as { value: string }).value;

describe('SemanticSortingStrategy', () => {
    it('orders resources so dependencies come first', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/B'), RdfDataFactory.namedNode('http://example.org/dependsOn'), RdfDataFactory.namedNode('http://example.org/A')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/A'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('A'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/A');
        expect(termValue(quads[1].subject)).toBe('http://example.org/B');
    });

    it('orders dependency chains topologically', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/C'), RdfDataFactory.namedNode('http://example.org/uses'), RdfDataFactory.namedNode('http://example.org/B')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/B'), RdfDataFactory.namedNode('http://example.org/uses'), RdfDataFactory.namedNode('http://example.org/A')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/A'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('A'))
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
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/Z'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('Z')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/A'), RdfDataFactory.namedNode('http://example.org/name'), RdfDataFactory.literal('A'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/A');
        expect(termValue(quads[1].subject)).toBe('http://example.org/Z');
    });

    it('handles cycles without throwing', () => {
        const strategy = new SemanticSortingStrategy();
        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/A'), RdfDataFactory.namedNode('http://example.org/uses'), RdfDataFactory.namedNode('http://example.org/B')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/B'), RdfDataFactory.namedNode('http://example.org/uses'), RdfDataFactory.namedNode('http://example.org/A'))
        ];

        strategy.prepare(quads);
        
        const sorted = [...quads].sort((a, b) => strategy.compare(a, b));

        expect(sorted).toHaveLength(2);
    });
});
