import { describe, it, expect } from 'vitest';
import { TriplateFrontmatterFormatter } from './triplate-frontmatter-formatter';

const fmt = new TriplateFrontmatterFormatter();
const opts = { indent: '  ' };

describe('TriplateFrontmatterFormatter', () => {
    it('canonicalises a messy params + example block', () => {
        const text = [
            '---',
            'params {   type:iri   numbers: int[]   }',
            'example demo {',
            '    type:   schema:Person',
            '   numbers:[1, 2]',
            '}',
            '---',
            'BODY',
        ].join('\n');

        const out = fmt.format(text, opts);

        expect(out).toBe([
            '---',
            'params {',
            '  type: iri',
            '  numbers: int[]',
            '}',
            '',
            'example demo {',
            '  type: schema:Person',
            '  numbers: [1, 2]',
            '}',
            '---',
            '',
        ].join('\n'));
    });

    it('separates {} blocks with exactly one blank line', () => {
        const text = '---\nparams { a: iri }\nexample x { a: ex:x }\nexample y { a: ex:y }\n---\nBODY';
        const out = fmt.format(text, opts);

        expect(out).toBe([
            '---',
            'params {',
            '  a: iri',
            '}',
            '',
            'example x {',
            '  a: ex:x',
            '}',
            '',
            'example y {',
            '  a: ex:y',
            '}',
            '---',
            '',
        ].join('\n'));
    });

    it('preserves and re-indents frontmatter comments', () => {
        const text = [
            '---',
            '# the parameters',
            'params {',
            '# the subject type',
            '  type: iri',
            '}',
            '---',
            'BODY',
        ].join('\n');

        const out = fmt.format(text, opts);

        expect(out).toContain('# the parameters');
        expect(out).toContain('# the subject type');
        // the comment above the param is re-indented to the param's level
        expect(out).toContain('\n  # the subject type\n  type: iri');
    });

    it('is idempotent', () => {
        const text = '---\nparams { a: iri b: literal(xsd:string) c: int[] optional }\nexample e {\n  a: ex:x\n  b: "hi"^^xsd:string\n  c: [1, 2, 3]\n}\n---\n?s a ${a} .';
        const once = fmt.format(text, opts);
        const twice = fmt.format(once + '?s a ${a} .'.replace(/^/, ''), opts); // format the formatted frontmatter again

        // Re-formatting the already-formatted frontmatter yields the same block.
        expect(fmt.format(once + 'BODY', opts)).toBe(once);
    });

    it('respects a tab indent', () => {
        const text = '---\nparams { type: iri }\n---\nBODY';
        const out = fmt.format(text, { indent: '\t' });

        expect(out).toContain('\n\ttype: iri\n');
    });

    it('returns the original frontmatter unchanged when it cannot compile', () => {
        const text = '---\nthis is not valid @#$ triplate\n---\nBODY';
        const out = fmt.format(text, opts);

        expect(out).toBe('---\nthis is not valid @#$ triplate\n---\n');
    });

    it('returns empty string when there is no frontmatter', () => {
        expect(fmt.format('SELECT * WHERE {}', opts)).toBe('');
    });
});
