import { describe, it, expect } from 'vitest';
import { tokenizeTemplateForFormatting } from '@faubulous/mentor-rdf-parsers';
import { TurtleFormatter } from './turtle-formatter';
import { SparqlFormatter } from './sparql-formatter';

// Template body formatting needs `tokenizeTemplateForFormatting` from mentor-rdf-parsers.
// Skip these end-to-end cases when an older parsers (without it) is installed (e.g. CI
// before the new parsers is published); the host-only path is covered elsewhere.
const describeTemplate = typeof tokenizeTemplateForFormatting === 'function' ? describe : describe.skip;

describeTemplate('template-aware formatFromText', () => {
    it('formats a Turtle template: frontmatter reprinted, body reflowed, ${…} preserved', () => {
        const text = [
            '---',
            'params {   type:iri   }',
            'example x {   type: schema:Person   }',
            '---',
            '@prefix ex:   <http://ex/> .',
            '${type}    a    ex:Thing ;   ex:p   ex:o .',
        ].join('\n');

        const out = new TurtleFormatter().formatFromText(text).output;

        // Frontmatter canonicalised, with one blank line between the {} blocks.
        expect(out).toContain('---\nparams {\n  type: iri\n}\n\nexample x {\n  type: schema:Person\n}\n---\n');
        // Body reflowed but the interpolation is preserved verbatim as a term.
        expect(out).toContain('${type} a ex:Thing');
        // No raw placeholder leaked.
        expect(out).not.toContain('<___');
    });

    it('preserves body comments when formatting a template', () => {
        const text = '---\nparams { n: int }\n---\n@prefix ex: <http://ex/> .\n# a body comment\nex:s ex:p ex:o .\n';
        const out = new TurtleFormatter().formatFromText(text).output;

        expect(out).toContain('# a body comment');
    });

    it('formats a SPARQL template body', () => {
        const text = '---\nparams { type: iri }\n---\nSELECT   *   WHERE{ ?s a ${type} . }';
        const out = new SparqlFormatter().formatFromText(text).output;

        expect(out).toContain('---\nparams {\n  type: iri\n}\n---\n');
        expect(out).toContain('${type}');
        expect(out.toUpperCase()).toContain('SELECT');
    });

    it('leaves a template with control directives unchanged', () => {
        const text = '---\nparams { limit: int }\n---\nSELECT * WHERE { ?s ?p ?o }\n{% if limit %}LIMIT ${limit}{% endif %}\n';
        const out = new SparqlFormatter().formatFromText(text).output;

        expect(out).toBe(text);
    });

    it('still formats a plain (non-template) document normally', () => {
        const out = new TurtleFormatter().formatFromText('@prefix ex:<http://ex/>.\nex:s ex:p ex:o.').output;

        expect(out).toContain('@prefix ex: <http://ex/>');
        expect(out).toContain('ex:s ex:p ex:o');
        expect(out).not.toContain('---');
    });
});
