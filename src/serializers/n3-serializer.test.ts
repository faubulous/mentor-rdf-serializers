import { describe, expect, it } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { N3Serializer } from './n3-serializer';
import type { Formula, QuickVariable } from '../utilities/types';

describe('N3Serializer', () => {
    const serializer = new N3Serializer();

    it('uses => shorthand for log:implies by default', () => {
        const quad = DataFactory.quad(
            DataFactory.namedNode('http://example.org/s'),
            DataFactory.namedNode(N3Serializer.LOG_IMPLIES),
            DataFactory.namedNode('http://example.org/o')
        );

        const output = serializer.serializeQuad(quad);

        expect(output).toBe('<http://example.org/s> => <http://example.org/o> .');
    });

    it('uses = shorthand for owl:sameAs by default', () => {
        const quad = DataFactory.quad(
            DataFactory.namedNode('http://example.org/s'),
            DataFactory.namedNode(N3Serializer.OWL_SAMEAS),
            DataFactory.namedNode('http://example.org/o')
        );

        const output = serializer.serializeQuad(quad);

        expect(output).toBe('<http://example.org/s> = <http://example.org/o> .');
    });

    it('falls back to full predicate when shorthands are disabled', () => {
        const quad = DataFactory.quad(
            DataFactory.namedNode('http://example.org/s'),
            DataFactory.namedNode(N3Serializer.LOG_IMPLIES),
            DataFactory.namedNode('http://example.org/o')
        );

        const output = serializer.serializeQuad(quad, { useImpliesShorthand: false });

        expect(output).toContain(`<${N3Serializer.LOG_IMPLIES}>`);
    });

    it('serializes formula and quick variable terms', () => {
        const formula: Formula = {
            termType: 'Formula',
            value: '{}',
            quads: [
                DataFactory.quad(
                    DataFactory.namedNode('http://example.org/sf'),
                    DataFactory.namedNode('http://example.org/pf'),
                    DataFactory.namedNode('http://example.org/of')
                ) as any
            ],
            equals: () => false
        };

        const qv: QuickVariable = {
            termType: 'QuickVariable',
            value: 'x',
            equals: () => false
        };

        const quad = {
            subject: formula,
            predicate: DataFactory.namedNode('http://example.org/p'),
            object: qv,
            graph: DataFactory.defaultGraph(),
            equals: () => false
        };

        const output = serializer.serializeQuad(quad as any, { prettyPrint: true });

        expect(output).toContain('{');
        expect(output).toContain('~x');
    });
});
