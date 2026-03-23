import { describe, it, expect, beforeEach } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import {
    escapeIri,
    escapeString,
    escapeLocalName,
    findPrefix,
    isValidLocalName,
    parseLanguageTag,
    formatLanguageTag,
    groupQuadsBySubject,
    groupQuadsByGraph
} from './utils.js';

// Helper to get value from a term (safe cast since all test quads use NamedNode)
const termValue = (term: unknown) => (term as { value: string }).value;

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
});

describe('escapeString', () => {
    it('should not escape normal characters', () => {
        expect(escapeString('hello world')).toBe('hello world');
    });

    it('should escape quotes', () => {
        expect(escapeString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines', () => {
        expect(escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape tabs', () => {
        expect(escapeString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should preserve newlines in long strings', () => {
        expect(escapeString('line1\nline2', true)).toBe('line1\nline2');
    });

    it('should escape control characters', () => {
        expect(escapeString('hello\x00world')).toBe('hello\\u0000world');
    });
});

describe('escapeLocalName', () => {
    it('should not escape alphanumeric characters', () => {
        expect(escapeLocalName('foo123')).toBe('foo123');
    });

    it('should escape special characters', () => {
        expect(escapeLocalName('foo-bar')).toBe('foo\\-bar');
        expect(escapeLocalName('foo.bar')).toBe('foo\\.bar');
        expect(escapeLocalName('foo~bar')).toBe('foo\\~bar');
    });
});

describe('findPrefix', () => {
    const prefixes = {
        'ex': 'http://example.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    };

    it('should find matching prefix', () => {
        const result = findPrefix('http://example.org/foo', prefixes);
        expect(result).toEqual({ prefix: 'ex', localName: 'foo' });
    });

    it('should return undefined for no match', () => {
        const result = findPrefix('http://other.org/foo', prefixes);
        expect(result).toBeUndefined();
    });

    it('should handle empty local name', () => {
        const result = findPrefix('http://example.org/', prefixes);
        expect(result).toEqual({ prefix: 'ex', localName: '' });
    });
});

describe('isValidLocalName', () => {
    it('should accept valid local names', () => {
        expect(isValidLocalName('foo')).toBe(true);
        expect(isValidLocalName('Foo123')).toBe(true);
        expect(isValidLocalName('_foo')).toBe(true);
        expect(isValidLocalName('')).toBe(true);
    });

    it('should reject invalid local names', () => {
        expect(isValidLocalName('foo.')).toBe(false); // Cannot end with dot
    });
});

describe('parseLanguageTag', () => {
    it('should parse simple language tag', () => {
        expect(parseLanguageTag('en')).toEqual({ language: 'en' });
    });

    it('should parse language tag with region', () => {
        expect(parseLanguageTag('en-US')).toEqual({ language: 'en-US' });
    });

    it('should parse RDF 1.2 language tag with direction', () => {
        expect(parseLanguageTag('en--ltr')).toEqual({ language: 'en', direction: 'ltr' });
        expect(parseLanguageTag('ar--rtl')).toEqual({ language: 'ar', direction: 'rtl' });
    });

    it('should parse complex language tag with direction', () => {
        expect(parseLanguageTag('en-US--ltr')).toEqual({ language: 'en-US', direction: 'ltr' });
    });
});

describe('formatLanguageTag', () => {
    it('should format simple language tag', () => {
        expect(formatLanguageTag('en')).toBe('en');
    });

    it('should format language tag with direction', () => {
        expect(formatLanguageTag('en', 'ltr')).toBe('en--ltr');
        expect(formatLanguageTag('ar', 'rtl')).toBe('ar--rtl');
    });
});

describe('groupQuadsBySubject', () => {
    it('should group quads by subject', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o3'))
        ];

        const groups = groupQuadsBySubject(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('<http://example.org/s1>')!.length).toBe(2);
        expect(groups.get('<http://example.org/s2>')!.length).toBe(1);
    });
});

describe('groupQuadsByGraph', () => {
    it('should group quads by graph', () => {
        const quads = [
            DataFactory.quad(DataFactory.namedNode('http://example.org/s1'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o1')),
            DataFactory.quad(DataFactory.namedNode('http://example.org/s2'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('o2'), DataFactory.namedNode('http://example.org/g1'))
        ];

        const groups = groupQuadsByGraph(quads);

        expect(groups.size).toBe(2);
        expect(groups.get('')!.length).toBe(1); // Default graph
        expect(groups.get('<http://example.org/g1>')!.length).toBe(1);
    });
});
