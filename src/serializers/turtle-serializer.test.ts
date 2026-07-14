import { describe, it, expect, beforeEach } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TurtleLexer, TurtleParser, TurtleReader } from '@faubulous/mentor-rdf-parsers';
import { TurtleSerializer } from './turtle-serializer';

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

            expect(result).toContain('PREFIX ex: <http://example.org/>');
        });

        it('should include base declaration', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o'))
            ];

            const result = serializer.serialize(quads, {
                baseIri: 'http://example.org/'
            });

            expect(result).toContain('BASE <http://example.org/>');
        });

        it('should skip prefix/base directives when emitDirectives is false', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.namedNode('http://example.org/o'))
            ];

            const result = serializer.serialize(quads, {
                baseIri: 'http://example.org/',
                prefixes: { ex: 'http://example.org/' },
                emitDirectives: false
            });

            expect(result).not.toContain('BASE <http://example.org/>');
            expect(result).not.toContain('@base <http://example.org/>');
            expect(result).not.toContain('PREFIX ex: <http://example.org/>');
            expect(result).not.toContain('@prefix ex: <http://example.org/>');
            expect(result).toContain('ex:s ex:p ex:o .');
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

        it('should keep a subject\'s default-graph triples when it also has named-graph triples', () => {
            // Same subject spanning the default graph and a named graph. Grouping
            // is graph-agnostic, so the default-graph triple must survive
            // regardless of which quad groups first.
            const s = DataFactory.namedNode('http://example.org/s');
            const quads = [
                DataFactory.quad(s, DataFactory.namedNode('http://example.org/inGraph'), DataFactory.literal('named'), DataFactory.namedNode('http://example.org/g')),
                DataFactory.quad(s, DataFactory.namedNode('http://example.org/inDefault'), DataFactory.literal('default'))
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('<http://example.org/inDefault>');
            expect(result).not.toContain('<http://example.org/inGraph>');
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

            it('should inline single-use blank nodes when prettyPrint and inlineSingleUseBlankNodes are enabled', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: true,
                });

                expect(result).toContain('[');
                expect(result).toContain(']');
                expect(result).not.toContain('_:b0');
            });

            it('should not inline single-use blank nodes when inlineSingleUseBlankNodes is disabled', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: false,
                });

                expect(result).toContain('_:b0');
                expect(result).not.toContain('[');
            });

            it('should not inline single-use blank nodes in compact mode', () => {
                const quads = [
                    DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.blankNode('b0')),
                    DataFactory.quad(DataFactory.blankNode('b0'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('test'))
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: false,
                    inlineSingleUseBlankNodes: true,
                });

                expect(result).toContain('_:b0');
                expect(result).not.toContain('[');
            });

            it('should inline nested single-use blank nodes recursively', () => {
                const quads = [
                    DataFactory.quad(
                        DataFactory.namedNode('http://example.org/s'),
                        DataFactory.namedNode('http://example.org/p'),
                        DataFactory.blankNode('b0')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/child'),
                        DataFactory.blankNode('b1')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b1'),
                        DataFactory.namedNode('http://example.org/value'),
                        DataFactory.literal('nested')
                    )
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: true,
                });

                expect(result).not.toContain('_:b0');
                expect(result).not.toContain('_:b1');
                expect(result).toContain('[ <http://example.org/value> "nested" ]');
            });

            it('should render unreferenced blank node subjects as anonymous property lists', () => {
                const quads = [
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/p'),
                        DataFactory.literal('root')
                    )
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: true,
                });

                expect(result).not.toContain('_:b0');
                expect(result).toContain('[ <http://example.org/p> "root" ] .');
            });
        });

        describe('maxLineWidth blank node inlining', () => {
            it('inlines multi-predicate blank node when it fits within maxLineWidth', () => {
                const quads = [
                    DataFactory.quad(
                        DataFactory.namedNode('http://example.org/s'),
                        DataFactory.namedNode('http://example.org/p'),
                        DataFactory.blankNode('b0')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/q'),
                        DataFactory.literal('val1')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/r'),
                        DataFactory.literal('val2')
                    ),
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: true,
                    maxLineWidth: 120,
                });

                expect(result).toContain('[ <http://example.org/q> "val1" ; <http://example.org/r> "val2" ]');
            });

            it('keeps multi-predicate blank node multi-line when it exceeds maxLineWidth', () => {
                const quads = [
                    DataFactory.quad(
                        DataFactory.namedNode('http://example.org/s'),
                        DataFactory.namedNode('http://example.org/p'),
                        DataFactory.blankNode('b0')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/q'),
                        DataFactory.literal('val1')
                    ),
                    DataFactory.quad(
                        DataFactory.blankNode('b0'),
                        DataFactory.namedNode('http://example.org/r'),
                        DataFactory.literal('val2')
                    ),
                ];

                const result = serializer.serialize(quads, {
                    prettyPrint: true,
                    inlineSingleUseBlankNodes: true,
                    maxLineWidth: 10,
                });

                // Multi-line: closing bracket on its own line
                expect(result).toMatch(/\n\s*\]/);
            });
        });

        describe('inlineSingleUseBlankNodes with parsed Turtle input', () => {
            function parseQuads(input: string) {
                const lexResult = new TurtleLexer().tokenize(input);
                const cst = new TurtleParser().parse(lexResult.tokens);
                return new TurtleReader().readQuadContexts(cst, lexResult.tokens);
            }

            it('should inline a named blank node referenced inside an RDF collection', () => {
                // Reproduces the BFO pattern where a named blank node (_:genid*)
                // is used as an item in owl:intersectionOf / owl:unionOf collections.
                // The blank node is defined as a top-level subject AND referenced
                // once as a list item inside the collection; it should be inlined.
                const input = [
                    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
                    '',
                    '<http://example.org/A>',
                    '  a owl:ObjectProperty ;',
                    '  rdfs:range [',
                    '    a owl:Class ;',
                    '    owl:intersectionOf (',
                    '      <http://example.org/B>',
                    '      _:genid1',
                    '    )',
                    '  ] .',
                    '',
                    '_:genid1 a owl:Class ;',
                    '  owl:complementOf <http://example.org/C> .',
                ].join('\n');

                const result = serializer.serialize(parseQuads(input), {
                    prefixes: {
                        owl: 'http://www.w3.org/2002/07/owl#',
                        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                    },
                    inlineSingleUseBlankNodes: true,
                    prettyPrint: true,
                });

                // The named blank node should be inlined; no top-level _:genid1 subject.
                expect(result).not.toMatch(/^_:genid1\b/m);
                // Its content must appear somewhere (inlined under rdfs:range).
                expect(result).toContain('owl:complementOf');
            });

            it('should inline multiple named blank nodes each referenced once in collections', () => {
                // Both _:genid1 and _:genid2 appear exactly once, each in a separate
                // owl:intersectionOf list — both should be inlined.
                const input = [
                    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
                    '',
                    '<http://example.org/A>',
                    '  a owl:ObjectProperty ;',
                    '  rdfs:domain [',
                    '    a owl:Class ;',
                    '    owl:intersectionOf (',
                    '      <http://example.org/B>',
                    '      _:genid1',
                    '    )',
                    '  ] ;',
                    '  rdfs:range [',
                    '    a owl:Class ;',
                    '    owl:intersectionOf (',
                    '      <http://example.org/B>',
                    '      _:genid2',
                    '    )',
                    '  ] .',
                    '',
                    '_:genid1 a owl:Class ; owl:complementOf <http://example.org/C> .',
                    '_:genid2 a owl:Class ; owl:complementOf <http://example.org/D> .',
                ].join('\n');

                const result = serializer.serialize(parseQuads(input), {
                    prefixes: {
                        owl: 'http://www.w3.org/2002/07/owl#',
                        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                    },
                    inlineSingleUseBlankNodes: true,
                    prettyPrint: true,
                });

                expect(result).not.toMatch(/^_:genid1\b/m);
                expect(result).not.toMatch(/^_:genid2\b/m);
                expect(result).toContain('owl:complementOf <http://example.org/C>');
                expect(result).toContain('owl:complementOf <http://example.org/D>');
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

    describe('RDF collections', () => {
        const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
        const SH = { in: 'http://www.w3.org/ns/shacl#in', or: 'http://www.w3.org/ns/shacl#or' };

        const PREFIXES = {
            sh: 'http://www.w3.org/ns/shacl#',
            xsd: 'http://www.w3.org/2001/XMLSchema#',
            ex: 'http://example.org/',
        };

        function parseQuads(input: string) {
            const lexResult = new TurtleLexer().tokenize(input);
            const cst = new TurtleParser().parse(lexResult.tokens);
            return new TurtleReader().readQuadContexts(cst, lexResult.tokens);
        }

        /**
         * Builds the quads of a well-formed rdf list attached to a subject,
         * plus optional extra quads, without going through the parser.
         */
        function listQuads(itemValues: string[]) {
            const quads = [];
            const nodes = itemValues.map((_, i) => DataFactory.blankNode(`l${i}`));

            quads.push(DataFactory.quad(
                DataFactory.namedNode('http://example.org/s'),
                DataFactory.namedNode(SH.in),
                nodes[0]
            ));

            for (let i = 0; i < nodes.length; i++) {
                quads.push(DataFactory.quad(nodes[i], DataFactory.namedNode(`${RDF_NS}first`), DataFactory.literal(itemValues[i])));
                quads.push(DataFactory.quad(
                    nodes[i],
                    DataFactory.namedNode(`${RDF_NS}rest`),
                    i < nodes.length - 1 ? nodes[i + 1] : DataFactory.namedNode(`${RDF_NS}nil`)
                ));
            }

            return quads;
        }

        it('should serialize a literal list with collection syntax', () => {
            const input = [
                '@prefix sh: <http://www.w3.org/ns/shacl#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:shape sh:in ("a" "b" "c") .',
            ].join('\n');

            const result = serializer.serialize(parseQuads(input), { prefixes: PREFIXES });

            expect(result).toContain('sh:in ( "a" "b" "c" )');
            expect(result).not.toContain('rdf:first');
            expect(result).not.toContain('_:');
        });

        it('should serialize a list nested inside an inlined blank node', () => {
            // The motivating SHACL shape graph pattern.
            const input = [
                '@prefix sh: <http://www.w3.org/ns/shacl#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:PS sh:path [ sh:alternativePath ( ex:broader ex:narrower ) ] .',
            ].join('\n');

            const result = serializer.serialize(parseQuads(input), { prefixes: PREFIXES });

            expect(result).toContain('[ sh:alternativePath ( ex:broader ex:narrower ) ]');
            expect(result).not.toContain('rdf:first');
        });

        it('should serialize a list of inline blank nodes', () => {
            const input = [
                '@prefix sh: <http://www.w3.org/ns/shacl#> .',
                '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:s sh:or ( [ sh:datatype xsd:string ] [ sh:datatype xsd:integer ] ) .',
            ].join('\n');

            const result = serializer.serialize(parseQuads(input), { prefixes: PREFIXES });

            expect(result).toContain('sh:or ( [ sh:datatype xsd:string ] [ sh:datatype xsd:integer ] )');
            expect(result).not.toContain('rdf:first');
        });

        it('should serialize nested collections', () => {
            const input = [
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:s ex:p ( ex:a ( ex:b ex:c ) ) .',
            ].join('\n');

            const result = serializer.serialize(parseQuads(input), { prefixes: PREFIXES });

            expect(result).toContain('ex:p ( ex:a ( ex:b ex:c ) )');
            expect(result).not.toContain('rdf:first');
        });

        it('should fall back for a list node with extra predicates', () => {
            const quads = listQuads(['a', 'b']);

            // An extra statement on the second list node disqualifies the list.
            quads.push(DataFactory.quad(
                DataFactory.blankNode('l1'),
                DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#comment'),
                DataFactory.literal('annotated')
            ));

            const result = serializer.serialize(quads, { prefixes: PREFIXES });

            expect(result).not.toContain('(');
            expect(result).toContain('first');
            expect(result).toContain('annotated');
        });

        it('should fall back for lists with a shared tail', () => {
            const quads = listQuads(['a', 'b']);

            // A second list head re-uses the tail node of the first list.
            quads.push(DataFactory.quad(
                DataFactory.namedNode('http://example.org/s2'),
                DataFactory.namedNode(SH.in),
                DataFactory.blankNode('h2')
            ));
            quads.push(DataFactory.quad(DataFactory.blankNode('h2'), DataFactory.namedNode(`${RDF_NS}first`), DataFactory.literal('x')));
            quads.push(DataFactory.quad(DataFactory.blankNode('h2'), DataFactory.namedNode(`${RDF_NS}rest`), DataFactory.blankNode('l1')));

            const result = serializer.serialize(quads, { prefixes: PREFIXES });

            expect(result).not.toContain('(');
            expect(result).toContain('first');
        });

        it('should fall back for cyclic rdf:rest chains without hanging', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode(SH.in), DataFactory.blankNode('c0')),
                DataFactory.quad(DataFactory.blankNode('c0'), DataFactory.namedNode(`${RDF_NS}first`), DataFactory.literal('a')),
                DataFactory.quad(DataFactory.blankNode('c0'), DataFactory.namedNode(`${RDF_NS}rest`), DataFactory.blankNode('c1')),
                DataFactory.quad(DataFactory.blankNode('c1'), DataFactory.namedNode(`${RDF_NS}first`), DataFactory.literal('b')),
                DataFactory.quad(DataFactory.blankNode('c1'), DataFactory.namedNode(`${RDF_NS}rest`), DataFactory.blankNode('c0')),
            ];

            const result = serializer.serialize(quads, { prefixes: PREFIXES });

            expect(result).not.toContain('( ');
            expect(result).toContain('first');
        });

        it('should fall back for a doubly-referenced list head', () => {
            const quads = listQuads(['a', 'b']);

            quads.push(DataFactory.quad(
                DataFactory.namedNode('http://example.org/s2'),
                DataFactory.namedNode(SH.in),
                DataFactory.blankNode('l0')
            ));

            const result = serializer.serialize(quads, { prefixes: PREFIXES });

            expect(result).not.toContain('(');
            expect(result).toContain('first');
        });

        it('should fall back for a list head used as a top-level subject', () => {
            // ( "a" "b" ) ex:p ex:o — the head has no object-position reference,
            // so it keeps its blank node form. Its well-formed tail is an
            // independent list and may still collapse — that stays lossless.
            const quads = listQuads(['a', 'b']).slice(1);

            quads.push(DataFactory.quad(
                DataFactory.blankNode('l0'),
                DataFactory.namedNode('http://example.org/p'),
                DataFactory.namedNode('http://example.org/o')
            ));

            const result = serializer.serialize(quads, { prefixes: PREFIXES });

            expect(result).toContain('first> "a"');
            expect(result).toContain('ex:p ex:o');
            expect(result).not.toContain('( "a"');
        });

        it('should not use collection syntax when disabled or not pretty printing', () => {
            const input = [
                '@prefix sh: <http://www.w3.org/ns/shacl#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:shape sh:in ("a" "b") .',
            ].join('\n');

            const disabled = serializer.serialize(parseQuads(input), { prefixes: PREFIXES, inlineCollections: false });
            const compact = serializer.serialize(parseQuads(input), { prefixes: PREFIXES, prettyPrint: false });

            expect(disabled).not.toContain('( "a"');
            expect(disabled).toContain('first');
            expect(compact).not.toContain('( "a"');
        });

        it('should wrap long collections across lines when maxLineWidth is exceeded', () => {
            const input = [
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:s ex:p ( ex:firstLongItem ex:secondLongItem ex:thirdLongItem ) .',
            ].join('\n');

            const narrow = serializer.serialize(parseQuads(input), { prefixes: PREFIXES, maxLineWidth: 20 });
            const wide = serializer.serialize(parseQuads(input), { prefixes: PREFIXES, maxLineWidth: 120 });

            expect(narrow).toMatch(/\(\n/);
            expect(narrow).toMatch(/\n\s+ex:secondLongItem\n/);
            expect(narrow).toMatch(/\n\s*\)/);
            expect(wide).toContain('( ex:firstLongItem ex:secondLongItem ex:thirdLongItem )');
        });
    });

    describe('spaceBeforePunctuation', () => {
        function parseQuads(input: string) {
            const lexResult = new TurtleLexer().tokenize(input);
            const cst = new TurtleParser().parse(lexResult.tokens);
            return new TurtleReader().readQuadContexts(cst, lexResult.tokens);
        }

        const input = [
            '@prefix ex: <http://example.org/> .',
            '',
            'ex:s a ex:T ;',
            '  ex:p ex:a , ex:b ;',
            '  ex:q [ ex:r ex:x ] .',
        ].join('\n');

        it('inserts a space before ; , . by default', () => {
            const result = serializer.serialize(parseQuads(input), {
                prefixes: { ex: 'http://example.org/' },
                directiveStyle: 'turtle',
            });

            expect(result).toContain('@prefix ex: <http://example.org/> .');
            expect(result).toContain('a ex:T ;');
            expect(result).toContain('ex:a , ex:b ;');
            expect(result).toContain('] .');
        });

        it('hugs punctuation when disabled', () => {
            const result = serializer.serialize(parseQuads(input), {
                prefixes: { ex: 'http://example.org/' },
                directiveStyle: 'turtle',
                spaceBeforePunctuation: false,
            });

            expect(result).toContain('@prefix ex: <http://example.org/>.');
            expect(result).toContain('a ex:T;');
            expect(result).toContain('ex:a, ex:b;');
            expect(result).toContain('].');
            expect(result).not.toMatch(/ [;,.](\s|$)/);
        });
    });

    describe('relabelBlankNodes', () => {
        /**
         * Two subjects sharing two blank nodes: the blank nodes are
         * multi-referenced and therefore serialized with their labels.
         */
        function sharedBlankNodeQuads() {
            const quads = [];

            for (const subject of ['http://example.org/a', 'http://example.org/b']) {
                for (const bnode of ['13xf400_b7', '13xf400_b3']) {
                    quads.push(DataFactory.quad(
                        DataFactory.namedNode(subject),
                        DataFactory.namedNode('http://example.org/p'),
                        DataFactory.blankNode(bnode)
                    ));
                }
            }

            quads.push(DataFactory.quad(
                DataFactory.blankNode('13xf400_b7'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('v')
            ));

            return quads;
        }

        it('should rename blank nodes in first-appearance order', () => {
            const result = serializer.serialize(sharedBlankNodeQuads(), { relabelBlankNodes: true });

            expect(result).toContain('_:b0');
            expect(result).toContain('_:b1');
            expect(result).not.toContain('13xf400');
        });

        it('should keep source labels by default', () => {
            const result = serializer.serialize(sharedBlankNodeQuads());

            expect(result).toContain('_:13xf400_b7');
            expect(result).toContain('_:13xf400_b3');
        });
    });

    describe('inline blank node cycles', () => {
        it('should keep mutually-referencing single-use blank nodes as labeled subjects', () => {
            // Each blank node is referenced exactly once — by the other. Naive
            // single-use inlining would skip both definitions and emit nothing.
            const quads = [
                DataFactory.quad(
                    DataFactory.blankNode('x'),
                    DataFactory.namedNode('http://example.org/p'),
                    DataFactory.blankNode('y')
                ),
                DataFactory.quad(
                    DataFactory.blankNode('y'),
                    DataFactory.namedNode('http://example.org/p'),
                    DataFactory.blankNode('x')
                ),
            ];

            const result = serializer.serialize(quads);

            expect(result).toMatch(/^_:x /m);
            expect(result).toMatch(/^_:y /m);
        });

        it('should keep a self-referencing single-use blank node as a labeled subject', () => {
            const quads = [
                DataFactory.quad(
                    DataFactory.blankNode('x'),
                    DataFactory.namedNode('http://example.org/p'),
                    DataFactory.blankNode('x')
                ),
            ];

            const result = serializer.serialize(quads);

            expect(result).toContain('_:x');
            expect(result).toContain('http://example.org/p');
        });
    });
});
