import { describe, it, expect, beforeEach } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TurtleSerializer } from './serializer.js';

describe('TurtleSerializer', () => {
    let serializer: TurtleSerializer;

    beforeEach(() => {
        serializer = new TurtleSerializer();
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

        it('should use prefixes when available', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.namedNode('http://example.org/object')
            );

            const result = serializer.serializeQuad(q, {
                prefixes: { 'ex': 'http://example.org/' }
            });

            expect(result).toBe('ex:subject ex:predicate ex:object .');
        });

        it('should use "a" shorthand for rdf:type', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                DataFactory.namedNode('http://example.org/Class')
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> a <http://example.org/Class> .');
        });

        it('should serialize boolean true shorthand', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('true', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> true .');
        });

        it('should serialize integer shorthand', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('42', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> 42 .');
        });

        it('should serialize decimal shorthand', () => {
            const q = DataFactory.quad(
                DataFactory.namedNode('http://example.org/subject'),
                DataFactory.namedNode('http://example.org/predicate'),
                DataFactory.literal('3.14', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#decimal'))
            );

            const result = serializer.serializeQuad(q);

            expect(result).toBe('<http://example.org/subject> <http://example.org/predicate> 3.14 .');
        });
    });

    describe('serialize', () => {
        it('should include prefix declarations', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.namedNode('http://example.org/o'))
            ];

            const result = serializer.serialize(quads, {
                prefixes: { 'ex': 'http://example.org/' }
            });

            expect(result).toContain('@prefix ex: <http://example.org/> .');
        });

        it('should include base declaration', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'))
            ];

            const result = serializer.serialize(quads, {
                baseIri: 'http://example.org/'
            });

            expect(result).toContain('@base <http://example.org/> .');
        });

        it('should group triples by subject', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p1'), DataFactory.literal('o1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p2'), DataFactory.literal('o2'))
            ];

            const result = serializer.serialize(quads, { groupBySubject: true });

            // Should use semicolon notation
            expect(result).toContain(';');
        });

        it('should skip quads with named graphs', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'), DataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.serialize(quads);

            expect(result.trim()).not.toContain('<http://example.org/s>');
        });

        it('should handle blank nodes', () => {
            const quads = [
                DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'))
            ];

            const result = serializer.serialize(quads, { groupBySubject: false });

            expect(result).toContain('_:b0');
        });

        it('should use long string quotes for multiline strings', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('line1\nline2'))
            ];

            const result = serializer.serialize(quads, { groupBySubject: false });

            expect(result).toContain('"""');
        });
    });

    describe('format', () => {
        it('should return warnings for named graphs', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'), DataFactory.namedNode('http://example.org/g'))
            ];

            const result = serializer.format(quads);

            expect(result.warnings).toBeDefined();
            expect(result.warnings![0]).toContain('Use TriG instead');
        });
    });

    describe('formatting options', () => {
        describe('blankNodeStyle', () => {
            it('should use labeled style for blank nodes when set to "labeled"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads, { blankNodeStyle: 'labeled' });

                expect(result).toContain('_:b0');
                expect(result).not.toContain('[');
            });

            it('should use inline style for blank nodes when set to "inline"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads, { blankNodeStyle: 'inline' });

                expect(result).toContain('[');
                expect(result).toContain(']');
            });

            it('should use auto style by default', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads);

                // Auto should inline single-reference blank nodes
                expect(result).toContain('[');
            });

            it('should not inline multiply-referenced blank nodes', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('shared'))
                ];

                const result = serializer.serialize(quads, { blankNodeStyle: 'auto' });

                // Should use labeled form since b0 is referenced twice
                expect(result).toContain('_:b0');
            });
        });

        describe('objectListStyle', () => {
            it('should format objects on single line when set to "single-line"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('obj1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('obj2')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('obj3'))
                ];

                const result = serializer.serialize(quads, { objectListStyle: 'single-line' });

                // All objects should be on same line separated by commas
                expect(result).toMatch(/"obj1" , "obj2" , "obj3"/);
            });

            it('should format objects on multiple lines when set to "multi-line"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('obj1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('obj2'))
                ];

                const result = serializer.serialize(quads, { objectListStyle: 'multi-line' });
                const lines = result.split('\n');

                // Objects should be on different lines
                const objLines = lines.filter(l => l.includes('"obj'));
                expect(objLines.length).toBeGreaterThanOrEqual(2);
            });
        });

        describe('predicateListStyle', () => {
            it('should format predicates on single line when set to "single-line"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p1'), DataFactory.literal('o1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p2'), DataFactory.literal('o2'))
                ];

                const result = serializer.serialize(quads, { predicateListStyle: 'single-line' });

                // Should have subject and predicates on same line
                expect(result.split('\n').filter(l => l.trim().length > 0).length).toBeLessThanOrEqual(2);
            });

            it('should format each predicate on its own line when set to "multi-line"', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p1'), DataFactory.literal('o1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p2'), DataFactory.literal('o2'))
                ];

                const result = serializer.serialize(quads, { predicateListStyle: 'multi-line' });

                // Subject should be on its own line, then predicates
                const lines = result.split('\n').filter(l => l.trim().length > 0);
                expect(lines.length).toBeGreaterThanOrEqual(3);
            });
        });

        describe('maxLineWidth', () => {
            it('should wrap long object lists when maxLineWidth is exceeded', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('a very long object value')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('another very long value'))
                ];

                const result = serializer.serialize(quads, { maxLineWidth: 50, objectListStyle: 'auto' });
                const lines = result.split('\n');

                // With low maxLineWidth and two long objects, should wrap
                expect(lines.some(l => l.length > 0 && l.length < 60)).toBe(true);
            });

            it('should not wrap when maxLineWidth is 0', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('short')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('vals'))
                ];

                const result = serializer.serialize(quads, { maxLineWidth: 0, objectListStyle: 'auto' });

                // Objects should be on same line
                expect(result).toMatch(/"short" , "vals"/);
            });
        });

        describe('alignPredicates', () => {
            it('should align predicates when enabled', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/short'), DataFactory.literal('v1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/longPredicate'), DataFactory.literal('v2'))
                ];

                const result = serializer.serialize(quads, { 
                    alignPredicates: true,
                    prefixes: { 'ex': 'http://example.org/' }
                });

                // Shorter predicate should be padded
                const lines = result.split('\n');
                const shortLine = lines.find(l => l.includes('ex:short'));
                expect(shortLine).toBeDefined();
                // The short predicate line should have extra spaces for alignment
                expect(shortLine).toMatch(/ex:short\s+/);
            });
        });

        describe('blankLinesBetweenSubjects', () => {
            it('should add blank lines between subjects when enabled', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2'))
                ];

                const result = serializer.serialize(quads, { blankLinesBetweenSubjects: true });

                // Should have a blank line between subjects
                expect(result).toContain('\n\n');
            });

            it('should not add blank lines when disabled', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2'))
                ];

                const result = serializer.serialize(quads, { blankLinesBetweenSubjects: false });

                // Should not have double newlines
                expect(result).not.toContain('\n\n');
            });
        });
    });

    describe('comment preservation', () => {
        it('does not retain source comments when serializing from quads', () => {
            // Simulate reading a Turtle document that originally contained
            // comments such as:
            //
            //   # This class represents people
            //   ex:Person a rdfs:Class ;
            //       rdfs:label "Person"@en . # the display name
            //
            //   # This class represents organizations
            //   ex:Organization a rdfs:Class ;
            //       rdfs:label "Organization"@en .
            //
            // After parsing, we only have quads — comments are not part of
            // the RDF data model and are therefore lost.

            const quads = [
                DataFactory.quad(
                    DataFactory.namedNode('http://example.org/Person'),
                    DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Class')
                ),
                DataFactory.quad(
                    DataFactory.namedNode('http://example.org/Person'),
                    DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
                    DataFactory.literal('Person', 'en')
                ),
                DataFactory.quad(
                    DataFactory.namedNode('http://example.org/Organization'),
                    DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Class')
                ),
                DataFactory.quad(
                    DataFactory.namedNode('http://example.org/Organization'),
                    DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
                    DataFactory.literal('Organization', 'en')
                ),
            ];

            const result = serializer.serialize(quads, {
                prefixes: {
                    ex: 'http://example.org/',
                    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                },
                sort: true,
            });

            // Quad-based serialization cannot preserve comments because
            // RDF/JS Quad objects do not carry comment metadata.
            // The '#' inside IRIs (e.g. rdfs:) is not a comment marker.
            expect(result).not.toMatch(/^\s*#[^>]/m);
        });
    });
});
