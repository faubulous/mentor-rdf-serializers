import { describe, it, expect, beforeEach } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { JsonLdSerializer } from './jsonld-serializer';

describe('JsonLdSerializer', () => {
    let serializer: JsonLdSerializer;

    beforeEach(() => {
        serializer = new JsonLdSerializer();
    });

    describe('serialize', () => {
        it('should serialize a simple triple', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('value')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['@id']).toBe('http://example.org/subject');
            expect(json['http://example.org/predicate']).toBe('value');
        });

        it('should use @type for rdf:type', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    RdfDataFactory.namedNode('http://example.org/Class')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['@type']).toBe('http://example.org/Class');
        });

        it('should include @context with prefixes', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('value')
                )
            ];

            const result = serializer.serialize(quads, {
                prefixes: { 'ex': 'http://example.org/' }
            });
            const json = JSON.parse(result);

            expect(json['@context']).toBeDefined();
            expect(json['@context']['ex']).toBe('http://example.org/');
        });

        it('should compact IRIs with prefixes', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.namedNode('http://example.org/object')
                )
            ];

            const result = serializer.serialize(quads, {
                prefixes: { 'ex': 'http://example.org/' }
            });
            const json = JSON.parse(result);

            expect(json['@id']).toBe('ex:subject');
            expect(json['ex:predicate']['@id']).toBe('ex:object');
        });

        it('should serialize language-tagged literals', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('Bonjour', 'fr')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['http://example.org/predicate']['@value']).toBe('Bonjour');
            expect(json['http://example.org/predicate']['@language']).toBe('fr');
        });

        it('should serialize the direction of a directional language string', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('مرحبا', { language: 'ar', direction: 'rtl' })
                )
            ];

            const json = JSON.parse(serializer.serialize(quads));

            expect(json['http://example.org/predicate']['@language']).toBe('ar');
            expect(json['http://example.org/predicate']['@direction']).toBe('rtl');
        });

        it('should serialize RDF 1.2 language tag with direction', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('مرحبا', 'ar--rtl')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['http://example.org/predicate']['@value']).toBe('مرحبا');
            expect(json['http://example.org/predicate']['@language']).toBe('ar');
            expect(json['http://example.org/predicate']['@direction']).toBe('rtl');
        });

        it('should serialize typed literals', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('2024-01-01', RdfDataFactory.namedNode('http://www.w3.org/2001/XMLSchema#date'))
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['http://example.org/predicate']['@value']).toBe('2024-01-01');
            expect(json['http://example.org/predicate']['@type']).toBe('http://www.w3.org/2001/XMLSchema#date');
        });

        it('should serialize native JSON types for xsd:integer', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('42', RdfDataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['http://example.org/predicate']).toBe(42);
        });

        it('should serialize native JSON types for xsd:boolean', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/subject'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('true', RdfDataFactory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['http://example.org/predicate']).toBe(true);
        });

        it('should serialize blank nodes with _: prefix', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.blankNode('b0'),
                    RdfDataFactory.namedNode('http://example.org/predicate'),
                    RdfDataFactory.literal('value')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['@id']).toBe('_:b0');
        });

        it('should group multiple triples with same subject', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p1'), RdfDataFactory.literal('v1')),
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p2'), RdfDataFactory.literal('v2'))
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['@id']).toBe('http://example.org/s');
            expect(json['http://example.org/p1']).toBe('v1');
            expect(json['http://example.org/p2']).toBe('v2');
        });

        it('should handle multiple objects for same predicate', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('v1')),
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('v2'))
            ];

            const result = serializer.serialize(quads, { compactArrays: false });
            const json = JSON.parse(result);

            // With compactArrays: false, even single nodes are wrapped in @graph
            expect(json['@graph']).toBeDefined();
            const node = json['@graph'][0];
            expect(Array.isArray(node['http://example.org/p'])).toBe(true);
            expect(node['http://example.org/p']).toContain('v1');
            expect(node['http://example.org/p']).toContain('v2');
        });

        it('should handle named graphs with @graph', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/s'),
                    RdfDataFactory.namedNode('http://example.org/p'),
                    RdfDataFactory.literal('v'),
                    RdfDataFactory.namedNode('http://example.org/g')
                )
            ];

            const result = serializer.serialize(quads);
            const json = JSON.parse(result);

            expect(json['@graph']).toBeDefined();
        });

        it('should pretty print by default', () => {
            const quads = [
                RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/p'), RdfDataFactory.literal('v'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('\n');
        });

        it('should output compact JSON when prettyPrint is false', () => {
            const quads = [
                RdfDataFactory.quad(
                    RdfDataFactory.namedNode('http://example.org/s'),
                    RdfDataFactory.namedNode('http://example.org/p'),
                    RdfDataFactory.literal('v')
                )
            ];

            const result = serializer.serialize(quads, {
                prettyPrint: false
            });

            expect(result).not.toContain('\n');
        });

        it('should return empty object for empty input', () => {
            const result = serializer.serialize([]);
            expect(result).toBe('{}');
        });
    });
});

