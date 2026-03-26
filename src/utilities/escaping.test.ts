import { describe, it, expect } from 'vitest';
import { escapeIri, escapeString, escapeLocalName, isValidLocalName } from './escaping';

describe('escapeIri', () => {
    it('should not escape normal characters', () => {
        expect(escapeIri('http://example.org/foo')).toBe('http://example.org/foo');
    });

    it('should escape < and >', () => {
        expect(escapeIri('http://example.org/<foo>')).toBe('http://example.org/\\u003Cfoo\\u003E');
    });

    it('should escape control characters', () => {
        expect(escapeIri('http://example.org/\t')).toBe('http://example.org/\\u0009');
    });

    it('should escape backslash', () => {
        expect(escapeIri('http://example.org/foo\\bar')).toBe('http://example.org/foo\\u005Cbar');
    });

    it('should escape double quote', () => {
        expect(escapeIri('http://example.org/"foo"')).toBe('http://example.org/\\u0022foo\\u0022');
    });

    it('should escape curly braces', () => {
        expect(escapeIri('http://example.org/{foo}')).toBe('http://example.org/\\u007Bfoo\\u007D');
    });

    it('should escape pipe', () => {
        expect(escapeIri('http://example.org/foo|bar')).toBe('http://example.org/foo\\u007Cbar');
    });

    it('should escape caret', () => {
        expect(escapeIri('http://example.org/foo^bar')).toBe('http://example.org/foo\\u005Ebar');
    });

    it('should escape backtick', () => {
        expect(escapeIri('http://example.org/foo`bar')).toBe('http://example.org/foo\\u0060bar');
    });

    it('should not escape an empty string', () => {
        expect(escapeIri('')).toBe('');
    });
});

describe('escapeString', () => {
    it('should not escape normal characters', () => {
        expect(escapeString('hello world')).toBe('hello world');
    });

    it('should escape double quotes', () => {
        expect(escapeString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines', () => {
        expect(escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape tabs', () => {
        expect(escapeString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should escape carriage returns', () => {
        expect(escapeString('line1\rline2')).toBe('line1\\rline2');
    });

    it('should escape backspace', () => {
        expect(escapeString('foo\bbar')).toBe('foo\\bbar');
    });

    it('should escape form feed', () => {
        expect(escapeString('foo\fbar')).toBe('foo\\fbar');
    });

    it('should escape backslash', () => {
        expect(escapeString('foo\\bar')).toBe('foo\\\\bar');
    });

    it('should not escape single quotes', () => {
        expect(escapeString("it's fine")).toBe("it's fine");
    });

    it('should escape control characters', () => {
        expect(escapeString('hello\x00world')).toBe('hello\\u0000world');
    });

    it('should preserve newlines in long strings', () => {
        expect(escapeString('line1\nline2', true)).toBe('line1\nline2');
    });

    it('should preserve carriage returns in long strings', () => {
        expect(escapeString('line1\rline2', true)).toBe('line1\rline2');
    });

    it('should escape triple quotes in long strings', () => {
        expect(escapeString('foo"""bar', true)).toBe('foo\\"""bar');
    });

    it('should not escape a single quote in long strings', () => {
        expect(escapeString('foo"bar', true)).toBe('foo"bar');
    });

    it('should not escape two quotes in long strings', () => {
        expect(escapeString('foo""bar', true)).toBe('foo""bar');
    });

    it('should not escape an empty string', () => {
        expect(escapeString('')).toBe('');
    });
});

describe('escapeLocalName', () => {
    it('should not escape alphanumeric characters', () => {
        expect(escapeLocalName('foo123')).toBe('foo123');
    });

    it('should escape hyphen', () => {
        expect(escapeLocalName('foo-bar')).toBe('foo\\-bar');
    });

    it('should escape dot', () => {
        expect(escapeLocalName('foo.bar')).toBe('foo\\.bar');
    });

    it('should escape tilde', () => {
        expect(escapeLocalName('foo~bar')).toBe('foo\\~bar');
    });

    it('should escape all special characters', () => {
        expect(escapeLocalName('_~.-!$&\'()*+,;=/?#@%')).toBe('\\_\\~\\.\\-\\!\\$\\&\\\'\\(\\)\\*\\+\\,\\;\\=\\/\\?\\#\\@\\%');
    });

    it('should not escape an empty string', () => {
        expect(escapeLocalName('')).toBe('');
    });
});

describe('isValidLocalName', () => {
    it('should accept empty string', () => {
        expect(isValidLocalName('')).toBe(true);
    });

    it('should accept lowercase letters', () => {
        expect(isValidLocalName('foo')).toBe(true);
    });

    it('should accept uppercase letters', () => {
        expect(isValidLocalName('Foo123')).toBe(true);
    });

    it('should accept underscore prefix', () => {
        expect(isValidLocalName('_foo')).toBe(true);
    });

    it('should accept digits', () => {
        expect(isValidLocalName('42')).toBe(true);
    });

    it('should accept colon', () => {
        expect(isValidLocalName('foo:bar')).toBe(true);
    });

    it('should accept hyphen in middle', () => {
        expect(isValidLocalName('foo-bar')).toBe(true);
    });

    it('should accept dot in middle', () => {
        expect(isValidLocalName('foo.bar')).toBe(true);
    });

    it('should reject local name ending with dot', () => {
        expect(isValidLocalName('foo.')).toBe(false);
    });
});
