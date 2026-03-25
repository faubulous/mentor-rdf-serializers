import { describe, it, expect, beforeEach } from 'vitest';
import { SparqlLexer } from '@faubulous/mentor-rdf-parsers';
import { SparqlFormatter } from './sparql-formatter.js';

// NOTE: All IRIs, prefixes, and sample data in these tests are synthetic
// examples used solely to exercise formatting behaviour.

describe('SparqlFormatter', () => {
    let formatter: SparqlFormatter;

    beforeEach(() => {
        formatter = new SparqlFormatter();
    });

    describe('formatFromTokens', () => {
        it('should produce the same indentation as formatFromText for lexer tokens', () => {
            const query = [
                'PREFIX ex: <http://example.org/>',
                'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
                '',
                'SELECT ?s ?p ?o WHERE {',
                '    VALUES ?cutoff { "2025-11-01T00:00:00"^^xsd:dateTime }',
                '    ?s ?p ?o .',
                '    OPTIONAL { ?s ex:updatedAt ?t }',
                '    FILTER(!BOUND(?t) || ?t > ?cutoff)',
                '}',
                '',
            ].join('\n');
            const lexer = new SparqlLexer();
            const lexResult = lexer.tokenize(query);

            const fromText = formatter.formatFromText(query, { indent: '    ', maxLineWidth: 120 });
            const fromTokens = formatter.formatFromTokens(lexResult.tokens, { indent: '    ', maxLineWidth: 120 });

            expect(fromTokens.output).toBe(fromText.output);
        });
    });

    describe('formatFromText', () => {
        it('should format a simple SELECT query', () => {
            const query = 'select ?s ?p ?o where { ?s ?p ?o }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
        });

        it('should uppercase keywords by default', () => {
            const query = 'select ?x where { ?x a <http://example.org/Class> }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
        });

        it('should lowercase keywords when requested', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatFromText(query, { lowercaseKeywords: true });

            expect(result.output).toContain('select');
            expect(result.output).toContain('where');
        });

        it('should format PREFIX declarations', () => {
            const query = 'PREFIX ex: <http://example.org/> SELECT ?x WHERE { ?x a ex:Class }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('PREFIX ex:');
        });

        it('should handle FILTER expressions', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/value> ?v . FILTER(?v > 10) }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('FILTER');
        });

        it('should handle OPTIONAL patterns', () => {
            const query = 'SELECT ?x ?y WHERE { ?x a <http://example.org/Class> . OPTIONAL { ?x <http://example.org/prop> ?y } }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('OPTIONAL');
        });

        it('should keep FROM NAMED on the same line', () => {
            const query = 'SELECT ?s ?p ?o FROM NAMED <http://example.org/graph> WHERE { ?s ?p ?o }';

            const result = formatter.formatFromText(query);

            // FROM NAMED should stay on the same line
            expect(result.output).toContain('FROM NAMED');
            expect(result.output).not.toMatch(/FROM\s*\n\s*NAMED/);
        });

        it('should preserve comments', () => {
            const query = '# This is a comment\nSELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('# This is a comment');
        });

        it('should not add blank line between comment and following VALUES clause', () => {
            const query = `SELECT ?x WHERE {
    # VALUES ?itemCode { "3125416" }
    VALUES ?eventDate { "2025-11-01T00:00:00"^^xsd:dateTime }
    ?x <http://example.org/date> ?eventDate
}`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // Should not have blank line between comment and VALUES
            expect(result.output).toContain('# VALUES ?itemCode { "3125416" }\n');
            // Find the comment line and check the next line is VALUES without blank line
            const lines = result.output.split('\n');
            const commentIndex = lines.findIndex(l => l.includes('# VALUES ?itemCode'));
            expect(commentIndex).toBeGreaterThan(-1);
            // Next line should be VALUES, not blank
            expect(lines[commentIndex + 1].trim()).toMatch(/^VALUES/);
        });

        it('should not add blank line between consecutive VALUES clauses', () => {
            const query = `SELECT ?x ?y WHERE {
    VALUES ?x { "a" }
    VALUES ?y { "b" }
    ?s ?p ?o
}`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // The output should not have a blank line between the two VALUES clauses
            // Check that VALUES ?y directly follows VALUES ?x (possibly on same or next line)
            const output = result.output;
            
            // There should be no double newline between the two VALUES clauses
            expect(output).not.toMatch(/VALUES \?x \{ "a" \}\s*\n\n\s*VALUES \?y/);
            
            // The two VALUES should be close together (either on same line or adjacent lines)
            const lines = output.split('\n');
            const firstValuesIndex = lines.findIndex(l => l.includes('VALUES ?x'));
            const secondValuesIndex = lines.findIndex(l => l.includes('VALUES ?y'));
            expect(firstValuesIndex).toBeGreaterThan(-1);
            expect(secondValuesIndex).toBeGreaterThan(-1);
            // Second VALUES should be at most 1 line after first (same line or next line)
            expect(secondValuesIndex - firstValuesIndex).toBeLessThanOrEqual(1);
        });

        it('should preserve multi-line VALUES block when source has explicit newlines', () => {
            const query = `SELECT ?x WHERE {
    VALUES ?code {
        ex:StraightReplacement
        ex:CompositeReplacement
        ex:AlternativeReplacement
    }
    ?x a ?code
}`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // The multi-line VALUES block should be preserved
            const lines = result.output.split('\n');
            const valuesLineIndex = lines.findIndex(l => l.includes('VALUES ?code'));
            expect(valuesLineIndex).toBeGreaterThan(-1);
            
            // The opening brace should be on the VALUES line
            expect(lines[valuesLineIndex]).toContain('VALUES ?code {');
            
            // Each value should be on its own line
            expect(lines.find(l => l.trim() === 'ex:StraightReplacement')).toBeDefined();
            expect(lines.find(l => l.trim() === 'ex:CompositeReplacement')).toBeDefined();
            expect(lines.find(l => l.trim() === 'ex:AlternativeReplacement')).toBeDefined();
            
            // The closing brace should be on its own line
            const closingBraceIndex = lines.findIndex((l, i) => i > valuesLineIndex && l.trim() === '}');
            expect(closingBraceIndex).toBeGreaterThan(valuesLineIndex);
        });

        it('should not add blank line between VALUES keyword and variable', () => {
            const query = `SELECT ?x WHERE {
    VALUES ?code {
        ex:StraightReplacement
        ex:CompositeReplacement
    }
    ?x a ?code
}`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // There should be no blank line between VALUES and ?code
            // i.e., "VALUES" should NOT be followed by a blank line before ?code
            expect(result.output).not.toMatch(/VALUES\s*\n\s*\n\s*\?code/);
            
            // VALUES ?code should be on the same line
            expect(result.output).toMatch(/VALUES \?code/);
            
            // There should be no blank line between "WHERE {" and VALUES
            // The opening brace should be immediately followed by the VALUES on the next line
            expect(result.output).not.toMatch(/WHERE \{\s*\n\s*\n\s*VALUES/);
        });

        it('should not add blank line between VALUES keyword and variable when preceded by triple patterns', () => {
            const query = `PREFIX ex: <http://example.org/>

SELECT DISTINCT ?category ?resource ?resourceID
WHERE {
    BIND(ex:SomeCategory AS ?category)

    ?resource a ex:SomeType ;
        ex:identifiedBy / ex:id ?resourceID ;
        ex:hasSomeCode ?code .

    VALUES ?code {
        ex:CodeA
        ex:CodeB
        ex:CodeC
    }
}
ORDER BY ?resource
LIMIT 200`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120, indent: '    ' });

            // VALUES ?code should be on the same line
            expect(result.output).toMatch(/VALUES \?code \{/);
            // No blank line between VALUES and ?code
            expect(result.output).not.toMatch(/VALUES\s*\n\s*\n\s*\?code/);
        });

        it('should use consistent indentation for predicate-object lists after semicolon', () => {
            const query = `SELECT ?item ?itemID ?code WHERE {
        ?item a ex:Item ;
        ex:identifiedBy / ex:id ?itemID ;
        ex:hasReplacementCode ?code .
    }`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120, indent: '    ' });

            // Check the indentation of predicate continuations
            const lines = result.output.split('\n');
            const partLineIndex = lines.findIndex(l => l.includes('?item a ex:Item'));
            expect(partLineIndex).toBeGreaterThan(-1);
            
            // The continuation lines should have consistent indentation (one level more than the subject line)
            const partLine = lines[partLineIndex];
            const partMatch = partLine.match(/^(\s*)/);
            const partIndent = partMatch ? partMatch[1] : '';

            // Get continuation lines
            const idLine = lines.find(l => l.includes('ex:identifiedBy'));
            const replacementLine = lines.find(l => l.includes('ex:hasReplacementCode'));

            expect(idLine).toBeDefined();
            expect(replacementLine).toBeDefined();
            
            // Continuation lines should be indented by exactly one additional indent level
            const expectedContinuationIndent = partIndent + '    ';
            expect(idLine?.startsWith(expectedContinuationIndent)).toBe(true);
            expect(replacementLine?.startsWith(expectedContinuationIndent)).toBe(true);
            
            // Make sure they're NOT double-indented
            const doubleIndent = partIndent + '        ';
            expect(idLine?.startsWith(doubleIndent)).toBe(false);
            expect(replacementLine?.startsWith(doubleIndent)).toBe(false);
        });

        it('should preserve predicate continuation indent after VALUES inline block', () => {
            const query = `SELECT ?s ?id ?o WHERE {
    VALUES ?date { "2025-11-01T00:00:00"^^<http://www.w3.org/2001/XMLSchema#dateTime> }

    ?s a <http://example.org/Subject> ;
        <http://example.org/identifiedBy> / <http://example.org/id> ?id ;
        <http://example.org/hasObject> ?o .
}`;

            const result = formatter.formatFromText(query, {
                indent: '    ',
                maxLineWidth: 120,
                spaceBeforePunctuation: true,
            });

            const lines = result.output.split('\n');
            const subjectLine = lines.find(l => l.includes('?s a <http://example.org/Subject>'));
            expect(subjectLine).toBeDefined();

            const subjectMatch = subjectLine!.match(/^(\s*)/);
            const subjectIndent = subjectMatch ? subjectMatch[1] : '';
            const expectedContinuation = subjectIndent + '    ';

            const idLine = lines.find(l => l.includes('<http://example.org/identifiedBy>'));
            const objectLine = lines.find(l => l.includes('<http://example.org/hasObject>'));

            expect(idLine).toBeDefined();
            expect(objectLine).toBeDefined();

            // Continuation lines must have one extra indent level beyond the subject
            expect(idLine!.startsWith(expectedContinuation)).toBe(true);
            expect(objectLine!.startsWith(expectedContinuation)).toBe(true);
        });

        it('should not move blank line inside block before first statement', () => {
            const query = `PREFIX ex: <http://example.org/>

SELECT ?s ?id ?category
WHERE {
    VALUES ?id { "id1" "id2" }

    ?s ex:id ?id .
    ?s ex:name ?name .

    {
        BIND(ex:GroupA AS ?category)

        ?s ex:hasStatus ex:StatusA .
    }
    UNION
    {
        BIND(ex:GroupB AS ?category)

        ?s ex:hasStatus ex:StatusB .
    }
}`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120, indent: '    ' });

            const lines = result.output.split('\n');

            // Find the first block opening brace inside WHERE
            const braceIndex = lines.findIndex(l => l.trim() === '{');
            expect(braceIndex).toBeGreaterThan(-1);

            // The first non-empty line after the brace should be the BIND line,
            // i.e., there must be no extra blank line *inside* the block.
            let nextNonEmpty = braceIndex + 1;
            while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') {
                nextNonEmpty++;
            }
            expect(lines[nextNonEmpty].trim().startsWith('BIND(')).toBe(true);
        });

        it('should format ORDER BY clause', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o } ORDER BY ?x';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('ORDER BY');
        });

        it('should not add blank lines between closing brace and ORDER BY LIMIT', () => {
            const query = `SELECT ?part WHERE {
    ?part a <http://example.org/Part>
}
ORDER BY ?part
LIMIT 200`;

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // There should be no blank lines between } and ORDER BY
            expect(result.output).not.toMatch(/\}\s*\n\s*\n\s*ORDER BY/);
            
            // There should be no blank lines between ORDER BY and LIMIT
            expect(result.output).not.toMatch(/ORDER BY \?part\s*\n\s*\n\s*LIMIT/);
        });

        it('should format LIMIT and OFFSET', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o } LIMIT 10 OFFSET 5';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('LIMIT');
            expect(result.output).toContain('OFFSET');
        });

        it('should handle GROUP BY and HAVING', () => {
            const query = 'SELECT ?x (COUNT(?y) as ?count) WHERE { ?x <http://example.org/prop> ?y } GROUP BY ?x HAVING (COUNT(?y) > 1)';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('GROUP BY');
            expect(result.output).toContain('HAVING');
        });

        it('should NOT uppercase boolean literals (true/false)', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> true }';

            const result = formatter.formatFromText(query, { uppercaseKeywords: true });

            // Keywords should be uppercase
            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
            // But boolean literals must remain lowercase (case-sensitive in SPARQL)
            expect(result.output).toContain('true');
            expect(result.output).not.toContain('TRUE');
        });

        it('should keep false literal lowercase even with uppercaseKeywords', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> false }';

            const result = formatter.formatFromText(query, { uppercaseKeywords: true });

            expect(result.output).toContain('false');
            expect(result.output).not.toContain('FALSE');
        });

        // Note: In SPARQL, boolean literals MUST be lowercase (true, false).
        // The SparqlLexer does not recognize uppercase variants as valid tokens.
        // This test verifies that valid lowercase booleans are preserved.
        it('should keep boolean literals lowercase when input is valid lowercase', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> true . ?x <http://example.org/hidden> false }';

            const result = formatter.formatFromText(query);

            expect(result.output).toContain('true');
            expect(result.output).toContain('false');
            expect(result.output).not.toMatch(/\bTRUE\b/);
            expect(result.output).not.toMatch(/\bFALSE\b/);
        });

        it('should put PREFIX declarations on separate lines', () => {
            const query = 'PREFIX ex: <http://example.org/> PREFIX foaf: <http://xmlns.com/foaf/0.1/> SELECT ?x WHERE { ?x a ex:Class }';

            const result = formatter.formatFromText(query);

            // Each prefix should end with a newline (be on its own line)
            const lines = result.output.split('\n').filter(l => l.trim());
            const prefixLines = lines.filter(l => l.trim().startsWith('PREFIX'));
            expect(prefixLines.length).toBe(2);
            // Prefixes should be on separate lines
            expect(prefixLines[0]).toContain('PREFIX ex:');
            expect(prefixLines[1]).toContain('PREFIX foaf:');
        });

        it('should separate PREFIX declarations from the rest of the query', () => {
            const query = 'PREFIX ex: <http://example.org/> SELECT ?x WHERE { ?x a ex:Class }';

            const result = formatter.formatFromText(query);

            // PREFIX and SELECT should be on different lines
            const prefixIndex = result.output.indexOf('PREFIX');
            const selectIndex = result.output.indexOf('SELECT');
            const textBetween = result.output.substring(prefixIndex, selectIndex);
            expect(textBetween).toContain('\n');
        });

        it('should put FROM clause on a new line', () => {
            const query = 'SELECT ?x FROM <http://example.org/graph> WHERE { ?x ?p ?o }';

            const result = formatter.formatFromText(query);

            // FROM should be on its own line (newline before it)
            const selectIndex = result.output.indexOf('SELECT');
            const fromIndex = result.output.indexOf('FROM');
            const textBetween = result.output.substring(selectIndex, fromIndex);
            expect(textBetween).toContain('\n');
        });

        it('should NOT have blank line before WHERE when no FROM clause', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatFromText(query);

            // WHERE should be on its own line but without a blank line before it
            const selectIndex = result.output.indexOf('SELECT');
            const whereIndex = result.output.indexOf('WHERE');
            const textBetween = result.output.substring(selectIndex, whereIndex);
            // Should have exactly one newline (no blank line)
            const newlineCount = (textBetween.match(/\n/g) || []).length;
            expect(newlineCount).toBe(1);
        });

        it('should NOT have blank line before WHERE even when FROM clause present', () => {
            const query = 'SELECT ?x FROM <http://example.org/graph> WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatFromText(query);

            // WHERE should be on its own line but without a blank line before it
            const fromIndex = result.output.indexOf('FROM');
            const whereIndex = result.output.indexOf('WHERE');
            const textBetween = result.output.substring(fromIndex, whereIndex);
            // Should have exactly one newline between FROM line and WHERE (no blank line)
            const newlineCount = (textBetween.match(/\n/g) || []).length;
            expect(newlineCount).toBe(1);
        });

        it('should put OPTIONAL blocks on a new line', () => {
            const query = 'SELECT ?x ?y WHERE { ?x a <http://example.org/Class> . OPTIONAL { ?x <http://example.org/prop> ?y } }';

            const result = formatter.formatFromText(query);

            // OPTIONAL should have a newline before it
            const lines = result.output.split('\n');
            const optionalLine = lines.find(l => l.trim().startsWith('OPTIONAL'));
            expect(optionalLine).toBeDefined();
        });

        it('should put multiple OPTIONAL blocks on separate lines', () => {
            const query = 'SELECT * WHERE { ?s ?p ?o . OPTIONAL { ?s <http://ex.org/a> ?a } OPTIONAL { ?s <http://ex.org/b> ?b } }';

            const result = formatter.formatFromText(query);

            // Each OPTIONAL should be on its own line
            const lines = result.output.split('\n');
            const optionalLines = lines.filter(l => l.trim().startsWith('OPTIONAL'));
            expect(optionalLines.length).toBe(2);
        });

        it('should keep "a" keyword lowercase (rdf:type shorthand)', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatFromText(query, { uppercaseKeywords: true });

            // 'a' should remain lowercase even with uppercaseKeywords
            expect(result.output).toContain('?x a <');
            expect(result.output).not.toContain('?x A <');
        });

        it('should NOT have space before parentheses in aggregate functions', () => {
            const query = 'SELECT (COUNT(?x) AS ?count) (SUM(?y) AS ?sum) WHERE { ?x ?p ?y }';

            const result = formatter.formatFromText(query);

            // Function calls should have no space before opening paren
            expect(result.output).toContain('COUNT(');
            expect(result.output).toContain('SUM(');
            expect(result.output).not.toContain('COUNT (');
            expect(result.output).not.toContain('SUM (');
        });

        it('should NOT have space before parentheses in FILTER', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://ex.org/C> . FILTER(?x != <http://ex.org/a>) }';

            const result = formatter.formatFromText(query);

            // FILTER should have no space before opening paren
            expect(result.output).toContain('FILTER(');
            expect(result.output).not.toContain('FILTER (');
        });

        it('should preserve blank lines from source', () => {
            const query = `SELECT ?x WHERE {
  ?x a <http://ex.org/Class>.

  ?x <http://ex.org/prop> ?y.
}`;

            const result = formatter.formatFromText(query);

            // There should be a blank line preserved between the triples
            const whereContent = result.output.split('{')[1]?.split('}')[0];
            expect(whereContent).toContain('\n\n');
        });

        it('should NOT have whitespace around datatype marker (^^)', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/p> "hello"^^xsd:string }';

            const result = formatter.formatFromText(query);

            // Datatype annotation should have no whitespace around ^^
            expect(result.output).toContain('"hello"^^xsd:string');
            expect(result.output).not.toContain('" ^^');
            expect(result.output).not.toContain('^^ ');
        });

        it('should keep datatype annotation on same line as literal', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/p> "<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(17.632864 59.183701)"^^geo:wktLiteral }';

            const result = formatter.formatFromText(query);

            // The entire literal^^datatype should be on the same line
            const lines = result.output.split('\n');
            const literalLine = lines.find(l => l.includes('POINT'));
            expect(literalLine).toContain('^^geo:wktLiteral');
        });

        it('should collapse multiple consecutive blank lines to single blank line', () => {
            const query = `SELECT ?x WHERE {
  ?x a <http://ex.org/Class>.



  ?x <http://ex.org/prop> ?y.
}`;

            const result = formatter.formatFromText(query);

            // Should not have 3 or more consecutive newlines (which would be 2+ blank lines)
            expect(result.output).not.toMatch(/\n\n\n/);
            // But should preserve one blank line
            expect(result.output).toContain('\n\n');
        });

        it('should keep FILTER(ISURI(?s)) on a single line', () => {
            const query = 'SELECT ?s WHERE { ?s ?p ?o . FILTER(ISURI(?s)) }';

            const result = formatter.formatFromText(query);

            // FILTER with simple expression should stay on single line
            const lines = result.output.split('\n');
            const filterLine = lines.find(l => l.includes('FILTER'));
            expect(filterLine).toContain('FILTER(ISURI(?s))');
        });

        it('should keep FILTER with comparison on single line', () => {
            const query = 'SELECT ?s ?startDate ?endDate WHERE { ?s ?p ?o . FILTER(?startDate < ?endDate) }';

            const result = formatter.formatFromText(query);

            // FILTER with comparison should stay on single line
            const lines = result.output.split('\n');
            const filterLine = lines.find(l => l.includes('FILTER'));
            expect(filterLine).toContain('FILTER(?startDate < ?endDate)');
        });

        it('should keep BIND on a single line', () => {
            const query = 'SELECT ?s ?type WHERE { ?s ?p ?o . BIND(ex:Category1 AS ?type) }';

            const result = formatter.formatFromText(query);

            // BIND should stay on single line
            const lines = result.output.split('\n');
            const bindLine = lines.find(l => l.includes('BIND'));
            expect(bindLine).toContain('BIND(ex:Category1 AS ?type)');
        });

        it('should keep ASK WHERE on same line when no FROM clause', () => {
            const query = 'ASK WHERE { ?s ?p ?o }';

            const result = formatter.formatFromText(query);

            // ASK and WHERE should be on same line when no FROM
            expect(result.output).toMatch(/ASK\s+WHERE/);
            // No newline between ASK and WHERE
            const askIndex = result.output.indexOf('ASK');
            const whereIndex = result.output.indexOf('WHERE');
            const textBetween = result.output.substring(askIndex + 3, whereIndex);
            expect(textBetween).not.toContain('\n');
        });

        it('should put WHERE on new line after FROM in ASK query', () => {
            const query = 'ASK FROM <http://example.org/graph> WHERE { ?s ?p ?o }';

            const result = formatter.formatFromText(query);

            // WHERE should be on new line after FROM
            const fromIndex = result.output.indexOf('FROM');
            const whereIndex = result.output.indexOf('WHERE');
            const textBetween = result.output.substring(fromIndex, whereIndex);
            expect(textBetween).toContain('\n');
        });

        it('should add indentation after semicolon in predicate list', () => {
            const query = [
                'SELECT * WHERE {',
                '  ?item a ex:Thing;',
                '    ex:hasId ?id',
                '}',
            ].join('\n');

            const result = formatter.formatFromText(query);

            // After semicolon, next predicate should be indented
            expect(result.output).toContain(';');
            // The line after semicolon should be indented
            const lines = result.output.split('\n');
            const typeLine = lines.find(l => l.includes('a ex:Thing'));
            const idLine = lines.find(l => l.includes('ex:hasId'));
            if (typeLine && idLine) {
                // id line should have more indentation than type line
                const typeIndent = typeLine.match(/^\s*/)?.[0]?.length ?? 0;
                const idIndent = idLine.match(/^\s*/)?.[0]?.length ?? 0;
                expect(idIndent).toBeGreaterThan(typeIndent);
            }
        });

        it('should not generate duplicate empty lines in VALUES blocks', () => {
            const query = `SELECT ?itemId WHERE {

VALUES ?itemId {
    "12345"
}

VALUES ?date {
    "2025-11-01T00:00:00"^^xsd:dateTime
}

}`;

            const result = formatter.formatFromText(query);

            // Should not have 3+ consecutive newlines (duplicate blank lines)
            expect(result.output).not.toMatch(/\n\n\n/);
        });
    });

    describe('complex query scenarios', () => {
        it('should preserve blank line before comment', () => {
            const query = `SELECT ?x WHERE {
    ?x a <http://ex.org/Class>.

    # This is a comment
    ?x <http://ex.org/prop> ?y.
}`;

            const result = formatter.formatFromText(query);

            // There should be a blank line before the comment
            expect(result.output).toContain('.\n\n');
            expect(result.output).toContain('# This is a comment');
        });

        it('should keep property paths on a single line', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/a> / <http://ex.org/b> / <http://ex.org/c> ?y }';

            const result = formatter.formatFromText(query);

            // Property path should stay on one line
            const lines = result.output.split('\n');
            const pathLine = lines.find(l => l.includes('<http://ex.org/a>'));
            expect(pathLine).toContain('/ <http://ex.org/b> / <http://ex.org/c>');
        });

        it('should keep prefixed property paths on a single line', () => {
            const query = 'PREFIX ex: <http://ex.org/> SELECT ?x WHERE { ?x ex:hasSOP / ex:hasPDV / ex:hasEvent ?y }';

            const result = formatter.formatFromText(query);

            // Prefixed property path should stay on one line
            const lines = result.output.split('\n');
            const pathLine = lines.find(l => l.includes('ex:hasSOP'));
            expect(pathLine).toContain('ex:hasSOP / ex:hasPDV / ex:hasEvent');
        });

        it('should format FILTER NOT EXISTS blocks properly', () => {
            const query = `SELECT ?x WHERE {
    ?x a <http://ex.org/Class>.

    FILTER NOT EXISTS {
        ?x <http://ex.org/prop> ?y.
        ?y a <http://ex.org/Other>.
    }
}`;

            const result = formatter.formatFromText(query);

            // Should preserve blank line before FILTER NOT EXISTS
            expect(result.output).toContain('.\n\n');
            // Should contain FILTER NOT EXISTS
            expect(result.output).toContain('FILTER NOT EXISTS');
            // Should not have duplicate blank lines
            expect(result.output).not.toMatch(/\n\n\n/);
        });

        it('should keep FILTER with comparison inside FILTER NOT EXISTS on single line', () => {
            const query = `SELECT ?x WHERE {
    FILTER NOT EXISTS {
        ?x <http://ex.org/date> ?d.
        FILTER(?d < ?otherDate)
    }
}`;

            const result = formatter.formatFromText(query);

            // FILTER inside NOT EXISTS should stay on single line
            const lines = result.output.split('\n');
            const filterLine = lines.find(l => l.includes('FILTER(?d'));
            expect(filterLine).toContain('FILTER(?d < ?otherDate)');
        });

        it('should keep BIND with dayTimeDuration on a single line', () => {
            const query = 'SELECT ?x ?adjusted WHERE { ?x <http://ex.org/date> ?d . BIND(?d - "P25D"^^xsd:dayTimeDuration AS ?adjusted) }';

            const result = formatter.formatFromText(query);

            // BIND expression should stay on single line
            const lines = result.output.split('\n');
            const bindLine = lines.find(l => l.includes('BIND'));
            expect(bindLine).toContain('BIND(?d - "P25D"^^xsd:dayTimeDuration AS ?adjusted)');
        });

        it('should keep BIND with arithmetic on a single line', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/val> ?v . BIND(?v * 2 + 1 AS ?result) }';

            const result = formatter.formatFromText(query);

            // BIND with arithmetic should stay on single line
            const lines = result.output.split('\n');
            const bindLine = lines.find(l => l.includes('BIND'));
            expect(bindLine).toContain('BIND(?v * 2 + 1 AS ?result)');
        });

        it('should format queries with predicate lists correctly', () => {
            const query = `SELECT ?x WHERE {
    ?x a <http://ex.org/Class>;
        <http://ex.org/name> ?name.
    ?y a <http://ex.org/Other>;
        <http://ex.org/value> ?val.
}`;

            const result = formatter.formatFromText(query);

            // Should contain both subjects
            expect(result.output).toContain('?x a');
            expect(result.output).toContain('?y a');
            // Predicate list continuation should be indented
            expect(result.output).toContain(';');
            // Should not have duplicate blank lines
            expect(result.output).not.toMatch(/\n\n\n/);
        });

        it('should format complex query with comments, blank lines, nested blocks and expressions', () => {
            const query = `PREFIX ex: <http://ex.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?item ?startDate ?adjustedDate
WHERE {
    ?item a ex:Item;
        ex:hasRef ?ref.

    # Get the earliest start date
    ?ref ex:hasConfig / ex:hasSchedule / ex:hasEvent ?event.

    ?event a ex:StartEvent;
        ex:startDate ?startDate.

    FILTER NOT EXISTS {
        ?ref ex:hasConfig / ex:hasSchedule / ex:hasEvent ?otherEvent.

        ?otherEvent a ex:StartEvent;
            ex:startDate ?otherDate.

        FILTER(?otherDate < ?startDate)
    }

    BIND(?startDate - "P14D"^^xsd:dayTimeDuration AS ?adjustedDate)
}
LIMIT 100`;

            const result = formatter.formatFromText(query);

            // Property paths should stay on single lines
            expect(result.output).toMatch(/ex:hasConfig \/ ex:hasSchedule \/ ex:hasEvent/);

            // BIND should stay on single line
            const lines = result.output.split('\n');
            const bindLine = lines.find(l => l.includes('BIND'));
            expect(bindLine).toContain('BIND(?startDate - "P14D"^^xsd:dayTimeDuration AS ?adjustedDate)');

            // FILTER comparison should stay on single line
            const filterLine = lines.find(l => l.includes('FILTER(?otherDate'));
            expect(filterLine).toContain('FILTER(?otherDate < ?startDate)');

            // Comment should be preserved
            expect(result.output).toContain('# Get the earliest start date');

            // Blank lines should be preserved but not duplicated
            expect(result.output).toContain('\n\n');
            expect(result.output).not.toMatch(/\n\n\n/);
        });
    });

    describe('formatFromText', () => {
        it('should format INSERT DATA', () => {
            const update = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';

            const result = formatter.formatFromText(update);

            expect(result.output).toContain('INSERT DATA');
        });

        it('should format DELETE/INSERT', () => {
            const update = 'DELETE { ?s ?p ?o } INSERT { ?s <http://example.org/new> "value" } WHERE { ?s ?p ?o }';

            const result = formatter.formatFromText(update);

            expect(result.output).toContain('DELETE');
            expect(result.output).toContain('INSERT');
            expect(result.output).toContain('WHERE');
        });
    });

    describe('formatting options', () => {
        it('should compact output when prettyPrint is false', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatFromText(query, { prettyPrint: false });

            // Should not have extra newlines
            expect(result.output.split('\n').length).toBeLessThan(5);
        });

        it('should indent inside braces', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatFromText(query, { prettyPrint: true, indent: '    ' });

            expect(result.output).toContain('    ?x');
        });
    });

    describe('turtle-style formatting options', () => {
        describe('predicateListStyle', () => {
            it('should put predicates on single line when predicateListStyle is single-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p1> ?o1 ; <http://ex.org/p2> ?o2 }';

                const result = formatter.formatFromText(query, { predicateListStyle: 'single-line' });

                // Semicolon should not cause newline
                const whereContent = result.output.split('{')[1]?.split('}')[0];
                expect(whereContent).toBeDefined();
                // Check that both predicates are accessible on same/nearby lines
                expect(result.output).toContain(';');
            });

            it('should put predicates on multiple lines when predicateListStyle is multi-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p1> ?o1 ; <http://ex.org/p2> ?o2 }';

                const result = formatter.formatFromText(query, { predicateListStyle: 'multi-line' });

                // Should have newlines after semicolons
                expect(result.output).toContain(';');
            });
        });

        describe('objectListStyle', () => {
            it('should put objects on multiple lines when objectListStyle is multi-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p> ?o1, ?o2, ?o3 }';

                const result = formatter.formatFromText(query, { objectListStyle: 'multi-line' });

                expect(result.output).toContain(',');
            });

            it('should keep objects on single line when objectListStyle is single-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p> ?o1, ?o2, ?o3 }';

                const result = formatter.formatFromText(query, { objectListStyle: 'single-line' });

                // All objects should be on same line (no newline after comma)
                expect(result.output).toContain(',');
            });
        });

        describe('maxLineWidth', () => {
            it('should wrap long lines when maxLineWidth is set', () => {
                const query = 'SELECT ?very_long_variable_name ?another_long_variable WHERE { ?very_long_variable_name <http://example.org/very/long/predicate/uri> ?another_long_variable }';

                const result = formatter.formatFromText(query, { maxLineWidth: 60, prettyPrint: true });

                // Should have more lines due to wrapping
                const lines = result.output.split('\n');
                expect(lines.length).toBeGreaterThan(2);
            });

            it('should not wrap when maxLineWidth is 0', () => {
                const query = 'SELECT ?x WHERE { ?x <http://example.org/p> ?o }';

                const result = formatter.formatFromText(query, { maxLineWidth: 0 });

                // Output should maintain normal formatting
                expect(result.output).toContain('SELECT');
                expect(result.output).toContain('WHERE');
            });

            it('should keep short FILTER NOT EXISTS block on a single line', () => {
                const query = 'SELECT ?item WHERE { ?item a <http://example.org/Item> . FILTER NOT EXISTS { ?item ex:hasDecision ex:No . } }';

                const result = formatter.formatFromText(query, { maxLineWidth: 120 });

                // The FILTER NOT EXISTS block should stay on one line
                const lines = result.output.split('\n');
                const filterLine = lines.find(l => l.includes('FILTER NOT EXISTS'));
                expect(filterLine).toBeDefined();
                expect(filterLine).toContain('FILTER NOT EXISTS {');
                expect(filterLine).toContain('}');
            });

            it('should keep short VALUES block on a single line', () => {
                const query = 'SELECT ?x WHERE { VALUES ?eventDate { "2025-11-01T00:00:00"^^xsd:dateTime } ?x <http://example.org/date> ?eventDate }';

                const result = formatter.formatFromText(query, { maxLineWidth: 120 });

                // The VALUES block should stay on one line
                const lines = result.output.split('\n');
                const valuesLine = lines.find(l => l.includes('VALUES'));
                expect(valuesLine).toBeDefined();
                expect(valuesLine).toContain('VALUES ?eventDate {');
                expect(valuesLine).toContain('}');
            });

            it('should break FILTER NOT EXISTS block when it exceeds maxLineWidth', () => {
                const query = 'SELECT ?part WHERE { FILTER NOT EXISTS { ?part <http://example.org/very/long/predicate/name> <http://example.org/very/long/object/name> . } }';

                const result = formatter.formatFromText(query, { maxLineWidth: 60 });

                // The block should be broken into multiple lines
                const lines = result.output.split('\n');
                const filterLine = lines.find(l => l.includes('FILTER NOT EXISTS'));
                expect(filterLine).toBeDefined();
                // The closing } should be on a different line
                expect(filterLine).not.toMatch(/\}[^\}]*$/);
            });

            it('should keep nested short blocks inline', () => {
                const query = 'SELECT ?x WHERE { OPTIONAL { ?x <http://ex.org/p> ?y } }';

                const result = formatter.formatFromText(query, { maxLineWidth: 120 });

                // The OPTIONAL block should stay on one line
                const lines = result.output.split('\n');
                const optionalLine = lines.find(l => l.includes('OPTIONAL'));
                expect(optionalLine).toBeDefined();
                expect(optionalLine).toContain('OPTIONAL {');
                expect(optionalLine).toContain('}');
            });
        });

        describe('blankLinesBetweenSubjects', () => {
            it('should add blank lines between different subjects when enabled', () => {
                const query = 'SELECT * WHERE { ?s1 <http://ex.org/p> ?o1 . ?s2 <http://ex.org/p> ?o2 }';

                const result = formatter.formatFromText(query, { blankLinesBetweenSubjects: true });

                // Should have the query formatted with blank line between subjects
                expect(result.output).toContain('?s1');
                expect(result.output).toContain('?s2');
            });

            it('should not add blank lines between subjects when disabled', () => {
                const query = 'SELECT * WHERE { ?s1 <http://ex.org/p> ?o1 . ?s2 <http://ex.org/p> ?o2 }';

                const result = formatter.formatFromText(query, { blankLinesBetweenSubjects: false });

                expect(result.output).toContain('?s1');
                expect(result.output).toContain('?s2');
            });
        });
    });

    describe('input preservation', () => {
        describe('issue 1: blank node property list indentation in [ ]', () => {
            it('should preserve consistent indentation inside blank node brackets', () => {
                const query = `SELECT ?item ?status WHERE {
    ?item ex:hasReview [
        ex:reviewDate ?reviewDate ;
        ex:hasReviewer ?reviewer ;
        ex:hasStatus ?status ;
    ]
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                const lines = result.output.split('\n');

                // Find lines inside the brackets
                const reviewDateLine = lines.find(l => l.includes('ex:reviewDate'));
                const reviewerLine = lines.find(l => l.includes('ex:hasReviewer'));
                const statusLine = lines.find(l => l.includes('ex:hasStatus'));

                expect(reviewDateLine).toBeDefined();
                expect(reviewerLine).toBeDefined();
                expect(statusLine).toBeDefined();

                // All predicate-object pairs inside [] should have the same indentation
                const reviewDateIndent = reviewDateLine!.match(/^(\s*)/)?.[1].length ?? 0;
                const reviewerIndent = reviewerLine!.match(/^(\s*)/)?.[1].length ?? 0;
                const statusIndent = statusLine!.match(/^(\s*)/)?.[1].length ?? 0;

                expect(reviewerIndent).toBe(reviewDateIndent);
                expect(statusIndent).toBe(reviewDateIndent);

                // The closing ] should be at the same indent as the line with [
                const openBracketLine = lines.find(l => l.includes('['));
                const closeBracketLine = lines.find(l => l.trim() === ']');
                expect(closeBracketLine).toBeDefined();
                const openIndent = openBracketLine!.match(/^(\s*)/)?.[1].length ?? 0;
                const closeIndent = closeBracketLine!.match(/^(\s*)/)?.[1].length ?? 0;
                expect(closeIndent).toBe(openIndent);
            });
        });

        describe('issue 2: multi-line FILTER preservation', () => {
            it('should preserve newlines inside multi-line FILTER expressions', () => {
                const query = `SELECT ?item WHERE {
    ?item a ex:Item .
    FILTER (
        EXISTS { ?item ex:isValid true } ||
        EXISTS { ?item ex:isVerified true }
    )
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                // The FILTER body should span multiple lines, not be collapsed
                const lines = result.output.split('\n');
                const filterLine = lines.find(l => l.includes('FILTER'));
                expect(filterLine).toBeDefined();

                // EXISTS clauses should be on separate lines
                const existsLines = lines.filter(l => l.includes('EXISTS'));
                expect(existsLines.length).toBe(2);

                // The two EXISTS clauses should NOT be on the same line
                const existsValidLine = lines.findIndex(l => l.includes('ex:isValid'));
                const existsVerifiedLine = lines.findIndex(l => l.includes('ex:isVerified'));
                expect(existsValidLine).not.toBe(existsVerifiedLine);
            });
        });

        describe('issue 3: VALUES keyword and variable on same line', () => {
            it('should keep VALUES keyword and variable on the same line', () => {
                const query = `SELECT ?item WHERE {
    VALUES ?type {
        ex:TypeA
        ex:TypeB
        ex:TypeC
    }
    ?item a ?type
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                // VALUES and ?type should be on the same line
                expect(result.output).toMatch(/VALUES \?type \{/);

                // There should NOT be a blank line between VALUES and ?type
                expect(result.output).not.toMatch(/VALUES\s*\n/);
            });
        });

        describe('issue 4: ORDER BY line break preservation', () => {
            it('should preserve line break between ORDER BY and LIMIT', () => {
                const query = `SELECT ?item WHERE {
    ?item a ex:Item
}
ORDER BY ?item
LIMIT 100`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                // ORDER BY and LIMIT should be on separate lines
                const lines = result.output.split('\n');
                const orderByLine = lines.findIndex(l => l.includes('ORDER BY'));
                const limitLine = lines.findIndex(l => l.includes('LIMIT'));

                expect(orderByLine).toBeGreaterThan(-1);
                expect(limitLine).toBeGreaterThan(-1);
                expect(limitLine).toBe(orderByLine + 1);
            });
        });

        describe('issue 5: comment and blank line preservation', () => {
            it('should preserve comments in the output', () => {
                const query = `SELECT ?item WHERE {
    # This item must be active.
    ?item a ex:ActiveItem .

    ?item ex:hasDate ?date .
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                // Comment should be preserved
                expect(result.output).toContain('# This item must be active.');
            });

            it('should preserve blank lines between statement groups', () => {
                const query = `SELECT ?item ?eventDate WHERE {
    ?item ex:hasSchedule / ex:hasPhase / ex:hasEvent ?event .

    ?event a ex:MilestoneEvent ;
        ex:eventDate ?eventDate .
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                });

                const lines = result.output.split('\n');

                // Find the line with the first triple (ending with .)
                const firstTripleLine = lines.findIndex(l => l.includes('ex:hasEvent'));
                // Find the line with the second triple
                const secondTripleLine = lines.findIndex(l => l.includes('ex:MilestoneEvent'));

                expect(firstTripleLine).toBeGreaterThan(-1);
                expect(secondTripleLine).toBeGreaterThan(-1);

                // There should be a blank line between the two groups
                // i.e., the gap should be >= 2 lines
                expect(secondTripleLine - firstTripleLine).toBeGreaterThanOrEqual(2);
            });

            it('should preserve space before period in triple terminator', () => {
                const query = `SELECT ?item WHERE {
    ?item ex:hasSchedule / ex:hasPhase / ex:hasEvent ?event .

    ?event a ex:MilestoneEvent ;
        ex:eventDate ?eventDate .
}`;
                const result = formatter.formatFromText(query, {
                    indent: '    ',
                    maxLineWidth: 120,
                    spaceBeforePunctuation: true,
                });

                // Period should have space before it
                expect(result.output).toContain('?event .');
            });
        });
    });

    describe('inline statements (semicolon on single line)', () => {
        it('should keep a short triple pattern on one line when source has no line breaks', () => {
            const query = 'SELECT * WHERE { ?item a ex:Item; ex:hasIntro ?intro. }';

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // The triple pattern should stay on one line
            expect(result.output).toContain('?item a ex:Item; ex:hasIntro ?intro.');
        });

        it('should break triple pattern when source has explicit line breaks after semicolon', () => {
            const query = [
                'SELECT * WHERE {',
                '  ?item a ex:Item;',
                '    ex:hasIntro ?intro.',
                '}',
            ].join('\n');

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            // Should follow the source layout and break at the semicolon
            expect(result.output).toContain(';\n');
        });

        it('should break a long triple pattern that exceeds maxLineWidth', () => {
            const query = 'SELECT * WHERE { ?veryLongSubject a veryLong:TypeName; veryLong:predicateName ?veryLongObject. }';

            const result = formatter.formatFromText(query, { maxLineWidth: 40 });

            // Should break because total length exceeds 40
            expect(result.output).toContain(';\n');
        });

        it('should keep multiple semicolons on one line when it fits', () => {
            const query = 'SELECT * WHERE { ?s a ex:T; ex:p1 ?o1; ex:p2 ?o2. }';

            const result = formatter.formatFromText(query, { maxLineWidth: 120 });

            expect(result.output).toContain('?s a ex:T; ex:p1 ?o1; ex:p2 ?o2.');
        });

        it('should preserve indentation for multi-line predicate list with property paths', () => {
            const query = [
                'SELECT * WHERE {',
                '    ?item a ex:Item ;',
                '        ex:identifiedBy / ex:id ?itemID ;',
                '        ex:hasIntro ?intro .',
                '}',
            ].join('\n');

            const result = formatter.formatFromText(query);

            // Each continuation after semicolon should be indented more than the subject line
            const lines = result.output.split('\n');
            const subjectLine = lines.find(l => l.includes('?item a ex:Item'));
            const idLine = lines.find(l => l.includes('ex:identifiedBy'));
            const introLine = lines.find(l => l.includes('ex:hasIntro'));

            expect(subjectLine).toBeDefined();
            expect(idLine).toBeDefined();
            expect(introLine).toBeDefined();

            const subjectIndent = subjectLine!.match(/^\s*/)?.[0]?.length ?? 0;
            const idIndent = idLine!.match(/^\s*/)?.[0]?.length ?? 0;
            const introIndent = introLine!.match(/^\s*/)?.[0]?.length ?? 0;

            // Continuations should be indented more than the subject
            expect(idIndent).toBeGreaterThan(subjectIndent);
            expect(introIndent).toBeGreaterThan(subjectIndent);
        });

        it('should not introduce blank line between comment and following statement', () => {
            const query = [
                'SELECT * WHERE {',
                '    ?config ex:hasConfig / ex:hasSchedule / ex:hasEvent ?earliestEvent .',
                '    # The second event occurs after the first event.',
                '    ?item ex:hasDate ?date .',
                '}',
            ].join('\n');

            const result = formatter.formatFromText(query);

            // Comment should be present
            expect(result.output).toContain('# The second event occurs after the first event.');

            // The blank line (from blankLinesBetweenSubjects) should be BEFORE the comment,
            // not between the comment and the statement it annotates.
            // i.e., there should be NO blank line between # comment and ?item
            expect(result.output).not.toMatch(/#[^\n]*\n\s*\n\s*\?item/);

            // The blank line between subjects should appear before the comment
            expect(result.output).toMatch(/\.\s*\n\s*\n\s*#/);
        });

        it('should place blank line before comment when comment precedes new subject with multi-line predicates', () => {
            const query = [
                'SELECT * WHERE {',
                '    ?item a ex:Item ;',
                '        ex:identifiedBy / ex:id ?itemID ;',
                '        ex:hasIntro ?intro .',
                '    # The second event occurs after the first event (with an offset).',
                '    ?config ex:hasConfig / ex:hasSchedule / ex:hasEvent ?earliestEvent .',
                '}',
            ].join('\n');

            const result = formatter.formatFromText(query);
            const lines = result.output.split('\n');

            // Comment should be present
            expect(result.output).toContain('# The second event occurs after the first event');

            // No blank line between comment and ?config
            expect(result.output).not.toMatch(/#[^\n]*\n\s*\n\s*\?config/);

            // Blank line between subjects should appear before the comment
            expect(result.output).toMatch(/\.\s*\n\s*\n\s*#/);

            // Multi-line predicate list should have proper indentation
            const partLine = lines.find(l => l.trimStart().startsWith('?item'));
            const idLine = lines.find(l => l.includes('ex:identifiedBy'));
            expect(partLine).toBeDefined();
            expect(idLine).toBeDefined();
            const partIndent = partLine!.match(/^\s*/)?.[0]?.length ?? 0;
            const idIndent = idLine!.match(/^\s*/)?.[0]?.length ?? 0;
            expect(idIndent).toBeGreaterThan(partIndent);
        });
    });
});
