import type { BlankNode, DefaultGraph, Literal, NamedNode, Quad, Term, Variable } from '@rdfjs/types';

/**
 * RDF 1.2 Triple Term - a quoted triple that can be used as subject or object.
 * 
 * Syntax: `<<( subject predicate object )>>`
 */
export interface TripleTerm {
    /**
     * Contains the constant "TripleTerm".
     */
    termType: 'TripleTerm';

    /**
     * The subject of the triple with support for RDF 1.2 triple terms. This can be a blank node, named node, or another triple term (allowing for nested triples).
     */
    subject: NamedNode | BlankNode | TripleTerm;

    /**
     * The predicate of the triple.
     */
    predicate: NamedNode;

    /**
     * The object of the triple. This can be a blank node, named node, literal, or another triple term (allowing for nested triples).
     */
    object: NamedNode | BlankNode | Literal | TripleTerm;

    /**
     * Compares this triple term with another term for equality.
     * @param other The term to compare with.
     * @return `true` if and only if other has termType "TripleTerm" and the same subject, predicate, and object.
     */
    equals(other: Term | null | undefined): boolean;
}

/**
 * RDF 1.2 Reifier - a blank node or named node that reifies a triple.
 * 
 * Syntax: `<< subject predicate object >>` or `<< subject predicate object ~ reifierId >>`
 */
export interface Reifier {
    /**
     * Contains the constant "Reifier".
     */
    termType: 'Reifier';

    /**
     * The node that is used as the subject of the reifying quad. This can be a blank node or a named node, but not a triple term.
     */
    id: NamedNode | BlankNode;

    /**
     * The triple that is being reified. The subject and object of this triple can be a triple term, but the predicate must be a named node.
     */
    triple: {
        subject: NamedNode | BlankNode | TripleTerm;
        predicate: NamedNode;
        object: NamedNode | BlankNode | Literal | TripleTerm;
    };

    /**
     * Compares this reifier with another term for equality.
     * @param other The term to compare with.
     * @return `true` if and only if other has termType "Reifier" and the same id and triple.
     */
    equals(other: Term | null | undefined): boolean;
}

/**
 * Extended term type supporting RDF 1.2 features.
 */
export type Rdf12Term = NamedNode | BlankNode | Literal | Variable | TripleTerm | Reifier;

/**
 * Extended quad type supporting RDF 1.2 features.
 * @remark We don't extend Quad directly due to RDF 1.2's expanded subject/object types.
 */
export interface Rdf12Quad {
    /**
     * Contains the constant "Quad".
     */
    termType?: 'Quad';

    /**
     * The subject of the quad with support for RDF 1.2 triple terms.
     */
    subject: NamedNode | BlankNode | TripleTerm;

    /**
     * The predicate of the quad.
     */
    predicate: NamedNode;

    /**
     * The object of the quad with support for RDF 1.2 triple terms.
     */
    object: NamedNode | BlankNode | Literal | TripleTerm;

    /**
     * The graph of the quad, which can be a named node, blank node, or default graph.
     */
    graph: NamedNode | BlankNode | DefaultGraph;

    /**
     * Quads that reify this quad (if any). Each reifying quad has this quad as its object and a reifier as its subject.
     */
    annotations?: Rdf12Quad[];

    /**
     * The reifier for this quad (if reified)
     */
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
