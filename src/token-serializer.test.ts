import { describe, it, expect, beforeEach } from 'vitest';
import { TokenSerializer, Token } from './token-serializer.js';

describe('TokenSerializer', () => {
    let serializer: TokenSerializer;

    beforeEach(() => {
        serializer = new TokenSerializer();
    });

    describe('basic serialization', () => {
        it('should serialize simple tokens', () => {
            const tokens: Token[] = [
                { image: '<http://example.org/s>', startOffset: 0, tokenType: { name: 'IRIREF' } },
                { image: '<http://example.org/p>', startOffset: 24, tokenType: { name: 'IRIREF' } },
                { image: '<http://example.org/o>', startOffset: 48, tokenType: { name: 'IRIREF' } },
                { image: '.', startOffset: 72, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('<http://example.org/s>');
            expect(result.output).toContain('<http://example.org/p>');
            expect(result.output).toContain('<http://example.org/o>');
            expect(result.output).toContain('.');
        });

        it('should serialize prefixed names', () => {
            const tokens: Token[] = [
                { image: 'ex:s', startOffset: 0, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 5, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 10, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 15, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('ex:s');
            expect(result.output).toContain('ex:p');
            expect(result.output).toContain('ex:o');
        });

        it('should serialize literals', () => {
            const tokens: Token[] = [
                { image: 'ex:s', startOffset: 0, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 5, tokenType: { name: 'PNAME_LN' } },
                { image: '"hello"', startOffset: 10, tokenType: { name: 'STRING_LITERAL_QUOTE' } },
                { image: '.', startOffset: 18, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('"hello"');
        });
    });

    describe('comment preservation', () => {
        it('should preserve comments by default', () => {
            const tokens: Token[] = [
                { image: '# This is a comment', startOffset: 0, tokenType: { name: 'COMMENT' } },
                { image: 'ex:s', startOffset: 21, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 26, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 31, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 36, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('# This is a comment');
            expect(result.output).toContain('ex:s');
            expect(result.output).toContain('ex:o');
        });

        it('should preserve inline comments', () => {
            const tokens: Token[] = [
                { image: 'ex:s', startOffset: 0, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 5, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 10, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 15, tokenType: { name: 'PERIOD' } },
                { image: '# Comment after triple', startOffset: 17, tokenType: { name: 'COMMENT' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('ex:s');
            expect(result.output).toContain('# Comment after triple');
        });

        it('should preserve multiple comments', () => {
            const tokens: Token[] = [
                { image: '# First comment', startOffset: 0, tokenType: { name: 'COMMENT' } },
                { image: 'ex:s1', startOffset: 17, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 23, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o1', startOffset: 28, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 34, tokenType: { name: 'PERIOD' } },
                { image: '# Second comment', startOffset: 37, tokenType: { name: 'COMMENT' } },
                { image: 'ex:s2', startOffset: 55, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 61, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o2', startOffset: 66, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 72, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('# First comment');
            expect(result.output).toContain('# Second comment');
        });

        it('should skip comments when preserveComments is false', () => {
            const tokens: Token[] = [
                { image: '# This comment should be removed', startOffset: 0, tokenType: { name: 'COMMENT' } },
                { image: 'ex:s', startOffset: 34, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 39, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 44, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 49, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens, { preserveComments: false });

            expect(result.output).not.toContain('# This comment should be removed');
            expect(result.output).toContain('ex:s');
        });

        it('should preserve comment content exactly', () => {
            const commentText = '# TODO: fix this later';
            const tokens: Token[] = [
                { image: commentText, startOffset: 0, tokenType: { name: 'COMMENT' } },
                { image: 'ex:s', startOffset: 25, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 30, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 35, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 40, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain(commentText);
        });
    });

    describe('blank node handling', () => {
        it('should preserve blank node labels', () => {
            const tokens: Token[] = [
                { image: '_:b0', startOffset: 0, tokenType: { name: 'BLANK_NODE_LABEL' } },
                { image: 'ex:p', startOffset: 5, tokenType: { name: 'PNAME_LN' } },
                { image: '"value"', startOffset: 10, tokenType: { name: 'STRING_LITERAL_QUOTE' } },
                { image: '.', startOffset: 18, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('_:b0');
            expect(result.output).toContain('"value"');
        });

        it('should serialize anonymous blank nodes', () => {
            const tokens: Token[] = [
                { image: '[', startOffset: 0, tokenType: { name: 'LBRACKET' } },
                { image: 'ex:p', startOffset: 2, tokenType: { name: 'PNAME_LN' } },
                { image: '"value"', startOffset: 7, tokenType: { name: 'STRING_LITERAL_QUOTE' } },
                { image: ']', startOffset: 15, tokenType: { name: 'RBRACKET' } },
                { image: '.', startOffset: 17, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens);

            expect(result.output).toContain('[');
            expect(result.output).toContain(']');
            expect(result.output).toContain('"value"');
        });
    });

    describe('serializeRange', () => {
        it('should serialize only tokens within the specified range', () => {
            const tokens: Token[] = [
                { image: 'ex:s1', startOffset: 0, endOffset: 4, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p1', startOffset: 6, endOffset: 10, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o1', startOffset: 12, endOffset: 16, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 18, endOffset: 18, tokenType: { name: 'PERIOD' } },
                { image: 'ex:s2', startOffset: 20, endOffset: 24, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p2', startOffset: 26, endOffset: 30, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o2', startOffset: 32, endOffset: 36, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 38, endOffset: 38, tokenType: { name: 'PERIOD' } }
            ];

            // Select only the second triple
            const result = serializer.serializeRange(tokens, 20, 38);

            expect(result.output).toContain('ex:s2');
            expect(result.output).toContain('ex:o2');
            expect(result.output).not.toContain('ex:s1');
        });
    });

    describe('source map generation', () => {
        it('should generate source map when prettyPrint is enabled', () => {
            const tokens: Token[] = [
                { image: 'ex:s', startOffset: 0, endOffset: 3, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 5, endOffset: 8, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 10, endOffset: 13, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 15, endOffset: 15, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens, { prettyPrint: true });

            expect(result.sourceMap).toBeDefined();
            expect(result.sourceMap!.length).toBe(4);
            
            // Check first token mapping
            expect(result.sourceMap![0].inputOffset).toBe(0);
            expect(result.sourceMap![0].type).toBe('prefixedName');
        });

        it('should not generate source map when prettyPrint is disabled', () => {
            const tokens: Token[] = [
                { image: 'ex:s', startOffset: 0, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:p', startOffset: 5, tokenType: { name: 'PNAME_LN' } },
                { image: 'ex:o', startOffset: 10, tokenType: { name: 'PNAME_LN' } },
                { image: '.', startOffset: 15, tokenType: { name: 'PERIOD' } }
            ];

            const result = serializer.serialize(tokens, { prettyPrint: false });

            expect(result.sourceMap).toBeUndefined();
        });
    });
});
