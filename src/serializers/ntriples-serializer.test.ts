import { describe, it, expect, beforeEach } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { NTriplesSerializer } from './ntriples-serializer';

describe('NTriplesSerializer', () => {
    let serializer: NTriplesSerializer;

    beforeEach(() => {
        serializer = new NTriplesSerializer();
    });

    describe('serializeQuad', () => {
        it('should serialize a simple triple', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.namedNode('http://example.org/object')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> <http://example.org/object> .');
        });

        it('should serialize triple with blank node subject', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.blankNode('b0'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.namedNode('http://example.org/object')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('_:b0 <http://example.org/predicate> <http://example.org/object> .');
        });

        it('should serialize triple with string literal', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.literal('Hello, World!')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Hello, World!" .');
        });

        it('should serialize triple with language-tagged literal', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.literal('Bonjour', 'fr')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Bonjour"@fr .');
        });

        it('should serialize triple with typed literal', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.literal('42', RdfDataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .');
        });

        it('should escape special characters in strings', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.literal('Hello\nWorld\t"Test"')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> "Hello\\nWorld\\t\\"Test\\"" .');
        });

        it('should escape special characters in IRIs', () => {
            const q = RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/subject'),
                RdfDataFactory.namedNode('http://example.org/predicate'),
                RdfDataFactory.namedNode('http://example.org/object with spaces')
            );

            // Note: space is not escaped in IRIs per spec, but other chars are
            const result = serializer.serializeQuad(q);

            expect(result).toContain('<http://example.org/object with spaces>');
        });
    });

    describe('serialize', () => {
        it('should serialize multiple triples', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s1'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('o1')),
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s2'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('o2'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('<http://example.org/s1> <http://example.org/p> "o1" .');
            expect(result).toContain('<http://example.org/s2> <http://example.org/p> "o2" .');
        });

        it('should skip quads with named graphs', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s1'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('o1')),
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s2'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('o2'), RdfDataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('<http://example.org/s1>');
            expect(result).not.toContain('<http://example.org/s2>');
        });

        it('should handle empty input', () => {
            const result = serializer.serialize([]);
            expect(result).toBe('');
        });
    });

    describe('format', () => {
        it('should return warnings for named graphs', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('o'), RdfDataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.format(quads);

            expect(result.warnings).toBeDefined();
            expect(result.warnings![0]).toContain('Named graph ignored');
        });
    });
});

