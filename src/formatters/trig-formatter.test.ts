import { describe, it, expect } from 'vitest';
import { TrigFormatter } from './trig-formatter';
import { RdfToken } from '@faubulous/mentor-rdf-parsers';

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

    it('supports uppercase directive mode', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            'ex:s ex:p ex:o .',
        ].join('\n');

        const result = formatter.formatFromText(input, {
            lowercaseDirectives: false,
        });

        expect(result.output).toContain('PREFIX ex: <http://example.org/>.');
    });

    it('formats graph keyword tokens in uppercase', () => {
        const tokens = [
            { image: 'graph', startOffset: 0, tokenType: RdfToken.GRAPH },
            { image: '<http://example.org/g>', startOffset: 6, tokenType: RdfToken.IRIREF },
            { image: '{', startOffset: 30, tokenType: RdfToken.LCURLY },
            { image: '<http://example.org/s>', startOffset: 32, tokenType: RdfToken.IRIREF },
            { image: '<http://example.org/p>', startOffset: 56, tokenType: RdfToken.IRIREF },
            { image: '<http://example.org/o>', startOffset: 80, tokenType: RdfToken.IRIREF },
            { image: '.', startOffset: 104, tokenType: RdfToken.PERIOD },
            { image: '}', startOffset: 106, tokenType: RdfToken.RCURLY },
            { image: '.', startOffset: 107, tokenType: RdfToken.PERIOD },
        ];

        const result = formatter.formatFromTokens(tokens as any);

        expect(result.output).toContain('GRAPH');
        expect(result.output).toContain('{');
        expect(result.output).toContain('}');
    });

    it('keeps comment tokens when formatting from tokens', () => {
        const tokens = [
            { image: '<http://example.org/s>', startOffset: 0, tokenType: RdfToken.IRIREF },
            { image: '# dataset note', startOffset: 25, tokenType: RdfToken.COMMENT },
            { image: '<http://example.org/p>', startOffset: 40, tokenType: RdfToken.IRIREF },
            { image: '<http://example.org/o>', startOffset: 64, tokenType: RdfToken.IRIREF },
            { image: '.', startOffset: 88, tokenType: RdfToken.PERIOD },
        ];

        const result = formatter.formatFromTokens(tokens as any);

        expect(result.output).toContain('# dataset note');
    });

    it('returns original input when lexing fails', () => {
        const invalid = '%%%';

        const result = formatter.formatFromText(invalid);

        expect(result.output).toBe(invalid);
    });

    it('should preserve blank line between period and a following comment section', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            '',
            'ex:g {',
            '    ex:ShapeA a ex:NodeShape ;',
            '        ex:property [',
            '            ex:path ex:name',
            '        ] .',
            '',
            '    # Second shape',
            '    ex:ShapeB a ex:NodeShape .',
            '}.',
        ].join('\n');

        const result = formatter.formatFromText(input, {
            prettyPrint: true,
            blankLinesBetweenSubjects: true,
            spaceBeforePunctuation: true,
        });

        // The blank line between '] .' and '# Second shape' must survive.
        expect(result.output).toMatch(/\] \.\n\n\s*# Second shape/);
    });
});
