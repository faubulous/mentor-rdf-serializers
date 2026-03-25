import type { BlankNode, DefaultGraph, Literal, NamedNode, Quad, Term, Variable } from '@rdfjs/types';

/**
 * Enumerates the RDF syntaxes supported by the Mentor RDF Serializers library.
 */
export enum RdfSyntax {
    N3 = 'n3',
    NTriples = 'ntriples',
    NQuads = 'nquads',
    Turtle = 'turtle',
    TriG = 'trig',
    JsonLd = 'jsonld',
    Sparql = 'sparql'
}

/**
 * RDF 1.2 Triple Term - a quoted triple that can be used as subject or object.
 * Syntax: <<( subject predicate object )>>
 */
export interface TripleTerm {
    termType: 'TripleTerm';
    subject: NamedNode | BlankNode | TripleTerm;
    predicate: NamedNode;
    object: NamedNode | BlankNode | Literal | TripleTerm;
    equals(other: Term | null | undefined): boolean;
}

/**
 * RDF 1.2 Reifier - a blank node or named node that reifies a triple.
 * Syntax: << subject predicate object >> or << subject predicate object ~ reifierId >>
 */
export interface Reifier {
    termType: 'Reifier';
    /** The reifier identifier (blank node or named node) */
    id: NamedNode | BlankNode;
    /** The reified triple */
    triple: {
        subject: NamedNode | BlankNode | TripleTerm;
        predicate: NamedNode;
        object: NamedNode | BlankNode | Literal | TripleTerm;
    };
    equals(other: Term | null | undefined): boolean;
}

/**
 * Extended term type supporting RDF 1.2 features.
 */
export type Rdf12Term = NamedNode | BlankNode | Literal | Variable | TripleTerm | Reifier;

/**
 * Extended quad type supporting RDF 1.2 features.
 * Note: We don't extend Quad directly due to RDF 1.2's expanded subject/object types.
 */
export interface Rdf12Quad {
    termType?: 'Quad';
    subject: NamedNode | BlankNode | TripleTerm;
    predicate: NamedNode;
    object: NamedNode | BlankNode | Literal | TripleTerm;
    graph: NamedNode | BlankNode | DefaultGraph;
    /** Annotations attached to this quad */
    annotations?: Rdf12Quad[];
    /** The reifier for this quad (if reified) */
    reifier?: NamedNode | BlankNode;
    equals?(other: Quad | null | undefined): boolean;
}

/**
 * N3-specific term representing a formula (graph literal).
 */
export interface Formula {
    /**
     * Contains the constant "Formula".
     */
    termType: 'Formula';

    /**
     * The quads contained within this formula.
     */
    value: string;

    /**
     * Quads contained within this formula.
     */
    quads: Array<Quad | Rdf12Quad>;

    /**
     * @param other The term to compare with.
     * @return True if and only if other has termType "Formula" and the same `value`.
     */
    equals(other: unknown): boolean;
}

/**
 * N3-specific term representing a quick variable (~var).
 */
export interface QuickVariable {
    /**
     * Contains the constant "QuickVariable".
     */
    termType: 'QuickVariable';

    /**
     * The name of the variable *without* leading ? (example: a).
     */
    value: string;

    /**
     * @param other The term to compare with.
     * @return True if and only if other has termType "QuickVariable" and the same `value`.
     */
    equals(other: unknown): boolean;
}
