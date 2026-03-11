import { describe, it, expect } from 'vitest';
import { TurtleFormatter } from './formatter.js';

describe('TurtleFormatter', () => {
    const formatter = new TurtleFormatter();

    describe('inline statements (semicolon on single line)', () => {
        it('should keep a short statement on one line when source has no line breaks', () => {
            const input = 'ex:part a ex:Part; ex:hasCO ex:co1.';

            const result = formatter.format(input, { maxLineWidth: 80 });

            expect(result.output).toBe('ex:part a ex:Part; ex:hasCO ex:co1.');
        });

        it('should keep a short statement on one line even with maxLineWidth 0 when source is inline', () => {
            const input = 'ex:part a ex:Part; ex:hasCO ex:co1.';

            const result = formatter.format(input);

            expect(result.output).toBe('ex:part a ex:Part; ex:hasCO ex:co1.');
        });

        it('should break a statement when source has explicit line breaks after semicolon', () => {
            const input = [
                'ex:part a ex:Part;',
                '  ex:hasCO ex:co1.',
            ].join('\n');

            const result = formatter.format(input, { maxLineWidth: 80 });

            // Should follow the source layout and break
            expect(result.output).toContain(';\n');
        });

        it('should break a long statement that exceeds maxLineWidth', () => {
            const input = 'ex:veryLongSubjectName a ex:VeryLongTypeName; ex:veryLongPredicateName ex:veryLongObjectName.';

            const result = formatter.format(input, { maxLineWidth: 40 });

            // Should break because total length exceeds 40
            expect(result.output).toContain(';\n');
        });

        it('should keep multiple semicolons on one line when it fits', () => {
            const input = 'ex:s a ex:T; ex:p1 ex:o1; ex:p2 ex:o2.';

            const result = formatter.format(input, { maxLineWidth: 80 });

            expect(result.output).toBe('ex:s a ex:T; ex:p1 ex:o1; ex:p2 ex:o2.');
        });

        it('should break when source has line breaks even if it would fit', () => {
            const input = [
                'ex:s a ex:T;',
                '  ex:p1 ex:o1;',
                '  ex:p2 ex:o2.',
            ].join('\n');

            const result = formatter.format(input, { maxLineWidth: 80 });

            // Source had explicit line breaks, so follow them
            expect(result.output).toContain(';\n');
        });

        it('should handle inline statement inside blank node brackets', () => {
            const input = [
                'ex:s ex:p [',
                '  a ex:T; ex:q ex:o',
                '].',
            ].join('\n');

            const result = formatter.format(input, { maxLineWidth: 80 });

            // The inner statement inside [] should stay inline since source had it inline
            expect(result.output).toContain('a ex:T; ex:q ex:o');
        });

        it('should handle prefix declarations followed by an inline statement', () => {
            const input = [
                '@prefix ex: <http://example.org/>.',
                'ex:s a ex:T; ex:p ex:o.',
            ].join('\n');

            const result = formatter.format(input, { maxLineWidth: 80 });

            expect(result.output).toContain('ex:s a ex:T; ex:p ex:o.');
        });
    });
});
