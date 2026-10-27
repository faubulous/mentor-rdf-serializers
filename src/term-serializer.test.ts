import { describe, expect, it } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { RdfSyntax } from '@faubulous/mentor-rdf-parsers';
import { RDF, XSD } from './ontologies';
import { TermSerializer, TermSerializerOptions } from './term-serializer';

const EX = 'http://example.org/';
const { namedNode, blankNode, literal } = DataFactory;

/**
 * A serializer for a Turtle document that declares the ex and xsd prefixes.
 */
function turtle(options: TermSerializerOptions = {}): TermSerializer {
    return TermSerializer.forSyntax(RdfSyntax.Turtle, { prefixes: { ex: EX, xsd: XSD.string.replace('string', '') }, ...options });
}

describe('TermSerializer', () => {
    describe('named nodes', () => {
        it('writes a prefixed name where a prefix is declared', () => {
            expect(turtle().serializeNamedNode(namedNode(`${EX}a`))).toBe('ex:a');
            expect(turtle().serializeObject(namedNode(`${EX}a`))).toBe('ex:a');
        });

        it('writes an IRI reference where no prefix matches', () => {
            expect(turtle().serializeNamedNode(namedNode('http://other.org/x'))).toBe('<http://other.org/x>');
        });

        it('writes IRI references in N-Triples, which has no prefixes', () => {
            const serializer = TermSerializer.forSyntax(RdfSyntax.NTriples, { prefixes: { ex: EX } });

            expect(serializer.abbreviates).toBe(false);
            expect(serializer.serializeNamedNode(namedNode(`${EX}a`))).toBe(`<${EX}a>`);
        });

        it('escapes the local name of a prefixed name', () => {
            expect(turtle().serializeNamedNode(namedNode(`${EX}a/b`))).toBe('ex:a\\/b');
        });
    });

    describe('predicates', () => {
        it('writes rdf:type as a in predicate position only', () => {
            const serializer = turtle({ prefixes: { ex: EX, rdf: RDF.type.replace('type', '') } });

            expect(serializer.serializePredicate(namedNode(RDF.type))).toBe('a');
            expect(serializer.serializeObject(namedNode(RDF.type))).toBe('rdf:type');
            expect(serializer.serializeSubject(namedNode(RDF.type))).toBe('rdf:type');
        });

        it('writes rdf:type as a name when the shorthand is off', () => {
            const serializer = turtle({ prefixes: { rdf: RDF.type.replace('type', '') }, useRdfTypeShorthand: false });

            expect(serializer.serializePredicate(namedNode(RDF.type))).toBe('rdf:type');
        });

        it('never writes a in N-Triples', () => {
            expect(TermSerializer.forSyntax(RdfSyntax.NTriples).serializePredicate(namedNode(RDF.type))).toBe(`<${RDF.type}>`);
        });
    });

    describe('blank nodes', () => {
        it('writes the label a document uses for a blank node', () => {
            expect(turtle({ blankNodeLabels: { b1: '_:thing' } }).serializeObject(blankNode('b1'))).toBe('_:thing');
        });

        it('writes a blank node without a label by its normalized identifier', () => {
            expect(turtle().serializeBlankNode(blankNode('b1'))).toBe('_:b1');
        });
    });

    describe('literals', () => {
        it('writes plain strings quoted', () => {
            expect(turtle().serializeLiteral(literal('Tree'))).toBe('"Tree"');
        });

        it('writes language tags and datatypes', () => {
            expect(turtle().serializeLiteral(literal('Tree', 'en'))).toBe('"Tree"@en');
            expect(turtle().serializeLiteral(literal('x', namedNode(`${EX}T`)))).toBe('"x"^^ex:T');
        });

        it('writes numbers and booleans bare where the syntax allows', () => {
            expect(turtle().serializeLiteral(literal('42', namedNode(XSD.integer)))).toBe('42');
            expect(turtle().serializeLiteral(literal('4.2', namedNode(XSD.decimal)))).toBe('4.2');
            expect(turtle().serializeLiteral(literal('4.2E1', namedNode(XSD.double)))).toBe('4.2E1');
            expect(turtle().serializeLiteral(literal('true', namedNode(XSD.boolean)))).toBe('true');
            expect(turtle().serializeLiteral(literal('0', namedNode(XSD.boolean)))).toBe('false');
        });

        it('quotes a number whose value is not a valid lexical form', () => {
            expect(turtle().serializeLiteral(literal('abc', namedNode(XSD.integer)))).toBe('"abc"^^xsd:integer');
        });

        it('writes typed literals in full in N-Triples', () => {
            const serializer = TermSerializer.forSyntax(RdfSyntax.NTriples);

            expect(serializer.serializeLiteral(literal('42', namedNode(XSD.integer)))).toBe(`"42"^^<${XSD.integer}>`);
            expect(serializer.serializeLiteral(literal('one\ntwo'))).toBe('"one\\ntwo"');
        });

        it('escapes quotes and uses long strings for line breaks', () => {
            expect(turtle().serializeLiteral(literal('a "b"'))).toBe('"a \\"b\\""');
            expect(turtle().serializeLiteral(literal('one\ntwo'))).toBe('"""one\ntwo"""');
        });
    });

    describe('subjects', () => {
        it('rejects a literal as subject', () => {
            expect(() => turtle().serializeSubject(literal('x'))).toThrow();
        });

        it('writes an IRI subject like an object', () => {
            expect(turtle().serializeSubject(namedNode(`${EX}s`))).toBe('ex:s');
        });
    });
});
