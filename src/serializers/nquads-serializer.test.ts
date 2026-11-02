import { describe, expect, it } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { NQuadsSerializer } from './nquads-serializer';
import type { TripleTerm } from '../utilities/types';

describe('NQuadsSerializer', () => {
    const serializer = new NQuadsSerializer();

    it('serializes a quad with a named graph', () => {
        const quad = RdfDataFactory.quad(
            RdfDataFactory.namedNode('http://example.org/s'),
            RdfDataFactory.namedNode('http://example.org/p'),
            RdfDataFactory.namedNode('http://example.org/o'),
            RdfDataFactory.namedNode('http://example.org/g')
        );

        const output = serializer.serializeQuad(quad);

        expect(output).toBe('<http://example.org/s> <http://example.org/p> <http://example.org/o> <http://example.org/g> .');
    });

    it('serializes multiple quads with trailing line ending', () => {
        const quads = [
            RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/s1'),
                RdfDataFactory.namedNode('http://example.org/p'),
                RdfDataFactory.literal('x')
            ),
            RdfDataFactory.quad(
                RdfDataFactory.namedNode('http://example.org/s2'),
                RdfDataFactory.namedNode('http://example.org/p'),
                RdfDataFactory.namedNode('http://example.org/o2')
            )
        ];

        const output = serializer.serialize(quads, { lineEnd: '\n' });

        expect(output).toContain('<http://example.org/s1> <http://example.org/p> "x" .\n');
        expect(output).toContain('<http://example.org/s2> <http://example.org/p> <http://example.org/o2> .\n');
        expect(output.endsWith('\n')).toBe(true);
    });

    it('supports RDF 1.2 triple terms', () => {
        const tripleTerm: TripleTerm = {
            termType: 'TripleTerm',
            subject: RdfDataFactory.namedNode('http://example.org/ss'),
            predicate: RdfDataFactory.namedNode('http://example.org/pp'),
            object: RdfDataFactory.namedNode('http://example.org/oo'),
            equals: () => false
        };

        const quad = {
            subject: tripleTerm,
            predicate: RdfDataFactory.namedNode('http://example.org/p'),
            object: RdfDataFactory.literal('o'),
            graph: RdfDataFactory.defaultGraph(),
            equals: () => false
        };

        const output = serializer.serializeQuad(quad);

        expect(output).toContain('<<( <http://example.org/ss> <http://example.org/pp> <http://example.org/oo> )>>');
    });
});
