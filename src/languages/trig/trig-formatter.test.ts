import { describe, it, expect } from 'vitest';
import { TrigFormatter } from './trig-formatter.js';

// All IRIs and terms here are purely synthetic example data.

describe('TrigFormatter', () => {
    const formatter = new TrigFormatter();

    it('does not insert an extra blank line inside a named graph block', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            'ex:g {',
            '  ex:s ex:p ex:o .',
            '}.',
        ].join('\n');

        const result = formatter.formatFromText(input, { indent: '    ', maxLineWidth: 120 });

        const lines = result.output.split('\n');
        const braceLineIndex = lines.findIndex(line => line.includes('{'));
        expect(braceLineIndex).toBeGreaterThan(-1);

        // The first non-empty line after the opening brace must be the triple
        let idx = braceLineIndex + 1;
        while (idx < lines.length && lines[idx].trim() === '') {
            idx++;
        }

        expect(lines[idx].trim()).toContain('ex:s ex:p ex:o');
    });
});
