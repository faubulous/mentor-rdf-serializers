import { describe, it, expect } from 'vitest';
import { TurtleFormatter } from '../formatters/turtle-formatter';

describe('TurtleFormatter', () => {
    const formatter = new TurtleFormatter();

    describe('comments', () => {
        it('should not insert a blank line between a leading comment and the first subject', () => {
            const input = [
                '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
                '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
                '@prefix : <file:error-missing-semicolon.ttl#> .',
                '',
                '# This is a test file with a comment.',
                ':Test a rdfs:Class ;',
                '    skos:prefLabel "Test"@en .',
            ].join('\n');

            const result = formatter.formatFromText(input);

            expect(result.output).toContain('# This is a test file with a comment.');

            // The comment should directly precede the first subject block.
            expect(result.output).toMatch(/# This is a test file with a comment\.[^\S\n]*\n\s*:Test/);
            expect(result.output).not.toMatch(/#[^\n]*\n\s*\n\s*:Test/);
        });

        it('should keep a trailing same-line comment attached to the triple', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':Test :label "Example" . # trailing comment',
            ].join('\n');

            const result = formatter.formatFromText(input);

            expect(result.output).toMatch(/:Test\s+:label\s+"Example"\.\s+# trailing comment/);
        });

        it('should not insert a blank line between a leading comment and a subsequent subject', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':A a :ClassA .',
                '',
                '# Comment for B.',
                ':B a :ClassB .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // The comment should directly precede :B without a blank line in between.
            expect(result.output).toMatch(/# Comment for B\.\n:B/);
            expect(result.output).not.toMatch(/# Comment for B\.\n\n:B/);
        });

        it('should not insert blank line between multi-line comment block and subject', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':A a :ClassA .',
                '',
                '# First comment.',
                '# Second comment.',
                ':B a :ClassB .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // Both comments should precede :B with no blank line before it.
            expect(result.output).toMatch(/# Second comment\.\n:B/);
            expect(result.output).not.toMatch(/# Second comment\.\n\n:B/);
        });

        it('should keep inline comment after semicolon on the same line', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':X a :Class ;',
                '    :label "Name" ; # inline note',
                '    :value "42" .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
            });

            // The comment should remain on the same line as the semicolon.
            expect(result.output).toMatch(/; # inline note/);
            expect(result.output).not.toMatch(/;\n\s*# inline note/);
        });

        it('should keep inline comment after period on the same line', () => {
            const input = [
                ':X a :Class . # end comment',
            ].join('\n');

            const result = formatter.formatFromText(input);

            expect(result.output).toMatch(/\. # end comment/);
        });

        it('should preserve blank line between block comment and first subject', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                '# Section header',
                '',
                ':First a :Class .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // There should be a blank line between the comment and the subject.
            expect(result.output).toMatch(/# Section header\n\n:First/);
        });

        it('should preserve blank line between block comment and subsequent subject', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':A a :ClassA .',
                '',
                '# Section header',
                '',
                ':B a :ClassB .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // There should be a blank line between the comment and the subject.
            expect(result.output).toMatch(/# Section header\n\n:B/);
        });

        it('should not insert blank line when comment directly precedes subject on adjacent lines', () => {
            const input = [
                '@prefix : <http://example.org/> .',
                '',
                ':A a :ClassA .',
                '',
                '# Directly before B.',
                ':B a :ClassB .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // No blank line between comment and subject.
            expect(result.output).toMatch(/# Directly before B\.\n:B/);
        });
    });

    describe('newlineAfterSubject', () => {
        it('puts the subject on its own line and indents the predicate list', () => {
            const input = 'ex:s a ex:T; ex:p ex:o.';

            const result = formatter.formatFromText(input, {
                indent: '  ',
                newlineAfterSubject: true,
                maxLineWidth: 120,
            });

            expect(result.output).toBe(['ex:s', '  a ex:T;', '  ex:p ex:o.'].join('\n'));
        });

        it('does not treat the first predicate in a blank node property list as a subject', () => {
            const input = 'ex:s ex:p [ a ex:T; ex:q ex:o ].';

            const result = formatter.formatFromText(input, {
                indent: '  ',
                newlineAfterSubject: true,
                maxLineWidth: 120,
            });

            // Within [ ... ], the formatter should not insert a newline between
            // the predicate `a` and its object.
            expect(result.output).toContain('a ex:T; ex:q ex:o');
        });
    });

    describe('inline statements (semicolon on single line)', () => {
        it('should keep a short statement on one line when source has no line breaks', () => {
            const input = 'ex:part a ex:Part; ex:hasCO ex:co1.';

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            expect(result.output).toBe('ex:part a ex:Part; ex:hasCO ex:co1.');
        });

        it('should keep a short statement on one line even with maxLineWidth 0 when source is inline', () => {
            const input = 'ex:part a ex:Part; ex:hasCO ex:co1.';

            const result = formatter.formatFromText(input);

            expect(result.output).toBe('ex:part a ex:Part; ex:hasCO ex:co1.');
        });

        it('should break a statement when source has explicit line breaks after semicolon', () => {
            const input = [
                'ex:part a ex:Part;',
                '  ex:hasCO ex:co1.',
            ].join('\n');

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            // Should follow the source layout and break
            expect(result.output).toContain(';\n');
        });

        it('should break a long statement that exceeds maxLineWidth', () => {
            const input = 'ex:veryLongSubjectName a ex:VeryLongTypeName; ex:veryLongPredicateName ex:veryLongObjectName.';

            const result = formatter.formatFromText(input, { maxLineWidth: 40 });

            // Should break because total length exceeds 40
            expect(result.output).toContain(';\n');
        });

        it('should keep multiple semicolons on one line when it fits', () => {
            const input = 'ex:s a ex:T; ex:p1 ex:o1; ex:p2 ex:o2.';

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            expect(result.output).toBe('ex:s a ex:T; ex:p1 ex:o1; ex:p2 ex:o2.');
        });

        it('should break when source has line breaks even if it would fit', () => {
            const input = [
                'ex:s a ex:T;',
                '  ex:p1 ex:o1;',
                '  ex:p2 ex:o2.',
            ].join('\n');

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            // Source had explicit line breaks, so follow them
            expect(result.output).toContain(';\n');
        });

        it('should handle inline statement inside blank node brackets', () => {
            const input = [
                'ex:s ex:p [',
                '  a ex:T; ex:q ex:o',
                '].',
            ].join('\n');

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            // The inner statement inside [] should stay inline since source had it inline
            expect(result.output).toContain('a ex:T; ex:q ex:o');
        });

        it('should handle prefix declarations followed by an inline statement', () => {
            const input = [
                '@prefix ex: <http://example.org/>.',
                'ex:s a ex:T; ex:p ex:o.',
            ].join('\n');

            const result = formatter.formatFromText(input, { maxLineWidth: 80 });

            expect(result.output).toContain('ex:s a ex:T; ex:p ex:o.');
        });
    });

    describe('blank node property lists', () => {
        it('aligns closing bracket with predicate indentation', () => {
            const input = [
                'ex:shape a sh:NodeShape;',
                '  sh:property [',
                '      sh:path ex:Code ;',
                '      sh:maxCount 1 ;',
                '  ].',
            ].join('\n');

            const result = formatter.formatFromText(input, { indent: '  ' });

            const lines = result.output.split('\n');

            const closingLine = lines[lines.length - 1];
            expect(closingLine.trim()).toBe('].');
            expect(closingLine.startsWith('  ')).toBe(true);
        });

        it('indents blank node contents one level deeper than the predicate', () => {
            const input = [
                '<ex:s> a sh:NodeShape ;',
                '  sh:property [',
                '  sh:path <ex:p1> ;',
                '  sh:class <ex:C1>',
                '  ], [',
                '  sh:path <ex:p2> ;',
                '  sh:class <ex:C2>',
                '  ] ;',
                '  sh:targetClass <ex:T> .',
            ].join('\n');

            const result = formatter.formatFromText(input, { indent: '  ' });

            // Predicate line
            expect(result.output).toContain('\n  sh:property [');

            // Inner blank node property list should be indented one level deeper
            expect(result.output).toContain('\n    sh:path <ex:p1>;');
            expect(result.output).toContain('\n    sh:class <ex:C1>');

            // Closing bracket + comma should align with predicate indentation
            expect(result.output).toContain('\n  ], [');

            // Final closing bracket before ';' should align too
            expect(result.output).toContain('\n  ];');
        });

        it('does not insert empty lines between nested bracket and collection boundaries', () => {
            const input = [
                'gist:Account a owl:Class ;',
                'rdfs:isDefinedBy <https://w3id.org/semanticarts/ontology/gistCore> ;',
                'owl:equivalentClass [',
                '    a owl:Class ;',
                '    owl:intersectionOf (gist:Agreement [',
                '        a owl:Restriction ;',
                '        owl:onProperty gist:hasMagnitude ;',
                '        owl:someValuesFrom gist:Balance ;',
                '    ]) ;',
                '] ;',
                'skos:definition "An agreement having a balance, as in a bank account, or credit card account, or Accounts Receivable account."^^xsd:string ;',
                'skos:prefLabel "Account"^^xsd:string ;',
                '.',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                indent: '    ',
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            expect(result.output).not.toContain(';\n\n    ])');
            expect(result.output).not.toContain(']) ;\n\n] ;');
            expect(result.output).not.toContain('[\n\n    a owl:Class');
        });

        it('formats the owl:equivalentClass nested block without internal empty lines', () => {
            const input = [
                'gist:Account a owl:Class ;',
                'rdfs:isDefinedBy <https://w3id.org/semanticarts/ontology/gistCore> ;',
                'owl:equivalentClass [',
                '    a owl:Class ;',
                '    owl:intersectionOf (gist:Agreement [',
                '        a owl:Restriction ;',
                '        owl:onProperty gist:hasMagnitude ;',
                '        owl:someValuesFrom gist:Balance ;',
                '    ]) ;',
                '] ;',
                'skos:definition "An agreement having a balance, as in a bank account, or credit card account, or Accounts Receivable account."^^xsd:string ;',
                'skos:prefLabel "Account"^^xsd:string ;',
                '.',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                indent: '    ',
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            const expectedBlock = [
                '    owl:equivalentClass [',
                '        a owl:Class;',
                '        owl:intersectionOf (',
                '            gist:Agreement',
                '            [',
                '                a owl:Restriction;',
                '                owl:onProperty gist:hasMagnitude;',
                '                owl:someValuesFrom gist:Balance;',
                '            ]',
                '        );',
                '    ];',
            ].join('\n');

            expect(result.output).toContain(expectedBlock);
        });

        it('preserves multiline collection items between adjacent blank-node restrictions', () => {
            const input = [
                '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                '@prefix gist: <https://w3id.org/semanticarts/ns/ontology/gist/> .',
                '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
                '',
                'gist:Contract a owl:Class ;',
                '    owl:equivalentClass [',
                '        a owl:Class ;',
                '        owl:intersectionOf (',
                '            gist:Commitment',
                '            [',
                '                a owl:Restriction ;',
                '                owl:onProperty gist:hasParty ;',
                '                owl:someValuesFrom [',
                '                    a owl:Class ;',
                '                    owl:unionOf (',
                '                        gist:Organization',
                '                        gist:Person',
                '                    ) ;',
                '                ] ;',
                '            ]',
                '            [',
                '                a owl:Restriction ;',
                '                owl:onProperty gist:hasDirectPart ;',
                '                owl:onClass gist:Obligation ;',
                '                owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger ;',
                '            ]',
                '        ) ;',
                '    ] .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                indent: '    ',
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            expect(result.output).toContain('owl:intersectionOf (\n            gist:Commitment\n            [');
            expect(result.output).toContain(']\n            [');
            expect(result.output).toContain('owl:unionOf (\n                        gist:Organization\n                        gist:Person\n                    )');
        });
    });

    describe('blankLinesBetweenSubjects', () => {
        it('inserts an empty line between the last prefix definition and the first subject when enabled', () => {
            const input = [
                '@prefix ex: <http://example.org/>.',
                'ex:s a ex:T. ex:s2 a ex:T2.',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                blankLinesBetweenSubjects: true,
                maxLineWidth: 120,
            });

            expect(result.output).toBe([
                '@prefix ex: <http://example.org/>.',
                '',
                'ex:s a ex:T.',
                '',
                'ex:s2 a ex:T2.',
            ].join('\n'));
        });

        it('does not insert an empty line between prefix definitions and the first subject when disabled', () => {
            const input = [
                '@prefix ex: <http://example.org/>.',
                'ex:s a ex:T. ex:s2 a ex:T2.',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                blankLinesBetweenSubjects: false,
                maxLineWidth: 120,
            });

            expect(result.output).toBe([
                '@prefix ex: <http://example.org/>.',
                'ex:s a ex:T.',
                'ex:s2 a ex:T2.',
            ].join('\n'));
        });

        it('inserts an empty line between root-level subjects when enabled', () => {
            const input = 'ex:s a ex:T. ex:s2 a ex:T2.';

            const result = formatter.formatFromText(input, {
                blankLinesBetweenSubjects: true,
                maxLineWidth: 120,
            });

            expect(result.output).toBe(['ex:s a ex:T.', '', 'ex:s2 a ex:T2.'].join('\n'));
        });

        it('does not insert an empty line between root-level subjects when disabled', () => {
            const input = 'ex:s a ex:T. ex:s2 a ex:T2.';

            const result = formatter.formatFromText(input, {
                blankLinesBetweenSubjects: false,
                maxLineWidth: 120,
            });

            expect(result.output).toBe(['ex:s a ex:T.', 'ex:s2 a ex:T2.'].join('\n'));
        });

        it('does not treat blank node property lists as root-level subjects', () => {
            const input = 'ex:s ex:p [ a ex:T; ex:q ex:o ]. ex:s2 a ex:T2.';

            const result = formatter.formatFromText(input, {
                blankLinesBetweenSubjects: true,
                maxLineWidth: 120,
            });

            // No *empty* line should be inserted inside the blank node property list
            // (the formatter may still choose to pretty-print it across multiple lines).
            expect(result.output).not.toContain('[\n\n');
            expect(result.output).not.toContain(';\n\n');

            // But we should still separate root-level subject blocks
            expect(result.output).toContain('\n\nex:s2 a ex:T2.');
        });
    });

    describe('comment preservation during formatting', () => {
        it('should preserve all comments when formatting a document with multiple subjects', () => {
            const input = [
                '@prefix ex: <http://example.org/> .',
                '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
                '',
                '# This class represents people',
                'ex:Person a rdfs:Class ;',
                '    rdfs:label "Person"@en . # the display name',
                '',
                '# This class represents organizations',
                'ex:Organization a rdfs:Class ;',
                '    rdfs:label "Organization"@en .',
            ].join('\n');

            const result = formatter.formatFromText(input);

            // The token-based formatter preserves all comments from the source.
            expect(result.output).toContain('# This class represents people');
            expect(result.output).toContain('# the display name');
            expect(result.output).toContain('# This class represents organizations');
        });

        it('should preserve comments even after reformatting with different options', () => {
            const input = [
                '@prefix ex: <http://example.org/> .',
                '',
                '# Section header',
                'ex:A ex:p "value" . # inline note',
                '# Another section',
                'ex:B ex:q "other" .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // All comments survive reformatting regardless of options.
            expect(result.output).toContain('# Section header');
            expect(result.output).toContain('# inline note');
            expect(result.output).toContain('# Another section');
        });
    });

    describe('collections (parenthesised lists)', () => {
        it('should not insert extra newlines inside a single-item inline collection', () => {
            const input = [
                '@prefix sh: <http://www.w3.org/ns/shacl#> .',
                '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
                '@prefix exsh: <http://example.org/shapes/> .',
                '',
                'exsh:Shape a sh:NodeShape ;',
                '    sh:datatype rdf:langString ;',
                '    sh:languageIn ("en") ;',
                '    sh:minCount 1 .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                indent: '    ',
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // The collection ("en") must stay on one line with no blank lines.
            expect(result.output).not.toMatch(/\(\s*\n/);
            expect(result.output).toContain('sh:languageIn ("en")');
        });

        it('should place the predicate following an inline collection on its own line', () => {
            const input = [
                '@prefix ex: <http://example.org/> .',
                '',
                'ex:Subject ex:type ex:TypeA ;',
                '    ex:allowedValues ("a" "b") ;',
                '    ex:label "test" .',
            ].join('\n');

            const result = formatter.formatFromText(input, {
                indent: '    ',
                prettyPrint: true,
                blankLinesBetweenSubjects: true,
            });

            // ex:label must appear on its own indented line, not inlined after the collection semicolon.
            expect(result.output).toMatch(/ex:allowedValues \("a" "b"\);\n    ex:label "test"\./);
        });
    });
});
