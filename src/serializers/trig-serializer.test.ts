import { describe, expect, it } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { TrigSerializer } from './trig-serializer';
import type { Rdf12Quad } from '../utilities/types';

describe('TrigSerializer', () => {
    const serializer = new TrigSerializer();

    it('serializes default and named graph content', () => {
        const quads = [
            DataFactory.quad(
                DataFactory.namedNode('http://example.org/s'),
                DataFactory.namedNode('http://example.org/p'),
                DataFactory.namedNode('http://example.org/o')
            ),
            DataFactory.quad(
                DataFactory.namedNode('http://example.org/s2'),
                DataFactory.namedNode('http://example.org/p2'),
                DataFactory.namedNode('http://example.org/o2'),
                DataFactory.namedNode('http://example.org/g')
            )
        ];

        const output = serializer.serialize(quads, {
            prefixes: { ex: 'http://example.org/' },
            lineEnd: '\n'
        });

        expect(output).toContain('ex:s ex:p ex:o .');
        expect(output).toContain('ex:g {');
        expect(output).toContain('ex:s2 ex:p2 ex:o2 .');
    });

    it('serializes compact named graph output when prettyPrint is disabled', () => {
        const quads = [
            DataFactory.quad(
                DataFactory.namedNode('http://example.org/s'),
                DataFactory.namedNode('http://example.org/p'),
                DataFactory.namedNode('http://example.org/o'),
                DataFactory.namedNode('http://example.org/g')
            )
        ];

        const output = serializer.serialize(quads, {
            prettyPrint: false,
            emitDirectives: false
        });

        expect(output).toBe('<http://example.org/g> { <http://example.org/s> <http://example.org/p> <http://example.org/o> . }\n');
    });

    it('serializes RDF 1.2 annotations in graph content', () => {
        const annotation: Rdf12Quad = {
            subject: DataFactory.namedNode('http://example.org/reif'),
            predicate: DataFactory.namedNode('http://example.org/source'),
            object: DataFactory.literal('test-suite'),
            graph: DataFactory.defaultGraph(),
            equals: () => false
        };

        const quad: Rdf12Quad = {
            subject: DataFactory.namedNode('http://example.org/s'),
            predicate: DataFactory.namedNode('http://example.org/p'),
            object: DataFactory.namedNode('http://example.org/o'),
            graph: DataFactory.namedNode('http://example.org/g'),
            annotations: [annotation],
            equals: () => false
        };

        const output = serializer.serialize([quad], {
            prefixes: { ex: 'http://example.org/' }
        });

        expect(output).toContain('{| ex:source "test-suite" |}');
    });
});
