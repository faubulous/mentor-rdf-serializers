import { describe, expect, it } from 'vitest';
import { NQuadsFormatter } from './nquads-formatter';

describe('NQuadsFormatter', () => {
    const formatter = new NQuadsFormatter();

    it('normalizes spacing for a quad with graph', () => {
        const input = '<http://example.org/s>   <http://example.org/p>   <http://example.org/o>   <http://example.org/g>   .';

        const result = formatter.formatFromText(input, { lineEnd: '\n' });

        expect(result.output).toBe('<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .\n');
    });

    it('preserves comments when formatting text input', () => {
        const input = [
            '# dataset comment',
            '<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .',
        ].join('\n');

        const result = formatter.formatFromText(input);

        expect(result.output).toContain('# dataset comment');
        expect(result.output).toContain('<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .');
    });

    it('returns input unchanged when lexing fails', () => {
        const invalid = '<http://example.org/s <http://example.org/p> <http://example.org/o> <http://example.org/g> .';

        const result = formatter.formatFromText(invalid);

        expect(result.output).toBe(invalid);
    });

    it('should preserve blank line between a quad and a following comment', () => {
        const input = [
            '<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .',
            '',
            '# Section heading',
            '<http://example.org/s2> <http://example.org/p2> <http://example.org/o2> <http://example.org/g> .',
        ].join('\n');

        const result = formatter.formatFromText(input);

        // The blank line before '# Section heading' must survive.
        expect(result.output).toMatch(/\.\n\n# Section heading/);
    });
});
