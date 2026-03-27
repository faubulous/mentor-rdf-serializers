import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TurtleLexer, TurtleParser, TurtleReader } from '@faubulous/mentor-rdf-parsers';
import { QuadContextSerializer } from './quad-context-serializer';
import { TurtleSerializer } from './serializers/turtle-serializer';
import { AlphabeticalSortingStrategy } from './sorting/alphabetical-sorting-strategy';

const PREFIX = [
    '@prefix ex: <http://example.org/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .'
].join('\n');

const prefixes = {
    ex: 'http://example.org/',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

/** Parse Turtle text using the turtleDocInfoWithComments API. */
function parseWithComments(input: string) {
    const lexer = new TurtleLexer();
    const lexResult = lexer.tokenize(input);

    const parser = new TurtleParser();
    parser.input = lexResult.tokens;

    const cst = parser.turtleDoc();
    const reader = new TurtleReader();
    const contexts = reader.readQuadContexts(cst, lexResult.tokens);

    return { contexts, tokens: lexResult.tokens, reader };
}

const statementSerializer = new QuadContextSerializer(new TurtleSerializer());

const alphabeticalSort = new AlphabeticalSortingStrategy();

describe('QuadContextSerializer', () => {
    describe('QuadContext shape', () => {
        it('should expose RDF/JS quad fields directly', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            expect(contexts).toHaveLength(1);
            expect(contexts[0].subject.value).toBe('http://example.org/A');
            expect(contexts[0].predicate.value).toBe('http://example.org/p');
            expect(contexts[0].object.value).toBe('http://example.org/B');
        });

        it('should handle multiple quads', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            expect(contexts).toHaveLength(2);
            expect(contexts[0].subject.value).toBe('http://example.org/A');
            expect(contexts[1].subject.value).toBe('http://example.org/C');
        });
    });

    describe('addStatements', () => {
        it('should merge new quads into existing contexts', () => {
            const input = PREFIX + '# Existing\nex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/C'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.namedNode('http://example.org/D')
            );

            const merged = statementSerializer.addStatements(contexts, [newQuad]);

            expect(merged).toHaveLength(2);
            // Original context keeps its comment
            expect(merged[0].leadingComments).toHaveLength(1);
            // New context has no comments
            expect(merged[1].leadingComments).toHaveLength(0);
        });

        it('should preserve original order (no implicit sorting)', () => {
            const input = PREFIX + 'ex:Z ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/A'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('value')
            );

            const merged = statementSerializer.addStatements(contexts, [newQuad]);

            // Order preserved: original first, then new
            expect(merged).toHaveLength(2);
            expect(merged[0].subject.value).toBe('http://example.org/Z');
            expect(merged[1].subject.value).toBe('http://example.org/A');
        });
    });

    describe('sort', () => {
        it('should sort contexts alphabetically', () => {
            const input = PREFIX + 'ex:Z ex:p "a" .\nex:A ex:q "b" .';
            const { contexts } = parseWithComments(input);

            const sorted = statementSerializer.sort(contexts, alphabeticalSort);

            expect(sorted[0].subject.value).toBe('http://example.org/A');
            expect(sorted[1].subject.value).toBe('http://example.org/Z');
        });

        it('should preserve comments when sorting', () => {
            const input = [
                PREFIX,
                '# Comment for Z',
                'ex:Z ex:p "a" .',
                '# Comment for A',
                'ex:A ex:q "b" .',
            ].join('\n');
            const { contexts } = parseWithComments(input);

            const sorted = statementSerializer.sort(contexts, alphabeticalSort);

            // Comments should travel with their quads
            expect(sorted[0].leadingComments?.[0]?.image).toBe('# Comment for A');
            expect(sorted[1].leadingComments?.[0]?.image).toBe('# Comment for Z');
        });
    });

    describe('serialize', () => {
        it('should serialize contexts preserving leading comments', () => {
            const input = [
                PREFIX,
                '# This is Person',
                'ex:Person a rdfs:Class .',
            ].join('\n');
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, { prefixes });

            expect(output).toContain('# This is Person\nex:Person a rdfs:Class .');
        });

        it('should not insert a blank line between a comment block and a following class declaration', () => {
            const input = [
                PREFIX,
                '# Clarify the role of ex:Maintainer in the model.',
                '# This class belongs in the shared ontology layer.',
                'ex:WorkItem a rdfs:Class ;',
                '   rdfs:label "Work Item" ;',
                '   rdfs:comment "A bounded event-driven unit of work that can include sub-activities." ;',
                '   rdfs:subClassOf ex:Event .',
            ].join('\n');
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, { prefixes });

            expect(output).toContain([
                '# Clarify the role of ex:Maintainer in the model.',
                '# This class belongs in the shared ontology layer.',
                'ex:WorkItem a rdfs:Class ;',
            ].join('\n'));
            expect(output).not.toContain([
                '# This class belongs in the shared ontology layer.',
                '',
                'ex:WorkItem a rdfs:Class ;',
            ].join('\n'));
        });

        it('should serialize trailing comments', () => {
            const input = PREFIX + 'ex:A ex:p ex:B . # important';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, { prefixes });

            expect(output).toContain('ex:A ex:p ex:B . # important');
        });

        it('should produce clean output for new quads without comments', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/C'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('value')
            );

            const merged = statementSerializer.addStatements(contexts, [newQuad]);
            const output = statementSerializer.serialize(merged, { prefixes });

            // New quad serialized without any stray comment markers
            expect(output).toContain('ex:C ex:q "value" .');
        });

        it('should add blank lines between different subjects', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes,
                blankLinesBetweenSubjects: true,
            });

            // Blank line between the two statement blocks
            const statementsBlock = output.slice(output.indexOf('ex:A'));
            expect(statementsBlock).toContain('\n\n');
        });

        it('should not add blank lines when disabled', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes,
                blankLinesBetweenSubjects: false,
            });

            // No double newlines between statements (only after prefix block)
            const statementsStart = output.indexOf('ex:A');
            const statementsBlock = output.slice(statementsStart);
            expect(statementsBlock).not.toContain('\n\n');
        });

        it('should emit PREFIX declarations (uppercase by default)', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, { prefixes });

            expect(output).toContain('PREFIX ex: <http://example.org/>');
            expect(output).toContain('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>');
        });

        it('should emit @prefix declarations when lowercaseDirectives is true', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes,
                lowercaseDirectives: true,
            });

            expect(output).toContain('@prefix ex: <http://example.org/> .');
            expect(output).toContain('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
        });

        it('should emit BASE declaration when baseIri is provided', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes,
                baseIri: 'http://example.org/',
            });

            expect(output).toContain('BASE <http://example.org/>');
        });

        it('should emit @base when lowercaseDirectives is true', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes,
                baseIri: 'http://example.org/',
                lowercaseDirectives: true,
            });

            expect(output).toContain('@base <http://example.org/> .');
        });

        it('should sort inline when sort option is set', () => {
            const input = PREFIX + 'ex:Z ex:p ex:B .\nex:A ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, { prefixes, sortingStrategy: alphabeticalSort });

            const aIdx = output.indexOf('ex:A');
            const zIdx = output.indexOf('ex:Z');
            expect(aIdx).toBeLessThan(zIdx);
        });

        it('should not emit duplicated blank node prefixes when sorting', () => {
            const contexts = statementSerializer.addStatements([], [
                DataFactory.quad(
                    DataFactory.blankNode('genid200'),
                    DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    DataFactory.namedNode('http://www.w3.org/2002/07/owl#Class')
                ),
                DataFactory.quad(
                    DataFactory.blankNode('_:genid100'),
                    DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    DataFactory.namedNode('http://www.w3.org/2002/07/owl#Class')
                ),
            ]);

            const output = statementSerializer.serialize(contexts, {
                prefixes: { owl: 'http://www.w3.org/2002/07/owl#' },
                sortingStrategy: alphabeticalSort,
                inlineSingleUseBlankNodes: false,
            });

            expect(output).toContain('_:genid100 a owl:Class .');
            expect(output).not.toContain('_:_:genid100');
        });

        it('should inline single-use blank nodes in an OWL-style nested text fixture', () => {
            const input = [
                '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
                '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
                '',
                '<http://example.org/Process> a owl:Class ;',
                '  rdfs:subClassOf [',
                '    a owl:Restriction ;',
                '    owl:allValuesFrom [',
                '      a owl:Class ;',
                '      owl:unionOf (',
                '        <http://example.org/Process>',
                '        <http://example.org/Boundary>',
                '      )',
                '    ] ;',
                '    owl:onProperty <http://example.org/hasPart>',
                '  ] .',
                '',
                '<http://example.org/locationOfAtSomeTime>',
                '  a owl:ObjectProperty ;',
                '  rdfs:domain [',
                '    a owl:Class ;',
                '    owl:intersectionOf (',
                '      <http://example.org/IndependentContinuant>',
                '      _:genid66',
                '    )',
                '  ] ;',
                '  rdfs:range [',
                '    a owl:Class ;',
                '    owl:intersectionOf (',
                '      <http://example.org/IndependentContinuant>',
                '      _:genid70',
                '    )',
                '  ] .',
                '',
                '_:genid66 a owl:Class ; owl:complementOf <http://example.org/SpatialRegion> .',
                '_:genid70 a owl:Class ; owl:complementOf <http://example.org/SpatialRegion> .',
                '',
                '[] a owl:AllDisjointClasses ;',
                '   owl:members (',
                '     <http://example.org/SpatialRegion>',
                '     <http://example.org/Site>',
                '     <http://example.org/FiatBoundary>',
                '   ) .',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes: {
                    owl: 'http://www.w3.org/2002/07/owl#',
                    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
                    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                },
                inlineSingleUseBlankNodes: true,
            });

            // Single-use generated/auxiliary blank nodes should be inlined
            // rather than emitted as standalone top-level subjects.
            expect(output).not.toMatch(/^_:genid\d+/m);
            expect(output).not.toMatch(/^_:b\d+/m);
            expect(output).toContain('owl:AllDisjointClasses');
        });

        it('should recursively inline owl:members blank node chains', () => {
            const input = [
                '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                '[] a owl:AllDisjointClasses ;',
                '   owl:members _:b122 .',
                '_:b122 rdf:first ex:A ; rdf:rest _:b123 .',
                '_:b123 rdf:first ex:B ; rdf:rest rdf:nil .',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes: {
                    owl: 'http://www.w3.org/2002/07/owl#',
                    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                    ex: 'http://example.org/',
                },
                inlineSingleUseBlankNodes: true,
            });

            expect(output).toContain('owl:members [');
            expect(output).toContain('rdf:first ex:A');
            expect(output).toContain('rdf:first ex:B');
            expect(output).not.toMatch(/owl:members\s+_:[A-Za-z0-9_-]+/);
            expect(output).not.toMatch(/^_:[A-Za-z0-9_-]+\s+rdf:first/m);
        });

        it('should recursively inline owl:members chains for multiple sibling disjoint-class blocks', () => {
            const input = [
                '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
                '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
                '@prefix ex: <http://example.org/> .',
                '',
                '[] a owl:AllDisjointClasses ;',
                '   owl:members _:b122 .',
                '_:b122 rdf:first ex:A ; rdf:rest _:b123 .',
                '_:b123 rdf:first ex:B ; rdf:rest rdf:nil .',
                '',
                '[] a owl:AllDisjointClasses ;',
                '   owl:members _:b124 .',
                '_:b124 rdf:first ex:C ; rdf:rest _:b125 .',
                '_:b125 rdf:first ex:D ; rdf:rest rdf:nil .',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts, {
                prefixes: {
                    owl: 'http://www.w3.org/2002/07/owl#',
                    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                    ex: 'http://example.org/',
                },
                inlineSingleUseBlankNodes: true,
            });

            expect((output.match(/owl:AllDisjointClasses/g) ?? []).length).toBe(2);
            expect((output.match(/owl:members\s+\[/g) ?? []).length).toBe(2);
            expect(output).toContain('rdf:first ex:A');
            expect(output).toContain('rdf:first ex:B');
            expect(output).toContain('rdf:first ex:C');
            expect(output).toContain('rdf:first ex:D');
            expect(output).not.toContain('owl:members _:b122');
            expect(output).not.toContain('owl:members _:b124');
            expect(output).not.toMatch(/^_:[A-Za-z0-9_-]+\s+rdf:first/m);
        });

        it('should not emit prefix block when prefixes is empty', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = statementSerializer.serialize(contexts);

            // No PREFIX / @prefix lines — output starts with the statement
            // (IRIs will be full since no prefix map was provided)
            expect(output).not.toMatch(/^PREFIX /m);
            expect(output).not.toMatch(/^@prefix /m);
        });
    });

    // ====================================================================
    // Full round-trip: parse → merge → sort → serialize
    // ====================================================================
    describe('round-trip with comment preservation', () => {
        it('should preserve comments after adding new triples and sorting', () => {
            const input = [
                PREFIX,
                '',
                '# This class represents people',
                'ex:Person a rdfs:Class .',
                '',
                '# This class represents organizations',
                'ex:Organization a rdfs:Class .',
            ].join('\n');

            // 1. Parse with comments
            const { contexts } = parseWithComments(input);

            // 2. Add a new triple
            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/Animal'),
                DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Class')
            );

            // 3. Merge & serialize with sorting
            const merged = statementSerializer.addStatements(contexts, [newQuad]);
            const output = statementSerializer.serialize(merged, {
                prefixes,
                sortingStrategy: alphabeticalSort,
                blankLinesBetweenSubjects: true,
            });

            // Comments from the original document are preserved
            expect(output).toContain('# This class represents people');
            expect(output).toContain('# This class represents organizations');

            // The new triple is present
            expect(output).toContain('Animal');

            // After alphabetical sorting: Animal < Organization < Person
            const animalIdx = output.indexOf('Animal');
            const orgIdx = output.indexOf('Organization');
            const personIdx = output.indexOf('Person');
            expect(animalIdx).toBeLessThan(orgIdx);
            expect(orgIdx).toBeLessThan(personIdx);

            // Each original comment still precedes its statement
            const commentPerson = output.indexOf('# This class represents people');
            const commentOrg = output.indexOf('# This class represents organizations');
            expect(commentOrg).toBeLessThan(orgIdx);
            expect(commentPerson).toBeLessThan(personIdx);
        });

        it('should preserve inline trailing comments through the round-trip', () => {
            const input = [
                PREFIX,
                'ex:A ex:p ex:B . # keep this',
                'ex:C ex:q ex:D . # keep this too',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes });

            expect(output).toContain('# keep this');
            expect(output).toContain('# keep this too');
        });

        it('should not lose information when re-serializing the original document', () => {
            const input = [
                PREFIX,
                '',
                '# Section: Classes',
                '# The Person class',
                'ex:Person a rdfs:Class . # primary class',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            // Re-serialize with no new quads, no sorting — pure round-trip
            const output = statementSerializer.serialize(contexts, { prefixes });

            // All comments must survive
            expect(output).toContain('# Section: Classes');
            expect(output).toContain('# The Person class');
            expect(output).toContain('# primary class');

            // Triple must survive
            expect(output).toContain('ex:Person a rdfs:Class .');
        });

        it('should handle grouped statements (predicate lists)', () => {
            const input = [
                PREFIX,
                '# Person definition',
                'ex:Person a rdfs:Class ;',
                '    rdfs:label "Person" .',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            // Should have statements from the grouped statement
            expect(contexts.length).toBeGreaterThanOrEqual(1);

            const output = statementSerializer.serialize(contexts, { prefixes });
            expect(output).toContain('# Person definition');
        });
    });

    describe('pretty-printed subject grouping', () => {
        it('should group multiple predicates for the same subject using semicolons', () => {
            const input = [
                PREFIX,
                'ex:Person a rdfs:Class .',
                'ex:Person rdfs:label "Person" .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes });

            // Should use predicate-object grouping with ";"
            expect(output).toContain('ex:Person a rdfs:Class ;');
            expect(output).toContain('rdfs:label "Person"');
            // Should NOT repeat subject
            const subjectMatches = output.match(/ex:Person/g);
            // One occurrence in the PREFIX line, one in the subject block
            const statementsBlock = output.slice(output.lastIndexOf('\n\n') + 2);
            const subjectInBody = statementsBlock.match(/ex:Person/g);
            expect(subjectInBody).toHaveLength(1);
        });

        it('should produce grouped output when sorting', () => {
            const input = [
                PREFIX,
                'ex:B rdfs:label "B" .',
                'ex:A a rdfs:Class .',
                'ex:A rdfs:label "A" .',
                'ex:B a rdfs:Class .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes, sortingStrategy: alphabeticalSort });

            // After sorting, ex:A should come before ex:B
            const aIdx = output.indexOf('ex:A a rdfs:Class');
            const bIdx = output.indexOf('ex:B a rdfs:Class');
            expect(aIdx).toBeLessThan(bIdx);

            // Each subject should be grouped (semicolons, not repeated subjects)
            expect(output).toContain('ex:A a rdfs:Class ;');
            expect(output).toContain('ex:B a rdfs:Class ;');
        });

        it('should preserve comments with grouped subjects', () => {
            const input = [
                PREFIX,
                '# Comment for class A',
                'ex:A a rdfs:Class .',
                'ex:A rdfs:label "A" .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes });

            // Comment should precede the grouped subject block
            const commentIdx = output.indexOf('# Comment for class A');
            const subjectIdx = output.indexOf('ex:A a rdfs:Class');
            expect(commentIdx).toBeLessThan(subjectIdx);

            // Output should still be grouped
            expect(output).toContain('ex:A a rdfs:Class ;');
        });

        it('should preserve trailing comment on last quad of a group', () => {
            const input = [
                PREFIX,
                'ex:A a rdfs:Class .',
                'ex:A rdfs:label "A" . # end comment',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes });

            // Trailing comment should appear on the last line of the block
            expect(output).toContain('# end comment');
        });

        it('should separate subject blocks with blank lines', () => {
            const input = [
                PREFIX,
                'ex:A a rdfs:Class .',
                'ex:A rdfs:label "A" .',
                'ex:B a rdfs:Class .',
                'ex:B rdfs:label "B" .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, {
                prefixes,
                blankLinesBetweenSubjects: true,
            });

            // There should be a blank line between the A and B subject blocks.
            // Find the end of the A block (". ")  and verify a blank line follows.
            const aBlockEnd = output.indexOf('rdfs:label "A"');
            const bBlockStart = output.indexOf('ex:B');
            expect(aBlockEnd).toBeGreaterThan(-1);
            expect(bBlockStart).toBeGreaterThan(aBlockEnd);

            // The text between the two blocks should contain a blank line
            const between = output.slice(aBlockEnd, bBlockStart);
            expect(between).toContain('\n\n');
        });

        it('should handle single quad per subject (no semicolons)', () => {
            const input = [
                PREFIX,
                'ex:A a rdfs:Class .',
                'ex:B a rdfs:Class .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes });

            // Each subject has only one quad — no semicolons
            expect(output).toContain('ex:A a rdfs:Class .');
            expect(output).toContain('ex:B a rdfs:Class .');
        });

        it('should sort and group an ontology-like document', () => {
            const input = [
                PREFIX,
                '# An object property',
                'ex:hasName rdfs:label "has name" .',
                'ex:hasName a <http://www.w3.org/2002/07/owl#ObjectProperty> .',
                '',
                '# A class',
                'ex:Person rdfs:label "Person" .',
                'ex:Person a rdfs:Class .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes, sortingStrategy: alphabeticalSort });

            // After alphabetical sorting: ex:Person before ex:hasName
            // (P < h in default locale — let's just verify grouping)
            expect(output).toMatch(/ex:Person .+;/);
            expect(output).toMatch(/ex:hasName .+;/);

            // Comments should still be present
            expect(output).toContain('# A class');
            expect(output).toContain('# An object property');

            // After sorting, comments should precede their subject blocks
            const classComment = output.indexOf('# A class');
            const personSubject = output.indexOf('ex:Person');
            expect(classComment).toBeLessThan(personSubject);
        });

        it('should handle sorting with multiple predicates and comments', () => {
            const input = [
                PREFIX,
                '# Z is second after sorting',
                'ex:Z a rdfs:Class .',
                'ex:Z rdfs:label "Z" .',
                '',
                '# A is first after sorting',
                'ex:A a rdfs:Class .',
                'ex:A rdfs:label "A" .',
            ].join('\n');

            const { contexts } = parseWithComments(input);
            const output = statementSerializer.serialize(contexts, { prefixes, sortingStrategy: alphabeticalSort });

            // After sorting: A before Z
            const aIdx = output.indexOf('ex:A');
            const zIdx = output.indexOf('ex:Z');
            expect(aIdx).toBeLessThan(zIdx);

            // Both should be grouped
            expect(output).toContain('ex:A a rdfs:Class ;');
            expect(output).toContain('ex:Z a rdfs:Class ;');

            // Comments should travel with their quads
            const commentA = output.indexOf('# A is first after sorting');
            const commentZ = output.indexOf('# Z is second after sorting');
            expect(commentA).toBeLessThan(aIdx);
            expect(commentZ).toBeLessThan(zIdx);
        });

        it('should handle added quads merged with existing grouped contexts', () => {
            const input = [
                PREFIX,
                '# Existing class',
                'ex:Person a rdfs:Class .',
            ].join('\n');

            const { contexts } = parseWithComments(input);

            // Add a predicate for the same subject
            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/Person'),
                DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
                DataFactory.literal('Person')
            );

            const merged = statementSerializer.addStatements(contexts, [newQuad]);
            const output = statementSerializer.serialize(merged, { prefixes });

            // Both predicates should be grouped under the same subject
            expect(output).toContain('ex:Person a rdfs:Class ;');
            expect(output).toContain('rdfs:label "Person"');

            // Comment should still be present
            expect(output).toContain('# Existing class');
        });
    });
});
