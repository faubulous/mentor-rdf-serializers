import { describe, it, expect, beforeEach } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { NTriplesSerializer } from './serializer.js';

describe('NTriplesSerializer', () => {
    let serializer: NTriplesSerializer;

    beforeEach(() => {
        serializer = new NTriplesSerializer();
    });

    describe('serializeQuad', () => {
        it('should serialize a simple triple', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.namedNode('http://example.org/object')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> <http://example.org/object> .');
        });

        it('should serialize triple with blank node subject', () => {
            const q = DataFactory.quad(
                DataFactory.blankNode('b0'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.namedNode('http://example.org/object')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('_:b0 <http://example.org/predicate> <http://example.org/object> .');
        });

        it('should serialize triple with string literal', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('Hello, World!')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Hello, World!" .');
        });

        it('should serialize triple with language-tagged literal', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('Bonjour', 'fr')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Bonjour"@fr .');
        });

        it('should serialize triple with typed literal', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('42', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .');
        });

        it('should escape special characters in strings', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('Hello\nWorld\t"Test"')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Hello\\nWorld\\t\\"Test\\"" .');
        });

        it('should escape special characters in IRIs', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.namedNode('http://example.org/object with spaces')
            );

            // Note: space is not escaped in IRIs per spec, but other chars are
            const result = serializer.serializeQuad(q);

            expect(result).toContain('<http://example.org/object with spaces>');
        });
    });

    describe('serialize', () => {
        it('should serialize multiple triples', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('<http://example.org/s1> <http://example.org/p> "o1" .');
            expect(result).toContain('<http://example.org/s2> <http://example.org/p> "o2" .');
        });

        it('should skip quads with named graphs', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2'), DataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('<http://example.org/s1>');
            expect(result).not.toContain('<http://example.org/s2>');
        });

        it('should sort triples when requested', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'))
            ];

            const result = serializer.serialize(quads, { sort: true });
            const lines = result.trim().split('\n');

            expect(lines[0]).toContain('<http://example.org/a>');
            expect(lines[1]).toContain('<http://example.org/b>');
        });

        it('should handle empty input', () => {
            const result = serializer.serialize([]);
            expect(result).toBe('');
        });
    });

    describe('format', () => {
        it('should return warnings for named graphs', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'), DataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.format(quads);

            expect(result.warnings).toBeDefined();
            expect(result.warnings![0]).toContain('Named graph ignored');
        });
    });
});

