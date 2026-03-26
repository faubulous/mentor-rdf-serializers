import { describe, it, expect } from 'vitest';
import { findPrefix } from './prefixes';

describe('findPrefix', () => {
    const prefixes = {
        'ex': 'http://example.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    };

    it('should find a matching prefix', () => {
        expect(findPrefix('http://example.org/foo', prefixes)).toEqual({ prefix: 'ex', localName: 'foo' });
    });

    it('should find a matching prefix with hash namespace', () => {
        expect(findPrefix('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', prefixes)).toEqual({ prefix: 'rdf', localName: 'type' });
    });

    it('should return undefined when no prefix matches', () => {
        expect(findPrefix('http://other.org/foo', prefixes)).toBeUndefined();
    });

    it('should handle an empty local name', () => {
        expect(findPrefix('http://example.org/', prefixes)).toEqual({ prefix: 'ex', localName: '' });
    });

    it('should return undefined when local name is invalid', () => {
        // A local name ending with a dot is invalid
        expect(findPrefix('http://example.org/foo.', prefixes)).toBeUndefined();
    });

    it('should return undefined for empty prefixes', () => {
        expect(findPrefix('http://example.org/foo', {})).toBeUndefined();
    });
});
