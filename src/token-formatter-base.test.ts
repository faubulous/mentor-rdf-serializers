import { describe, it, expect } from 'vitest';
import { IToken, TokenType, RdfToken } from '@faubulous/mentor-rdf-parsers';
import { TokenFormatterBase, type BaseFormatterContext, type BaseFormatterOptions } from './token-formatter-base.js';

// Minimal concrete subclass that exposes protected methods for unit testing.
class TestFormatter extends TokenFormatterBase<BaseFormatterContext, BaseFormatterOptions> {
    protected getOptions(options?: BaseFormatterOptions): Required<BaseFormatterOptions> {
        return {
            ...this.mergeBaseOptions(options),
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
        };
    }

    protected createContext(_opts: Required<BaseFormatterOptions>): BaseFormatterContext {
        return this.createBaseContext();
    }

    public makeContext(): BaseFormatterContext {
        return this.createBaseContext();
    }

    public push(ctx: BaseFormatterContext, type: 'curly' | 'bracket' | 'paren', isInline: boolean, isMultiLine: boolean): void {
        this.pushScope(ctx, type, isInline, isMultiLine);
    }

    public pop(ctx: BaseFormatterContext) {
        return this.popScope(ctx);
    }

    public current(ctx: BaseFormatterContext) {
        return this.currentScope(ctx);
    }

    public inBracket(ctx: BaseFormatterContext): boolean {
        return this.inBracketScope(ctx);
    }

    public part(ctx: BaseFormatterContext, text: string, lineEnd: string): void {
        this.addPart(ctx, text, lineEnd);
    }

    public indent(level: number, ind: string): string {
        return this.getIndent(level, ind);
    }

    public wrap(ctx: BaseFormatterContext, nextLength: number, maxLineWidth: number): boolean {
        return this.shouldWrap(ctx, nextLength, maxLineWidth);
    }

    public stmtLength(tokens: IToken[], startIndex: number): number {
        return this.calculateStatementLength(tokens, startIndex);
    }

    public detectInline(ctx: BaseFormatterContext, tokens: IToken[], startIndex: number, indent: string, maxLineWidth: number): void {
        this.detectInlineStatement(ctx, tokens, startIndex, indent, maxLineWidth);
    }

    public parenMultiLine(tokens: IToken[], openIndex: number): boolean {
        return this.isParenBlockMultiLine(tokens, openIndex);
    }

    public openingBracket(token: IToken): boolean {
        return this.isOpeningBracket(token);
    }

    public closingBracket(token: IToken): boolean {
        return this.isClosingBracket(token);
    }

    public keyword(token: IToken): boolean {
        return this.isKeyword(token);
    }

    public termToken(token: IToken): boolean {
        return this.isTermToken(token);
    }
}

function tok(tokenType: TokenType, image: string, startLine?: number, endLine?: number): IToken {
    return { image, startOffset: 0, tokenType, startLine, endLine } as IToken;
}

describe('TokenFormatterBase', () => {
    const f = new TestFormatter();

    // ========================================================================
    // Scope management
    // ========================================================================

    describe('scope management', () => {
        it('pushScope increments indentLevel and adds an entry to the stack', () => {
            const ctx = f.makeContext();
            expect(ctx.indentLevel).toBe(0);

            f.push(ctx, 'paren', false, false);

            expect(ctx.indentLevel).toBe(1);
            expect(ctx.scopeStack).toHaveLength(1);
            expect(ctx.scopeStack[0].type).toBe('paren');
        });

        it('popScope restores indentLevel and removes the innermost scope', () => {
            const ctx = f.makeContext();
            f.push(ctx, 'bracket', false, false);
            expect(ctx.indentLevel).toBe(1);

            const popped = f.pop(ctx);

            expect(popped?.type).toBe('bracket');
            expect(ctx.indentLevel).toBe(0);
            expect(ctx.scopeStack).toHaveLength(0);
        });

        it('nested pushes and pops maintain the correct indentLevel', () => {
            const ctx = f.makeContext();
            f.push(ctx, 'curly', false, false);
            f.push(ctx, 'paren', false, false);
            expect(ctx.indentLevel).toBe(2);

            f.pop(ctx);
            expect(ctx.indentLevel).toBe(1);

            f.pop(ctx);
            expect(ctx.indentLevel).toBe(0);
        });

        it('currentScope returns the innermost scope', () => {
            const ctx = f.makeContext();
            expect(f.current(ctx)).toBeUndefined();

            f.push(ctx, 'curly', false, false);
            f.push(ctx, 'bracket', true, false);

            expect(f.current(ctx)?.type).toBe('bracket');
            expect(f.current(ctx)?.isInline).toBe(true);
        });

        it('popScope on an empty stack returns undefined and keeps indentLevel at 0', () => {
            const ctx = f.makeContext();

            const result = f.pop(ctx);

            expect(result).toBeUndefined();
            expect(ctx.indentLevel).toBe(0);
        });

        it('inBracketScope returns false when no bracket scope is on the stack', () => {
            const ctx = f.makeContext();
            f.push(ctx, 'paren', false, false);
            f.push(ctx, 'curly', false, false);

            expect(f.inBracket(ctx)).toBe(false);
        });

        it('inBracketScope returns true when any scope on the stack is a bracket', () => {
            const ctx = f.makeContext();
            f.push(ctx, 'paren', false, false);
            f.push(ctx, 'bracket', false, false);
            f.push(ctx, 'curly', false, false);

            expect(f.inBracket(ctx)).toBe(true);
        });
    });

    // ========================================================================
    // addPart / line length tracking
    // ========================================================================

    describe('addPart', () => {
        it('appends text to parts and accumulates currentLineLength', () => {
            const ctx = f.makeContext();
            f.part(ctx, 'hello', '\n');
            f.part(ctx, ' world', '\n');

            expect(ctx.parts.join('')).toBe('hello world');
            expect(ctx.currentLineLength).toBe(11);
        });

        it('resets currentLineLength to 0 after a bare newline part', () => {
            const ctx = f.makeContext();
            f.part(ctx, 'abc', '\n');
            f.part(ctx, '\n', '\n');
            f.part(ctx, 'de', '\n');

            expect(ctx.currentLineLength).toBe(2);
        });

        it('sets currentLineLength to the length of the last line when text spans multiple lines', () => {
            const ctx = f.makeContext();
            f.part(ctx, 'abc\ndefgh', '\n');

            expect(ctx.currentLineLength).toBe(5); // 'defgh'.length
        });

        it('accumulates across multiple calls without newlines', () => {
            const ctx = f.makeContext();
            f.part(ctx, 'ab', '\n');
            f.part(ctx, 'cd', '\n');
            f.part(ctx, 'ef', '\n');

            expect(ctx.currentLineLength).toBe(6);
        });
    });

    // ========================================================================
    // getIndent
    // ========================================================================

    describe('getIndent', () => {
        it('returns an empty string for indent level 0', () => {
            expect(f.indent(0, '  ')).toBe('');
        });

        it('returns exactly one indent unit for level 1', () => {
            expect(f.indent(1, '  ')).toBe('  ');
            expect(f.indent(1, '\t')).toBe('\t');
        });

        it('repeats the indent unit for higher levels', () => {
            expect(f.indent(3, '  ')).toBe('      ');
            expect(f.indent(2, '    ')).toBe('        ');
        });
    });

    // ========================================================================
    // shouldWrap
    // ========================================================================

    describe('shouldWrap', () => {
        it('always returns false when maxLineWidth is 0 (disabled)', () => {
            const ctx = f.makeContext();
            ctx.currentLineLength = 200;

            expect(f.wrap(ctx, 50, 0)).toBe(false);
        });

        it('returns false when content fits within maxLineWidth', () => {
            const ctx = f.makeContext();
            ctx.currentLineLength = 40;

            expect(f.wrap(ctx, 20, 80)).toBe(false);
        });

        it('returns false when content is exactly at the limit', () => {
            const ctx = f.makeContext();
            ctx.currentLineLength = 60;

            expect(f.wrap(ctx, 20, 80)).toBe(false);
        });

        it('returns true when content would exceed maxLineWidth', () => {
            const ctx = f.makeContext();
            ctx.currentLineLength = 70;

            expect(f.wrap(ctx, 20, 80)).toBe(true);
        });
    });

    // ========================================================================
    // calculateStatementLength
    // ========================================================================

    describe('calculateStatementLength', () => {
        it('returns a positive length for a simple inline statement', () => {
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:o', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            // 'ex:s' + 'ex:p' + 'ex:o' + '.' = 13 chars + 2 spaces = 15
            expect(f.stmtLength(tokens, 0)).toBe(15);
        });

        it('returns -1 when a comment appears in the statement', () => {
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.COMMENT, '# note', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:o', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            expect(f.stmtLength(tokens, 0)).toBe(-1);
        });

        it('returns -1 when tokens span multiple source lines', () => {
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 2, 2),   // line break between s and p
                tok(RdfToken.PNAME_LN, 'ex:o', 2, 2),
                tok(RdfToken.PERIOD, '.', 2, 2),
            ];

            expect(f.stmtLength(tokens, 0)).toBe(-1);
        });

        it('ignores WS tokens and produces the same result as without them', () => {
            const withWs: IToken[] = [
                tok(RdfToken.PNAME_LN, 'a', 1, 1),
                tok(RdfToken.WS, ' ', 1, 1),
                tok(RdfToken.PNAME_LN, 'b', 1, 1),
                tok(RdfToken.WS, ' ', 1, 1),
                tok(RdfToken.PNAME_LN, 'c', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            const withoutWs: IToken[] = [
                tok(RdfToken.PNAME_LN, 'a', 1, 1),
                tok(RdfToken.PNAME_LN, 'b', 1, 1),
                tok(RdfToken.PNAME_LN, 'c', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            expect(f.stmtLength(withWs, 0)).toBe(f.stmtLength(withoutWs, 0));
        });

        it('stops and returns accumulated length when an enclosing closing bracket is encountered', () => {
            // Simulates a scan that starts inside an outer block.
            // The ] belongs to the enclosing scope, not a nested one.
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:p', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:o', 1, 1),
                tok(RdfToken.RBRACKET, ']', 1, 1),
            ];

            // 'ex:p' (4) + 'ex:o' (4) + ']' closes enclosure → return 4+4 + max(0, 2-1) = 9
            expect(f.stmtLength(tokens, 0)).toBe(9);
        });

        it('respects startIndex and ignores tokens before it', () => {
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'prefix:ignored', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:o', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            // Start from index 1 (skip 'prefix:ignored')
            const fromIndex1 = f.stmtLength(tokens, 1);
            // Result should be the same as for just the last 4 tokens
            const fromShorter = f.stmtLength(tokens.slice(1), 0);

            expect(fromIndex1).toBe(fromShorter);
        });
    });

    // ========================================================================
    // detectInlineStatement
    // ========================================================================

    describe('detectInlineStatement', () => {
        it('sets inlineStatement to false when source had line breaks (multi-line)', () => {
            const ctx = f.makeContext();
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 2, 2),
                tok(RdfToken.PNAME_LN, 'ex:o', 2, 2),
                tok(RdfToken.PERIOD, '.', 2, 2),
            ];

            f.detectInline(ctx, tokens, 0, '  ', 120);

            expect(ctx.inlineStatement).toBe(false);
        });

        it('sets inlineStatement to true when maxLineWidth is 0 and source is inline', () => {
            const ctx = f.makeContext();
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ex:s', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:p', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:o', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            f.detectInline(ctx, tokens, 0, '  ', 0);

            expect(ctx.inlineStatement).toBe(true);
        });

        it('sets inlineStatement to true when statement fits within maxLineWidth', () => {
            const ctx = f.makeContext();
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'a', 1, 1),
                tok(RdfToken.PNAME_LN, 'b', 1, 1),
                tok(RdfToken.PNAME_LN, 'c', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            f.detectInline(ctx, tokens, 0, '  ', 120);

            expect(ctx.inlineStatement).toBe(true);
        });

        it('sets inlineStatement to false when statement exceeds maxLineWidth', () => {
            const ctx = f.makeContext();
            const longImage = 'x'.repeat(50);
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, longImage, 1, 1),
                tok(RdfToken.PNAME_LN, longImage, 1, 1),
                tok(RdfToken.PNAME_LN, longImage, 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            f.detectInline(ctx, tokens, 0, '  ', 40);

            expect(ctx.inlineStatement).toBe(false);
        });

        it('accounts for the current indentLevel when checking maxLineWidth', () => {
            const ctx = f.makeContext();
            ctx.indentLevel = 5; // 5 * 2 = 10 chars of indent

            // Statement length: 'ab' + 'cd' + 'ef' + '.' = 8 + 2 spaces = 10
            // With 10 chars of indent: 10 + 10 = 20, which fits in 30
            const tokens: IToken[] = [
                tok(RdfToken.PNAME_LN, 'ab', 1, 1),
                tok(RdfToken.PNAME_LN, 'cd', 1, 1),
                tok(RdfToken.PNAME_LN, 'ef', 1, 1),
                tok(RdfToken.PERIOD, '.', 1, 1),
            ];

            f.detectInline(ctx, tokens, 0, '  ', 30);

            expect(ctx.inlineStatement).toBe(true);
        });
    });

    // ========================================================================
    // isParenBlockMultiLine
    // ========================================================================

    describe('isParenBlockMultiLine', () => {
        it('returns false when the closing paren is on the same line', () => {
            const tokens: IToken[] = [
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:x', 1, 1),
                tok(RdfToken.RPARENT, ')', 1, 1),
            ];

            expect(f.parenMultiLine(tokens, 0)).toBe(false);
        });

        it('returns true when the closing paren is on a later line', () => {
            const tokens: IToken[] = [
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:x', 2, 2),
                tok(RdfToken.RPARENT, ')', 3, 3),
            ];

            expect(f.parenMultiLine(tokens, 0)).toBe(true);
        });

        it('handles nested parens correctly and matches the outermost close', () => {
            const tokens: IToken[] = [
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.RPARENT, ')', 1, 1), // closes inner — same line
                tok(RdfToken.RPARENT, ')', 1, 1), // closes outer — same line
            ];

            expect(f.parenMultiLine(tokens, 0)).toBe(false);
        });

        it('skips WS tokens when scanning for the matching close paren', () => {
            const tokens: IToken[] = [
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.WS, ' ', 1, 1),
                tok(RdfToken.RPARENT, ')', 1, 1),
            ];

            expect(f.parenMultiLine(tokens, 0)).toBe(false);
        });

        it('returns false when no closing paren is found', () => {
            const tokens: IToken[] = [
                tok(RdfToken.LPARENT, '(', 1, 1),
                tok(RdfToken.PNAME_LN, 'ex:x', 1, 1),
                // no closing paren
            ];

            expect(f.parenMultiLine(tokens, 0)).toBe(false);
        });
    });

    // ========================================================================
    // isOpeningBracket / isClosingBracket
    // ========================================================================

    describe('isOpeningBracket and isClosingBracket', () => {
        it('identifies all opening bracket token types', () => {
            expect(f.openingBracket(tok(RdfToken.LBRACKET, '['))).toBe(true);
            expect(f.openingBracket(tok(RdfToken.LPARENT, '('))).toBe(true);
            expect(f.openingBracket(tok(RdfToken.OPEN_ANNOTATION, '{|'))).toBe(true);
            expect(f.openingBracket(tok(RdfToken.OPEN_REIFIED_TRIPLE, '<<'))).toBe(true);
            expect(f.openingBracket(tok(RdfToken.OPEN_TRIPLE_TERM, '<<('))).toBe(true);
        });

        it('identifies all closing bracket token types', () => {
            expect(f.closingBracket(tok(RdfToken.RBRACKET, ']'))).toBe(true);
            expect(f.closingBracket(tok(RdfToken.RPARENT, ')'))).toBe(true);
            expect(f.closingBracket(tok(RdfToken.CLOSE_ANNOTATION, '|}'))).toBe(true);
            expect(f.closingBracket(tok(RdfToken.CLOSE_REIFIED_TRIPLE, '>>'))).toBe(true);
            expect(f.closingBracket(tok(RdfToken.CLOSE_TRIPLE_TERM, ')>>'))).toBe(true);
        });

        it('does not classify punctuation or IRIs as brackets', () => {
            expect(f.openingBracket(tok(RdfToken.PERIOD, '.'))).toBe(false);
            expect(f.openingBracket(tok(RdfToken.IRIREF, '<x>'))).toBe(false);
            expect(f.closingBracket(tok(RdfToken.PERIOD, '.'))).toBe(false);
            expect(f.closingBracket(tok(RdfToken.IRIREF, '<x>'))).toBe(false);
        });

        it('opening and closing types are mutually exclusive', () => {
            const openTokens = [RdfToken.LBRACKET, RdfToken.LPARENT];
            const closeTokens = [RdfToken.RBRACKET, RdfToken.RPARENT];

            for (const tokenType of openTokens) {
                expect(f.closingBracket(tok(tokenType, ''))).toBe(false);
            }

            for (const tokenType of closeTokens) {
                expect(f.openingBracket(tok(tokenType, ''))).toBe(false);
            }
        });
    });

    // ========================================================================
    // isKeyword / isTermToken (TokenMetadata flag helpers)
    // ========================================================================

    describe('isKeyword and isTermToken', () => {
        it('isKeyword returns true when tokenType has isKeyword: true', () => {
            const keywordToken = tok({ name: 'KW', isKeyword: true } as TokenType, 'SELECT');
            const plainToken = tok(RdfToken.IRIREF, '<x>');

            expect(f.keyword(keywordToken)).toBe(true);
            expect(f.keyword(plainToken)).toBe(false);
        });

        it('isTermToken returns true when tokenType has isTerm: true', () => {
            const termToken = tok({ name: 'TERM', isTerm: true } as TokenType, '<x>');
            const punctToken = tok(RdfToken.PERIOD, '.');

            expect(f.termToken(termToken)).toBe(true);
            expect(f.termToken(punctToken)).toBe(false);
        });

        it('isKeyword returns false when isKeyword is absent or false', () => {
            const noFlag = tok({ name: 'PLAIN' } as TokenType, 'word');
            const falseFlag = tok({ name: 'NOTKEY', isKeyword: false } as TokenType, 'word');

            expect(f.keyword(noFlag)).toBe(false);
            expect(f.keyword(falseFlag)).toBe(false);
        });
    });
});
