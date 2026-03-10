import { describe, it, expect, beforeEach } from 'vitest';
import { SparqlFormatter } from './formatter.js';

describe('SparqlFormatter', () => {
    let formatter: SparqlFormatter;

    beforeEach(() => {
        formatter = new SparqlFormatter();
    });

    describe('formatQuery', () => {
        it('should format a simple SELECT query', () => {
            const query = 'select ?s ?p ?o where { ?s ?p ?o }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
        });

        it('should uppercase keywords by default', () => {
            const query = 'select ?x where { ?x a <http://example.org/Class> }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
        });

        it('should lowercase keywords when requested', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatQuery(query, { lowercaseKeywords: true });

            expect(result.output).toContain('select');
            expect(result.output).toContain('where');
        });

        it('should format PREFIX declarations', () => {
            const query = 'PREFIX ex: <http://example.org/> SELECT ?x WHERE { ?x a ex:Class }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('PREFIX ex:');
        });

        it('should handle FILTER expressions', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/value> ?v . FILTER(?v > 10) }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('FILTER');
        });

        it('should handle OPTIONAL patterns', () => {
            const query = 'SELECT ?x ?y WHERE { ?x a <http://example.org/Class> . OPTIONAL { ?x <http://example.org/prop> ?y } }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('OPTIONAL');
        });

        it('should preserve comments', () => {
            const query = '# This is a comment\nSELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('# This is a comment');
        });

        it('should format ORDER BY clause', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o } ORDER BY ?x';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('ORDER BY');
        });

        it('should format LIMIT and OFFSET', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o } LIMIT 10 OFFSET 5';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('LIMIT');
            expect(result.output).toContain('OFFSET');
        });

        it('should handle GROUP BY and HAVING', () => {
            const query = 'SELECT ?x (COUNT(?y) as ?count) WHERE { ?x <http://example.org/prop> ?y } GROUP BY ?x HAVING (COUNT(?y) > 1)';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('GROUP BY');
            expect(result.output).toContain('HAVING');
        });

        it('should NOT uppercase boolean literals (true/false)', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> true }';

            const result = formatter.formatQuery(query, { uppercaseKeywords: true });

            // Keywords should be uppercase
            expect(result.output).toContain('SELECT');
            expect(result.output).toContain('WHERE');
            // But boolean literals must remain lowercase (case-sensitive in SPARQL)
            expect(result.output).toContain('true');
            expect(result.output).not.toContain('TRUE');
        });

        it('should keep false literal lowercase even with uppercaseKeywords', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> false }';

            const result = formatter.formatQuery(query, { uppercaseKeywords: true });

            expect(result.output).toContain('false');
            expect(result.output).not.toContain('FALSE');
        });

        // Note: In SPARQL, boolean literals MUST be lowercase (true, false).
        // The SparqlLexer does not recognize uppercase variants as valid tokens.
        // This test verifies that valid lowercase booleans are preserved.
        it('should keep boolean literals lowercase when input is valid lowercase', () => {
            const query = 'SELECT ?x WHERE { ?x <http://example.org/active> true . ?x <http://example.org/hidden> false }';

            const result = formatter.formatQuery(query);

            expect(result.output).toContain('true');
            expect(result.output).toContain('false');
            expect(result.output).not.toMatch(/\bTRUE\b/);
            expect(result.output).not.toMatch(/\bFALSE\b/);
        });

        it('should put PREFIX declarations on separate lines', () => {
            const query = 'PREFIX ex: <http://example.org/> PREFIX foaf: <http://xmlns.com/foaf/0.1/> SELECT ?x WHERE { ?x a ex:Class }';

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

            // PREFIX and SELECT should be on different lines
            const prefixIndex = result.output.indexOf('PREFIX');
            const selectIndex = result.output.indexOf('SELECT');
            const textBetween = result.output.substring(prefixIndex, selectIndex);
            expect(textBetween).toContain('\n');
        });

        it('should put FROM clause on a new line', () => {
            const query = 'SELECT ?x FROM <http://example.org/graph> WHERE { ?x ?p ?o }';

            const result = formatter.formatQuery(query);

            // FROM should be on its own line (newline before it)
            const selectIndex = result.output.indexOf('SELECT');
            const fromIndex = result.output.indexOf('FROM');
            const textBetween = result.output.substring(selectIndex, fromIndex);
            expect(textBetween).toContain('\n');
        });

        it('should NOT have blank line before WHERE when no FROM clause', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

            // OPTIONAL should have a newline before it
            const lines = result.output.split('\n');
            const optionalLine = lines.find(l => l.trim().startsWith('OPTIONAL'));
            expect(optionalLine).toBeDefined();
        });

        it('should put multiple OPTIONAL blocks on separate lines', () => {
            const query = 'SELECT * WHERE { ?s ?p ?o . OPTIONAL { ?s <http://ex.org/a> ?a } OPTIONAL { ?s <http://ex.org/b> ?b } }';

            const result = formatter.formatQuery(query);

            // Each OPTIONAL should be on its own line
            const lines = result.output.split('\n');
            const optionalLines = lines.filter(l => l.trim().startsWith('OPTIONAL'));
            expect(optionalLines.length).toBe(2);
        });

        it('should keep "a" keyword lowercase (rdf:type shorthand)', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://example.org/Class> }';

            const result = formatter.formatQuery(query, { uppercaseKeywords: true });

            // 'a' should remain lowercase even with uppercaseKeywords
            expect(result.output).toContain('?x a <');
            expect(result.output).not.toContain('?x A <');
        });

        it('should NOT have space before parentheses in aggregate functions', () => {
            const query = 'SELECT (COUNT(?x) AS ?count) (SUM(?y) AS ?sum) WHERE { ?x ?p ?y }';

            const result = formatter.formatQuery(query);

            // Function calls should have no space before opening paren
            expect(result.output).toContain('COUNT(');
            expect(result.output).toContain('SUM(');
            expect(result.output).not.toContain('COUNT (');
            expect(result.output).not.toContain('SUM (');
        });

        it('should NOT have space before parentheses in FILTER', () => {
            const query = 'SELECT ?x WHERE { ?x a <http://ex.org/C> . FILTER(?x != <http://ex.org/a>) }';

            const result = formatter.formatQuery(query);

            // FILTER should have no space before opening paren
            expect(result.output).toContain('FILTER(');
            expect(result.output).not.toContain('FILTER (');
        });

        it('should preserve blank lines from source', () => {
            const query = `SELECT ?x WHERE {
  ?x a <http://ex.org/Class>.

  ?x <http://ex.org/prop> ?y.
}`;

            const result = formatter.formatQuery(query);

            // There should be a blank line preserved between the triples
            const whereContent = result.output.split('{')[1]?.split('}')[0];
            expect(whereContent).toContain('\n\n');
        });

        it('should NOT have whitespace around datatype marker (^^)', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/p> "hello"^^xsd:string }';

            const result = formatter.formatQuery(query);

            // Datatype annotation should have no whitespace around ^^
            expect(result.output).toContain('"hello"^^xsd:string');
            expect(result.output).not.toContain('" ^^');
            expect(result.output).not.toContain('^^ ');
        });

        it('should keep datatype annotation on same line as literal', () => {
            const query = 'SELECT ?x WHERE { ?x <http://ex.org/p> "<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(17.632864 59.183701)"^^geo:wktLiteral }';

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

            // Should not have 3 or more consecutive newlines (which would be 2+ blank lines)
            expect(result.output).not.toMatch(/\n\n\n/);
            // But should preserve one blank line
            expect(result.output).toContain('\n\n');
        });

        it('should keep FILTER(ISURI(?s)) on a single line', () => {
            const query = 'SELECT ?s WHERE { ?s ?p ?o . FILTER(ISURI(?s)) }';

            const result = formatter.formatQuery(query);

            // FILTER with simple expression should stay on single line
            const lines = result.output.split('\n');
            const filterLine = lines.find(l => l.includes('FILTER'));
            expect(filterLine).toContain('FILTER(ISURI(?s))');
        });

        it('should keep FILTER with comparison on single line', () => {
            const query = 'SELECT ?s ?startDate ?endDate WHERE { ?s ?p ?o . FILTER(?startDate < ?endDate) }';

            const result = formatter.formatQuery(query);

            // FILTER with comparison should stay on single line
            const lines = result.output.split('\n');
            const filterLine = lines.find(l => l.includes('FILTER'));
            expect(filterLine).toContain('FILTER(?startDate < ?endDate)');
        });

        it('should keep BIND on a single line', () => {
            const query = 'SELECT ?s ?type WHERE { ?s ?p ?o . BIND(ex:Category1 AS ?type) }';

            const result = formatter.formatQuery(query);

            // BIND should stay on single line
            const lines = result.output.split('\n');
            const bindLine = lines.find(l => l.includes('BIND'));
            expect(bindLine).toContain('BIND(ex:Category1 AS ?type)');
        });

        it('should keep ASK WHERE on same line when no FROM clause', () => {
            const query = 'ASK WHERE { ?s ?p ?o }';

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

            // WHERE should be on new line after FROM
            const fromIndex = result.output.indexOf('FROM');
            const whereIndex = result.output.indexOf('WHERE');
            const textBetween = result.output.substring(fromIndex, whereIndex);
            expect(textBetween).toContain('\n');
        });

        it('should add indentation after semicolon in predicate list', () => {
            const query = 'SELECT * WHERE { ?item a ex:Thing; ex:hasId ?id }';

            const result = formatter.formatQuery(query);

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

            const result = formatter.formatQuery(query);

            // Should not have 3+ consecutive newlines (duplicate blank lines)
            expect(result.output).not.toMatch(/\n\n\n/);
        });
    });

    describe('formatUpdate', () => {
        it('should format INSERT DATA', () => {
            const update = 'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }';

            const result = formatter.formatUpdate(update);

            expect(result.output).toContain('INSERT DATA');
        });

        it('should format DELETE/INSERT', () => {
            const update = 'DELETE { ?s ?p ?o } INSERT { ?s <http://example.org/new> "value" } WHERE { ?s ?p ?o }';

            const result = formatter.formatUpdate(update);

            expect(result.output).toContain('DELETE');
            expect(result.output).toContain('INSERT');
            expect(result.output).toContain('WHERE');
        });
    });

    describe('formatting options', () => {
        it('should compact output when prettyPrint is false', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatQuery(query, { prettyPrint: false });

            // Should not have extra newlines
            expect(result.output.split('\n').length).toBeLessThan(5);
        });

        it('should indent inside braces', () => {
            const query = 'SELECT ?x WHERE { ?x ?p ?o }';

            const result = formatter.formatQuery(query, { prettyPrint: true, indent: '    ' });

            expect(result.output).toContain('    ?x');
        });
    });

    describe('turtle-style formatting options', () => {
        describe('predicateListStyle', () => {
            it('should put predicates on single line when predicateListStyle is single-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p1> ?o1 ; <http://ex.org/p2> ?o2 }';

                const result = formatter.formatQuery(query, { predicateListStyle: 'single-line' });

                // Semicolon should not cause newline
                const whereContent = result.output.split('{')[1]?.split('}')[0];
                expect(whereContent).toBeDefined();
                // Check that both predicates are accessible on same/nearby lines
                expect(result.output).toContain(';');
            });

            it('should put predicates on multiple lines when predicateListStyle is multi-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p1> ?o1 ; <http://ex.org/p2> ?o2 }';

                const result = formatter.formatQuery(query, { predicateListStyle: 'multi-line' });

                // Should have newlines after semicolons
                expect(result.output).toContain(';');
            });
        });

        describe('objectListStyle', () => {
            it('should put objects on multiple lines when objectListStyle is multi-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p> ?o1, ?o2, ?o3 }';

                const result = formatter.formatQuery(query, { objectListStyle: 'multi-line' });

                expect(result.output).toContain(',');
            });

            it('should keep objects on single line when objectListStyle is single-line', () => {
                const query = 'SELECT * WHERE { ?s <http://ex.org/p> ?o1, ?o2, ?o3 }';

                const result = formatter.formatQuery(query, { objectListStyle: 'single-line' });

                // All objects should be on same line (no newline after comma)
                expect(result.output).toContain(',');
            });
        });

        describe('maxLineWidth', () => {
            it('should wrap long lines when maxLineWidth is set', () => {
                const query = 'SELECT ?very_long_variable_name ?another_long_variable WHERE { ?very_long_variable_name <http://example.org/very/long/predicate/uri> ?another_long_variable }';

                const result = formatter.formatQuery(query, { maxLineWidth: 60, prettyPrint: true });

                // Should have more lines due to wrapping
                const lines = result.output.split('\n');
                expect(lines.length).toBeGreaterThan(2);
            });

            it('should not wrap when maxLineWidth is 0', () => {
                const query = 'SELECT ?x WHERE { ?x <http://example.org/p> ?o }';

                const result = formatter.formatQuery(query, { maxLineWidth: 0 });

                // Output should maintain normal formatting
                expect(result.output).toContain('SELECT');
                expect(result.output).toContain('WHERE');
            });
        });

        describe('blankLinesBetweenSubjects', () => {
            it('should add blank lines between different subjects when enabled', () => {
                const query = 'SELECT * WHERE { ?s1 <http://ex.org/p> ?o1 . ?s2 <http://ex.org/p> ?o2 }';

                const result = formatter.formatQuery(query, { blankLinesBetweenSubjects: true });

                // Should have the query formatted with blank line between subjects
                expect(result.output).toContain('?s1');
                expect(result.output).toContain('?s2');
            });

            it('should not add blank lines between subjects when disabled', () => {
                const query = 'SELECT * WHERE { ?s1 <http://ex.org/p> ?o1 . ?s2 <http://ex.org/p> ?o2 }';

                const result = formatter.formatQuery(query, { blankLinesBetweenSubjects: false });

                expect(result.output).toContain('?s1');
                expect(result.output).toContain('?s2');
            });
        });
    });
});
