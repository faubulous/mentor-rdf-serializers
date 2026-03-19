import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TurtleLexer, TurtleParser, TurtleReader } from '@faubulous/mentor-rdf-parsers';
import {
    groupCommentsWithQuads,
    mergeStatementGroups,
    serializeStatementGroups,
} from './statement-group.js';
import { TurtleSerializer } from './turtle/serializer.js';
import { NamedNode } from '@rdfjs/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREFIX = '@prefix ex: <http://example.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n';

/** Parse Turtle text and return { quadInfos, tokens }. */
function parse(input: string) {
    const lexer = new TurtleLexer();
    const lexResult = lexer.tokenize(input);
    const parser = new TurtleParser();
    parser.input = lexResult.tokens.filter(
        t => t.tokenType.name !== 'COMMENT' && t.tokenType.name !== 'WS'
    );
    const cst = parser.turtleDoc();
    const reader = new TurtleReader();
    const quadInfos = reader.turtleDocInfo(cst);
    return { quadInfos, tokens: lexResult.tokens, reader };
}

const prefixes = {
    ex: 'http://example.org/',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

const serializer = new TurtleSerializer();

function serializeQuad(quad: any): string {
    return serializer.serializeQuad(quad, { prefixes });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('statement-group', () => {
    // ====================================================================
    // groupCommentsWithQuads
    // ====================================================================
    describe('groupCommentsWithQuads', () => {
        it('should return groups without comments when source has none', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(2);
            expect(groups[0].leadingComments).toHaveLength(0);
            expect(groups[0].trailingComment).toBeUndefined();
            expect(groups[1].leadingComments).toHaveLength(0);
            expect(groups[1].trailingComment).toBeUndefined();
        });

        it('should attach a leading comment to the following statement', () => {
            const input = PREFIX + '# About A\nex:A ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(1);
            expect(groups[0].leadingComments).toHaveLength(1);
            expect(groups[0].leadingComments[0].image).toBe('# About A');
        });

        it('should attach a trailing comment on the same line', () => {
            const input = PREFIX + 'ex:A ex:p ex:B . # inline note';
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(1);
            expect(groups[0].trailingComment).toBeDefined();
            expect(groups[0].trailingComment!.image).toBe('# inline note');
        });

        it('should attach both leading and trailing comments', () => {
            const input = PREFIX + '# Header\nex:A ex:p ex:B . # side note';
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(1);
            expect(groups[0].leadingComments).toHaveLength(1);
            expect(groups[0].leadingComments[0].image).toBe('# Header');
            expect(groups[0].trailingComment!.image).toBe('# side note');
        });

        it('should distribute comments across multiple statements', () => {
            const input = [
                PREFIX,
                '# Comment for A',
                'ex:A ex:p ex:B . # trailing A',
                '# Comment for C',
                'ex:C ex:q ex:D .',
            ].join('\n');
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(2);

            // First statement
            expect(groups[0].leadingComments).toHaveLength(1);
            expect(groups[0].leadingComments[0].image).toBe('# Comment for A');
            expect(groups[0].trailingComment!.image).toBe('# trailing A');

            // Second statement
            expect(groups[1].leadingComments).toHaveLength(1);
            expect(groups[1].leadingComments[0].image).toBe('# Comment for C');
            expect(groups[1].trailingComment).toBeUndefined();
        });

        it('should handle multiple leading comments before one statement', () => {
            const input = PREFIX + '# Line 1\n# Line 2\nex:A ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            expect(groups).toHaveLength(1);
            expect(groups[0].leadingComments).toHaveLength(2);
            expect(groups[0].leadingComments[0].image).toBe('# Line 1');
            expect(groups[0].leadingComments[1].image).toBe('# Line 2');
        });

        it('should return empty array for empty input', () => {
            const groups = groupCommentsWithQuads([], []);
            expect(groups).toHaveLength(0);
        });

        it('should handle grouped statements (same subject, multiple predicates)', () => {
            const input = [
                PREFIX,
                '# About Person',
                'ex:Person a rdfs:Class ;',
                '    rdfs:label "Person" .',
            ].join('\n');
            const { quadInfos, tokens } = parse(input);

            const groups = groupCommentsWithQuads(quadInfos, tokens);

            // Two quads for the same subject
            expect(groups).toHaveLength(2);
            // Leading comment attaches to the first quad of the subject group
            expect(groups[0].leadingComments).toHaveLength(1);
            expect(groups[0].leadingComments[0].image).toBe('# About Person');
            // Second quad has no leading comments
            expect(groups[1].leadingComments).toHaveLength(0);
        });
    });

    // ====================================================================
    // mergeStatementGroups
    // ====================================================================
    describe('mergeStatementGroups', () => {
        it('should merge new quads without comments into existing groups', () => {
            const input = PREFIX + '# Existing\nex:A ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/C'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.namedNode('http://example.org/D')
            );

            const merged = mergeStatementGroups(groups, [newQuad]);

            expect(merged).toHaveLength(2);
            // Original group keeps its comment
            expect(merged[0].leadingComments).toHaveLength(1);
            // New group has no comments
            expect(merged[1].leadingComments).toHaveLength(0);
            expect(merged[1].trailingComment).toBeUndefined();
        });

        it('should sort merged groups when sort=true', () => {
            const input = PREFIX + 'ex:Z ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/A'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('value')
            );

            const merged = mergeStatementGroups(groups, [newQuad], true);

            // After alphabetical sort, 'http://example.org/A' < 'http://example.org/Z'
            expect(merged).toHaveLength(2);

            const s0 = merged[0].quad.subject as NamedNode;
            expect(s0.termType).toBe('NamedNode');
            expect(s0.value).toBe('http://example.org/A');

            const s1 = merged[1].quad.subject as NamedNode;
            expect(s1.termType).toBe('NamedNode');
            expect(s1.value).toBe('http://example.org/Z');
        });

        it('should not sort when sort=false', () => {
            const input = PREFIX + 'ex:Z ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/A'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('value')
            );

            const merged = mergeStatementGroups(groups, [newQuad], false);

            // Order preserved: original first, then new
            expect(merged).toHaveLength(2);

            const s0 = merged[0].quad.subject as NamedNode;
            expect(s0.termType).toBe('NamedNode');
            expect(s0.value).toBe('http://example.org/Z');
            
            const s1 = merged[1].quad.subject as NamedNode;
            expect(s1.termType).toBe('NamedNode');
            expect(s1.value).toBe('http://example.org/A');
        });
    });

    // ====================================================================
    // serializeStatementGroups
    // ====================================================================
    describe('serializeStatementGroups', () => {
        it('should serialize groups preserving leading comments', () => {
            const input = [
                PREFIX,
                '# This is Person',
                'ex:Person a rdfs:Class .',
            ].join('\n');
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const output = serializeStatementGroups(groups, serializeQuad, { prefixes });

            expect(output).toContain('# This is Person');
            expect(output).toContain('ex:Person a rdfs:Class .');
        });

        it('should serialize groups preserving trailing comments', () => {
            const input = PREFIX + 'ex:A ex:p ex:B . # important';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const output = serializeStatementGroups(groups, serializeQuad);

            expect(output).toContain('# important');
        });

        it('should produce clean output for new quads without comments', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/C'),
                DataFactory.namedNode('http://example.org/q'),
                DataFactory.literal('value')
            );

            const merged = mergeStatementGroups(groups, [newQuad]);
            const output = serializeStatementGroups(merged, serializeQuad);

            // New quad serialized without any stray comment markers on its line
            expect(output).toContain('ex:C ex:q "value" .');
        });

        it('should add blank lines between different subjects', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const output = serializeStatementGroups(groups, serializeQuad, {
                blankLinesBetweenSubjects: true,
            });

            // There should be a blank line between the two statements
            expect(output).toContain('\n\n');
        });

        it('should not add blank lines when disabled', () => {
            const input = PREFIX + 'ex:A ex:p ex:B .\nex:C ex:q ex:D .';
            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            const output = serializeStatementGroups(groups, serializeQuad, {
                blankLinesBetweenSubjects: false,
            });

            // No double newlines between statements (only at most one \n between lines)
            const body = output.trim();
            const lines = body.split('\n');
            const quadLines = lines.filter(l => l.includes('ex:'));
            expect(quadLines).toHaveLength(2);
        });
    });

    // ====================================================================
    // Full round-trip: parse → group → merge → sort → serialize
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

            // 1. Parse
            const { quadInfos, tokens } = parse(input);

            // 2. Group comments with quads
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            // 3. Add a new triple
            const newQuad = DataFactory.quad(
                DataFactory.namedNode('http://example.org/Animal'),
                DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Class')
            );

            // 4. Merge & sort
            const merged = mergeStatementGroups(groups, [newQuad], true);

            // 5. Serialize
            const output = serializeStatementGroups(merged, serializeQuad, {
                prefixes,
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

            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);
            const output = serializeStatementGroups(groups, serializeQuad, { prefixes });

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

            const { quadInfos, tokens } = parse(input);
            const groups = groupCommentsWithQuads(quadInfos, tokens);

            // Re-serialize with no new quads, no sorting — pure round-trip
            const merged = mergeStatementGroups(groups, []);
            const output = serializeStatementGroups(merged, serializeQuad, { prefixes });

            // All comments must survive
            expect(output).toContain('# Section: Classes');
            expect(output).toContain('# The Person class');
            expect(output).toContain('# primary class');

            // Triple must survive
            expect(output).toContain('ex:Person a rdfs:Class .');
        });
    });
});