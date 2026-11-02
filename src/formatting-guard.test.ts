import { describe, it, expect, vi } from 'vitest';
import { RdfSyntax, SparqlLexer, TurtleLexer } from '@faubulous/mentor-rdf-parsers';
import { FormattingGuard } from './formatting-guard';
import { N3Formatter, NQuadsFormatter, NTriplesFormatter, SparqlFormatter, TrigFormatter, TurtleFormatter } from './formatters';

describe('FormattingGuard', () => {
    const turtleLexer = new TurtleLexer();
    const turtleGuard = new FormattingGuard(RdfSyntax.Turtle, turtleLexer);

    const sparqlLexer = new SparqlLexer();
    const sparqlGuard = new FormattingGuard(RdfSyntax.Sparql, sparqlLexer);

    const DOCUMENT = '@prefix ex: <http://example.org/> .\n# A comment.\nex:s ex:p ex:o , ex:q .\n';

    /**
     * Guards a Turtle document with a formatter that returns the given text.
     * @param input The document.
     * @param output The text the formatter returns.
     * @param verify Whether to verify the formatted text.
     */
    const guardTurtle = (input: string, output: string, verify = true) =>
        turtleGuard.format(input, turtleLexer.tokenize(input), verify, () => ({ output }));

    /**
     * Guards a SPARQL query with a formatter that returns the given text.
     * @param input The query.
     * @param output The text the formatter returns.
     */
    const guardSparql = (input: string, output: string) =>
        sparqlGuard.format(input, sparqlLexer.tokenize(input), true, () => ({ output }));

    it('does not format a document with syntax errors', () => {
        const input = '<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/x> .';
        const format = vi.fn(() => ({ output: 'formatted' }));

        const result = turtleGuard.format(input, turtleLexer.tokenize(input), false, format);

        expect(format).not.toHaveBeenCalled();
        expect(result.output).toBe(input);
        expect(result.warnings).toHaveLength(1);
    });

    it('formats a document whose prefixes are not declared', () => {
        expect(guardTurtle('ex:s ex:p ex:o .', 'formatted', false).output).toBe('formatted');
    });

    it('applies formatted text with the same content and comments', () => {
        const output = 'PREFIX ex: <http://example.org/>\n\n# A comment.\nex:s ex:p ex:o, ex:q.\n';

        const result = guardTurtle(DOCUMENT, output);

        expect(result.output).toBe(output);
        expect(result.warnings).toBeUndefined();
    });

    it('rejects formatted text that drops a statement', () => {
        const result = guardTurtle(DOCUMENT, 'PREFIX ex: <http://example.org/>\n# A comment.\nex:s ex:p ex:o.\n');

        expect(result.output).toBe(DOCUMENT);
        expect(result.warnings).toHaveLength(1);
    });

    it('rejects formatted text that drops a comment', () => {
        const result = guardTurtle(DOCUMENT, 'PREFIX ex: <http://example.org/>\nex:s ex:p ex:o, ex:q.\n');

        expect(result.output).toBe(DOCUMENT);
        expect(result.warnings).toHaveLength(1);
    });

    it('rejects formatted text with syntax errors', () => {
        const result = guardTurtle(DOCUMENT, 'PREFIX ex: <http://example.org/>\n# A comment.\nex:s ex:p .\n');

        expect(result.output).toBe(DOCUMENT);
        expect(result.warnings).toHaveLength(1);
    });

    it('rejects formatted text that moves punctuation into a comment', () => {
        const input = '@prefix ex: <http://example.org/> .\nex:s ex:p ex:o # A comment.\n.\nex:t ex:p ex:o .\n';

        const result = guardTurtle(input, 'PREFIX ex: <http://example.org/>\nex:s ex:p ex:o # A comment..\nex:t ex:p ex:o.\n');

        expect(result.output).toBe(input);
        expect(result.warnings).toHaveLength(1);
    });

    it('verifies a document whose prefixes are not declared', () => {
        expect(guardTurtle('ex:s ex:p ex:o .', 'ex:s ex:p ex:o.').output).toBe('ex:s ex:p ex:o.');
        expect(guardTurtle('ex:s ex:p ex:o .', 'ex:s ex:p ex:x.').output).toBe('ex:s ex:p ex:o .');
    });

    it('compares the syntax graph of a query, however its blank nodes are labelled', () => {
        const input = 'SELECT * WHERE { ?s ?p [ ?q ?o ] }';

        expect(guardSparql(input, 'SELECT *\nWHERE {\n  ?s ?p [ ?q ?o ]\n}').output).toBe('SELECT *\nWHERE {\n  ?s ?p [ ?q ?o ]\n}');
        expect(guardSparql(input, 'SELECT *\nWHERE {\n  ?s ?p [ ?q ?x ]\n}').output).toBe(input);
    });

    describe('in the formatters', () => {
        const cases = [
            { formatter: new TurtleFormatter(), input: '<http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/d> .' },
            { formatter: new TrigFormatter(), input: '<http://example.org/g> { <http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/d> . }' },
            { formatter: new N3Formatter(), input: '<http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/d> .' },
            { formatter: new NTriplesFormatter(), input: '<http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/d> .' },
            { formatter: new NQuadsFormatter(), input: '<http://example.org/a> <http://example.org/b> <http://example.org/c> <http://example.org/g> <http://example.org/d> .' },
            { formatter: new SparqlFormatter(), input: 'SELECT * WHERE { ?s ?p }' },
        ];

        it.each(cases)('$formatter.constructor.name returns a document with syntax errors unchanged', ({ formatter, input }) => {
            const result = formatter.formatFromText(input);

            expect(result.output).toBe(input);
            expect(result.warnings).toHaveLength(1);
        });

        it('formats a Turtle document whose prefixes are not declared, with and without verification', () => {
            const formatter = new TurtleFormatter();

            expect(formatter.formatFromText('ex:s   ex:p   ex:o .').output).toBe('ex:s ex:p ex:o.');
            expect(formatter.formatFromText('ex:s   ex:p   ex:o .', { verifyRoundTrip: true }).output).toBe('ex:s ex:p ex:o.');
        });
    });
});
