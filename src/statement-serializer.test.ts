import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TurtleLexer, TurtleParser, TurtleReader } from '@faubulous/mentor-rdf-parsers';
import { StatementSerializer } from './statement-serializer.js';
import { TurtleSerializer } from './turtle/serializer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREFIX = '@prefix ex: <http://example.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n';

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

const prefixes = {
    ex: 'http://example.org/',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

const ss = new StatementSerializer(new TurtleSerializer());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatementSerializer', () => {
    // ====================================================================
    // getQuad
    // ====================================================================
    describe('getQuad', () => {
        it('should materialize a quad from a StatementContext', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            expect(contexts).toHaveLength(1);
            const quad = ss.getQuad(contexts[0]);
            expect(quad.subject.value).toBe('http://example.org/A');
            expect(quad.predicate.value).toBe('http://example.org/p');
            expect(quad.object.value).toBe('http://example.org/B');
        });

        it('should handle multiple quads', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            expect(contexts).toHaveLength(2);
            const quad1 = ss.getQuad(contexts[0]);
            const quad2 = ss.getQuad(contexts[1]);
            expect(quad1.subject.value).toBe('http://example.org/A');
            expect(quad2.subject.value).toBe('http://example.org/C');
        });
    });

    // ====================================================================
    // addStatements
    // ====================================================================
    describe('addStatements', () => {
        it('should merge new quads into existing contexts', () => {
            const input = PREFIX + '# Existing\nex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/C'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.namedNode('http://example.org/D')
            );

            const merged = ss.addStatements(contexts, [newQuad]);

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

            const merged = ss.addStatements(contexts, [newQuad]);

            // Order preserved: original first, then new
            expect(merged).toHaveLength(2);
            expect(merged[0].subject.term.value).toBe('http://example.org/Z');
            expect(merged[1].subject.term.value).toBe('http://example.org/A');
        });
    });

    // ====================================================================
    // sort
    // ====================================================================
    describe('sort', () => {
        it('should sort contexts alphabetically', () => {
            const input = PREFIX + 'ex:Z ex:p "a" .\nex:A ex:q "b" .';
            const { contexts } = parseWithComments(input);

            const sorted = ss.sort(contexts, true);

            expect(sorted[0].subject.term.value).toBe('http://example.org/A');
            expect(sorted[1].subject.term.value).toBe('http://example.org/Z');
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

            const sorted = ss.sort(contexts, true);

            // Comments should travel with their quads
            expect(sorted[0].leadingComments[0].image).toBe('# Comment for A');
            expect(sorted[1].leadingComments[0].image).toBe('# Comment for Z');
        });
    });

    // ====================================================================
    // serialize
    // ====================================================================
    describe('serialize', () => {
        it('should serialize contexts preserving leading comments', () => {
            const input = [
                PREFIX,
                '# This is Person',
                'ex:Person a rdfs:Class .',
            ].join('\n');
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, { prefixes });

            expect(output).toContain('# This is Person\nex:Person a rdfs:Class .');
        });

        it('should serialize trailing comments', () => {
            const input = PREFIX + 'ex:A ex:p ex:B . # important';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, { prefixes });

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

            const merged = ss.addStatements(contexts, [newQuad]);
            const output = ss.serialize(merged, { prefixes });

            // New quad serialized without any stray comment markers
            expect(output).toContain('ex:C ex:q "value" .');
        });

        it('should add blank lines between different subjects', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, {
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

            const output = ss.serialize(contexts, {
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

            const output = ss.serialize(contexts, { prefixes });

            expect(output).toContain('PREFIX ex: <http://example.org/>');
            expect(output).toContain('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>');
        });

        it('should emit @prefix declarations when lowercaseDirectives is true', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, {
                prefixes,
                lowercaseDirectives: true,
            });

            expect(output).toContain('@prefix ex: <http://example.org/> .');
            expect(output).toContain('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
        });

        it('should emit BASE declaration when baseIri is provided', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, {
                prefixes,
                baseIri: 'http://example.org/',
            });

            expect(output).toContain('BASE <http://example.org/>');
        });

        it('should emit @base when lowercaseDirectives is true', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, {
                prefixes,
                baseIri: 'http://example.org/',
                lowercaseDirectives: true,
            });

            expect(output).toContain('@base <http://example.org/> .');
        });

        it('should sort inline when sort option is set', () => {
            const input = PREFIX + 'ex:Z ex:p ex:B .\nex:A ex:q ex:D .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts, { prefixes, sort: true });

            const aIdx = output.indexOf('ex:A');
            const zIdx = output.indexOf('ex:Z');
            expect(aIdx).toBeLessThan(zIdx);
        });

        it('should not emit prefix block when prefixes is empty', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { contexts } = parseWithComments(input);

            const output = ss.serialize(contexts);

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
            const merged = ss.addStatements(contexts, [newQuad]);
            const output = ss.serialize(merged, {
                prefixes,
                sort: true,
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
            const output = ss.serialize(contexts, { prefixes });

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
            const output = ss.serialize(contexts, { prefixes });

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

            const output = ss.serialize(contexts, { prefixes });
            expect(output).toContain('# Person definition');
        });
    });
});
