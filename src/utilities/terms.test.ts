import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { isTripleTerm, isReifier, termToString, parseLanguageTag, formatLanguageTag } from './terms';
import type { TripleTerm, Reifier } from './types';

describe('isTripleTerm', () => {
    it('should return true for a triple term', () => {
        const tripleTerm: TripleTerm = {
            termType: 'TripleTerm',
            subject: DataFactory.namedNode('http://example.org/s'),
            predicate: DataFactory.namedNode('http://example.org/p'),
            object: DataFactory.namedNode('http://example.org/o'),
            equals: () => false
        };
        expect(isTripleTerm(tripleTerm)).toBe(true);
    });

    it('should return false for a named node', () => {
        expect(isTripleTerm(DataFactory.namedNode('http://example.org/s'))).toBe(false);
    });

    it('should return false for a blank node', () => {
        expect(isTripleTerm(DataFactory.blankNode('b0'))).toBe(false);
    });

    it('should return false for a literal', () => {
        expect(isTripleTerm(DataFactory.literal('hello'))).toBe(false);
    });

    it('should return false for null', () => {
        expect(isTripleTerm(null as any)).toBe(false);
    });
});

describe('isReifier', () => {
    it('should return true for a reifier', () => {
        const reifier: Reifier = {
            termType: 'Reifier',
            id: DataFactory.namedNode('http://example.org/r'),
            triple: {
                subject: DataFactory.namedNode('http://example.org/s'),
                predicate: DataFactory.namedNode('http://example.org/p'),
                object: DataFactory.namedNode('http://example.org/o')
            },
            equals: () => false
        };
        expect(isReifier(reifier)).toBe(true);
    });

    it('should return false for a named node', () => {
        expect(isReifier(DataFactory.namedNode('http://example.org/s'))).toBe(false);
    });

    it('should return false for a blank node', () => {
        expect(isReifier(DataFactory.blankNode('b0'))).toBe(false);
    });

    it('should return false for null', () => {
        expect(isReifier(null as any)).toBe(false);
    });
});

describe('termToString', () => {
    it('should return empty string for null', () => {
        expect(termToString(null as any)).toBe('');
    });

    it('should format a named node', () => {
        expect(termToString(DataFactory.namedNode('http://example.org/foo'))).toBe('<http://example.org/foo>');
    });

    it('should format a blank node', () => {
        expect(termToString(DataFactory.blankNode('b0'))).toBe('_:b0');
    });

    it('should format a plain literal', () => {
        const result = termToString(DataFactory.literal('hello'));
        expect(result).toContain('"hello"');
    });

    it('should format a language-tagged literal', () => {
        const result = termToString(DataFactory.literal('hello', 'en'));
        expect(result).toContain('"hello"');
        expect(result).toContain('@en');
    });

    it('should format a datatyped literal', () => {
        const result = termToString(DataFactory.literal('42', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer')));
        expect(result).toContain('"42"');
        expect(result).toContain('http://www.w3.org/2001/XMLSchema#integer');
    });

    it('should format a variable', () => {
        expect(termToString(DataFactory.variable('x'))).toBe('?x');
    });

    it('should format the default graph', () => {
        expect(termToString(DataFactory.defaultGraph())).toBe('');
    });

    it('should format a triple term', () => {
        const tripleTerm: TripleTerm = {
            termType: 'TripleTerm',
            subject: DataFactory.namedNode('http://example.org/s'),
            predicate: DataFactory.namedNode('http://example.org/p'),
            object: DataFactory.namedNode('http://example.org/o'),
            equals: () => false
        };
        expect(termToString(tripleTerm)).toBe('<<(<http://example.org/s> <http://example.org/p> <http://example.org/o>)>>');
    });

    it('should format a nested triple term', () => {
        const inner: TripleTerm = {
            termType: 'TripleTerm',
            subject: DataFactory.namedNode('http://example.org/s'),
            predicate: DataFactory.namedNode('http://example.org/p'),
            object: DataFactory.namedNode('http://example.org/o'),
            equals: () => false
        };
        const outer: TripleTerm = {
            termType: 'TripleTerm',
            subject: inner,
            predicate: DataFactory.namedNode('http://example.org/p2'),
            object: DataFactory.namedNode('http://example.org/o2'),
            equals: () => false
        };
        const result = termToString(outer);
        expect(result).toContain('<<(');
        expect(result).toContain('<<(<http://example.org/s>');
    });
});

describe('parseLanguageTag', () => {
    it('should parse a simple language tag', () => {
        expect(parseLanguageTag('en')).toEqual({ language: 'en' });
    });

    it('should parse a language tag with region', () => {
        expect(parseLanguageTag('en-US')).toEqual({ language: 'en-US' });
    });

    it('should parse an RDF 1.2 language tag with ltr direction', () => {
        expect(parseLanguageTag('en--ltr')).toEqual({ language: 'en', direction: 'ltr' });
    });

    it('should parse an RDF 1.2 language tag with rtl direction', () => {
        expect(parseLanguageTag('ar--rtl')).toEqual({ language: 'ar', direction: 'rtl' });
    });

    it('should parse a language tag with region and direction', () => {
        expect(parseLanguageTag('en-US--ltr')).toEqual({ language: 'en-US', direction: 'ltr' });
    });
});

describe('formatLanguageTag', () => {
    it('should format a simple language tag', () => {
        expect(formatLanguageTag('en')).toBe('en');
    });

    it('should format a language tag with ltr direction', () => {
        expect(formatLanguageTag('en', 'ltr')).toBe('en--ltr');
    });

    it('should format a language tag with rtl direction', () => {
        expect(formatLanguageTag('ar', 'rtl')).toBe('ar--rtl');
    });

    it('should omit direction when undefined', () => {
        expect(formatLanguageTag('en', undefined)).toBe('en');
    });
});
