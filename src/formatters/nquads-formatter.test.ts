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
});
