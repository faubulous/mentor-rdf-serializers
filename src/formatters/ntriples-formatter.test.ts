import { describe, expect, it } from 'vitest';
import { NTriplesFormatter } from './ntriples-formatter';

describe('NTriplesFormatter', () => {
    const formatter = new NTriplesFormatter();

    it('normalizes spacing and keeps one triple per line', () => {
        const input = '<http://example.org/s>   <http://example.org/p>    "o"   .';

        const result = formatter.formatFromText(input, { lineEnd: '\n' });

        expect(result.output).toBe('<http://example.org/s> <http://example.org/p> "o" .\n');
    });

    it('preserves comments when formatting text input', () => {
        const input = [
            '# keep',
            '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
        ].join('\n');

        const result = formatter.formatFromText(input);

        expect(result.output).toContain('# keep');
        expect(result.output).toContain('<http://example.org/s> <http://example.org/p> <http://example.org/o> .');
    });

    it('returns input unchanged when lexing fails', () => {
        const invalid = '<http://example.org/s <http://example.org/p> <http://example.org/o> .';

        const result = formatter.formatFromText(invalid);

        expect(result.output).toBe(invalid);
    });

    it('should preserve blank line between a triple and a following comment', () => {
        const input = [
            '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
            '',
            '# Section heading',
            '<http://example.org/s2> <http://example.org/p2> <http://example.org/o2> .',
        ].join('\n');

        const result = formatter.formatFromText(input);

        // The blank line before '# Section heading' must survive.
        expect(result.output).toMatch(/\.\n\n# Section heading/);
    });
});
