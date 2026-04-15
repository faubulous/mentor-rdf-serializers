import { describe, it, expect } from 'vitest';
import { N3Formatter } from './n3-formatter';
import { RdfToken } from '@faubulous/mentor-rdf-parsers';

// All IRIs and terms here are purely synthetic example data.

describe('N3Formatter', () => {
    const formatter = new N3Formatter();

    it('does not insert an extra blank line inside a formula block', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            '{ ex:s ex:p ex:o . }.',
        ].join('\n');

        const result = formatter.formatFromText(input, { 
            indent: '    ',
            maxLineWidth: 120
        });

        const lines = result.output.split('\n');
        const braceLineIndex = lines.findIndex(line => line.includes('{'));

        expect(braceLineIndex).toBeGreaterThan(-1);

        // The first non-empty line after the opening brace must be the triple
        let n = braceLineIndex + 1;

        while (n < lines.length && lines[n].trim() === '') {
            n++;
        }

        expect(lines[n].trim()).toContain('ex:s ex:p ex:o');
    });

    it('preserves @prefix style when no directiveStyle is set', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            'ex:s ex:p ex:o .',
        ].join('\n');

        const result = formatter.formatFromText(input);

        expect(result.output).toContain('@prefix ex: <http://example.org/>');
        expect(result.output).not.toContain('PREFIX ex:');
    });

    it('converts @prefix to PREFIX when directiveStyle is sparql-uppercase', () => {
        const input = [
            '@prefix ex: <http://example.org/> .',
            'ex:s ex:p ex:o .',
        ].join('\n');

        const result = formatter.formatFromText(input, { directiveStyle: 'sparql-uppercase' });

        expect(result.output).toContain('PREFIX ex: <http://example.org/>');
        expect(result.output).not.toContain('@prefix');
    });

    it('formats implication and reverse-implication operators from token input', () => {
        const tokens = [
            { image: '<http://example.org/a>', startOffset: 0, tokenType: RdfToken.IRIREF },
            { image: '=>', startOffset: 24, tokenType: RdfToken.IMPLIES },
            { image: '<http://example.org/b>', startOffset: 27, tokenType: RdfToken.IRIREF },
            { image: '.', startOffset: 51, tokenType: RdfToken.PERIOD },
            { image: '<http://example.org/c>', startOffset: 53, tokenType: RdfToken.IRIREF },
            { image: '<=', startOffset: 77, tokenType: RdfToken.IMPLIED_BY },
            { image: '<http://example.org/d>', startOffset: 80, tokenType: RdfToken.IRIREF },
            { image: '.', startOffset: 104, tokenType: RdfToken.PERIOD },
        ];

        const result = formatter.formatFromTokens(tokens as any);

        expect(result.output).toContain('=>');
        expect(result.output).toContain('<=');
    });

    it('keeps comment tokens when formatting from tokens', () => {
        const tokens = [
            { image: '<http://example.org/s>', startOffset: 0, tokenType: RdfToken.IRIREF },
            { image: '# inline', startOffset: 25, tokenType: RdfToken.COMMENT },
            { image: '<http://example.org/p>', startOffset: 34, tokenType: RdfToken.IRIREF },
            { image: '<http://example.org/o>', startOffset: 58, tokenType: RdfToken.IRIREF },
            { image: '.', startOffset: 82, tokenType: RdfToken.PERIOD },
        ];

        const result = formatter.formatFromTokens(tokens as any);

        expect(result.output).toContain('# inline');
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
            'ex:ShapeA a ex:NodeShape ;',
            '    ex:property [',
            '        ex:path ex:name',
            '    ] .',
            '',
            '# Section Two',
            'ex:ShapeB a ex:NodeShape .',
        ].join('\n');

        const result = formatter.formatFromText(input, {
            prettyPrint: true,
            blankLinesBetweenSubjects: true,
            spaceBeforePunctuation: true,
        });

        // The blank line between '] .' and '# Section Two' must survive.
        expect(result.output).toMatch(/\] \.\n\n# Section Two/);
    });
});
