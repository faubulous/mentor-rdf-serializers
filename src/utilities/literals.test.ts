import { describe, it, expect } from 'vitest';
import { needsLongString, isInteger, isDecimal, isDouble } from './literals';

describe('needsLongString', () => {
    it('should return false for a plain string', () => {
        expect(needsLongString('hello world')).toBe(false);
    });

    it('should return true for a string containing a newline', () => {
        expect(needsLongString('line1\nline2')).toBe(true);
    });

    it('should return true for a string containing a carriage return', () => {
        expect(needsLongString('line1\rline2')).toBe(true);
    });

    it('should return true for a string containing triple quotes', () => {
        expect(needsLongString('foo"""bar')).toBe(true);
    });

    it('should return false for a short string with a single quote', () => {
        expect(needsLongString('"short"')).toBe(false);
    });

    it('should return true for a long string (>60 chars) with a quote', () => {
        expect(needsLongString('"' + 'a'.repeat(60))).toBe(true);
    });

    it('should return false for an empty string', () => {
        expect(needsLongString('')).toBe(false);
    });
});

describe('isInteger', () => {
    it('should return true for a positive integer', () => {
        expect(isInteger('42')).toBe(true);
    });

    it('should return true for zero', () => {
        expect(isInteger('0')).toBe(true);
    });

    it('should return true for a negative integer', () => {
        expect(isInteger('-42')).toBe(true);
    });

    it('should return true for an integer with explicit + sign', () => {
        expect(isInteger('+42')).toBe(true);
    });

    it('should return false for a decimal', () => {
        expect(isInteger('3.14')).toBe(false);
    });

    it('should return false for a double', () => {
        expect(isInteger('1e5')).toBe(false);
    });

    it('should return false for non-numeric string', () => {
        expect(isInteger('abc')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(isInteger('')).toBe(false);
    });
});

describe('isDecimal', () => {
    it('should return true for a positive decimal', () => {
        expect(isDecimal('3.14')).toBe(true);
    });

    it('should return true for a negative decimal', () => {
        expect(isDecimal('-3.14')).toBe(true);
    });

    it('should return true for a decimal with explicit + sign', () => {
        expect(isDecimal('+3.14')).toBe(true);
    });

    it('should return true for a value starting with a dot', () => {
        expect(isDecimal('.5')).toBe(true);
    });

    it('should return true for 0.0', () => {
        expect(isDecimal('0.0')).toBe(true);
    });

    it('should return false for an integer', () => {
        expect(isDecimal('42')).toBe(false);
    });

    it('should return false for a double (has exponent)', () => {
        expect(isDecimal('3.14e5')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(isDecimal('')).toBe(false);
    });
});

describe('isDouble', () => {
    it('should return true for integer with exponent', () => {
        expect(isDouble('1e5')).toBe(true);
    });

    it('should return true for decimal with exponent', () => {
        expect(isDouble('1.5e5')).toBe(true);
    });

    it('should return true for negative value with negative exponent', () => {
        expect(isDouble('-1.5e-5')).toBe(true);
    });

    it('should return true for uppercase E', () => {
        expect(isDouble('1.5E5')).toBe(true);
    });

    it('should return true for explicit + sign and exponent', () => {
        expect(isDouble('+1.5E+5')).toBe(true);
    });

    it('should return true for value starting with a dot', () => {
        expect(isDouble('.5e5')).toBe(true);
    });

    it('should return false for an integer', () => {
        expect(isDouble('42')).toBe(false);
    });

    it('should return false for a decimal without exponent', () => {
        expect(isDouble('3.14')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(isDouble('')).toBe(false);
    });
});
