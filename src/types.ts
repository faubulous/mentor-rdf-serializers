import type { BlankNode, DefaultGraph, Literal, NamedNode, Quad, Term, Variable } from '@rdfjs/types';

/**
 * Comparator function for sorting quads.
 */
export type QuadComparator = (a: Quad | Rdf12Quad, b: Quad | Rdf12Quad) => number;

/**
 * Strategy for sorting quads.
 * Supports pluggable sorting algorithms with optional preparation step.
 */
export interface SortingStrategy {
    /** Strategy name for identification */
    name: string;
    
    /** Compare two quads for sorting. Returns negative if a < b, positive if a > b, 0 if equal. */
    compare: QuadComparator;
    
    /** Optional: pre-process quads to build indexes for efficient sorting */
    prepare?(quads: Array<Quad | Rdf12Quad>): void;
    
    /** Internal state storage (strategies should use _-prefixed properties) */
    [key: `_${string}`]: unknown;
}

/**
 * Configuration for priority-based sorting strategy.
 */
export interface PriorityStrategyConfig {
    /** Type IRIs in priority order (earliest = highest priority) */
    typeOrder?: string[];
    
    /** Predicate IRIs in priority order for secondary sorting */
    predicateOrder?: string[];
    
    /** Where to place resources without a matching type */
    unmatchedPosition?: 'start' | 'end';
    
    /** How to sort unmatched resources */
    unmatchedSort?: 'alphabetical' | 'none';
}

/**
 * Sort option type - can be boolean, strategy object, or custom comparator.
 */
export type SortOption = boolean | SortingStrategy | QuadComparator;

/**
 * Blank node formatting style.
 * - 'labeled': Always use labeled syntax `_:b0`
 * - 'inline': Use inline property list syntax `[ prop value ]` where possible
 * - 'auto': Use inline for anonymous blank nodes, labeled for referenced ones
 */
export type BlankNodeStyle = 'labeled' | 'inline' | 'auto';

/**
 * Object list formatting style.
 * - 'single-line': Objects on same line separated by commas
 * - 'multi-line': Each object on its own line
 * - 'auto': Single-line if fits within maxLineWidth, else multi-line
 */
export type ObjectListStyle = 'single-line' | 'multi-line' | 'auto';

/**
 * Predicate list formatting style.
 * - 'single-line': All predicates on same line (compact)
 * - 'multi-line': Each predicate on its own line
 * - 'first-same-line': First predicate on subject line, rest indented
 */
export type PredicateListStyle = 'single-line' | 'multi-line' | 'first-same-line';

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
 * Configuration options for serializers.
 */
export interface SerializerOptions {
    /**
     * The base IRI for relative IRI resolution.
     */
    baseIri?: string;

    /**
     * Prefix mappings for compact IRI serialization.
     * Maps prefix names to namespace IRIs.
     */
    prefixes?: Record<string, string>;

    /**
     * Indentation string (default: '  ' for 2 spaces).
     */
    indent?: string;

    /**
     * Line ending string (default: '\n').
     */
    lineEnd?: string;

    /**
     * Whether to use pretty printing with indentation and line breaks.
     * Default: true
     */
    prettyPrint?: boolean;

    /**
     * Sorting option for quads.
     * - `false`: no sorting (default)
     * - `true`: alphabetical sorting by subject, predicate, object
     * - `SortingStrategy`: use a custom sorting strategy
     * - `QuadComparator`: use a custom comparator function
     */
    sort?: SortOption;

    /**
     * Whether to group statements by subject (Turtle/TriG style).
     * Default: true for Turtle/TriG, false for N-Triples/N-Quads
     */
    groupBySubject?: boolean;

    /**
     * Whether to use the 'a' shorthand for rdf:type.
     * Default: true for Turtle/TriG/N3, false for N-Triples/N-Quads
     */
    useRdfTypeShorthand?: boolean;

    /**
     * Maximum line width before wrapping (0 = no wrapping).
     * Default: 0
     */
    maxLineWidth?: number;

    /**
     * Whether to align predicates in columns.
     * Default: false
     */
    alignPredicates?: boolean;

    /**
     * Whether to align objects in columns (requires alignPredicates).
     * Default: false
     */
    alignObjects?: boolean;

    /**
     * Blank node formatting style.
     * Default: 'auto'
     */
    blankNodeStyle?: BlankNodeStyle;

    /**
     * Object list formatting style.
     * Default: 'auto'
     */
    objectListStyle?: ObjectListStyle;

    /**
     * Predicate list formatting style.
     * Default: 'first-same-line'
     */
    predicateListStyle?: PredicateListStyle;

    /**
     * Whether to insert blank lines between subjects.
     * Default: true
     */
    blankLinesBetweenSubjects?: boolean;

    /**
     * Custom blank node ID generator.
     * If provided, this function will be called to generate IDs for new blank nodes.
     */
    blankNodeIdGenerator?: (counter: number) => string;
}

/**
 * Options for token-based serialization.
 */
export interface TokenSerializerOptions extends SerializerOptions {
    /**
     * Whether to preserve the original blank node IDs from tokens.
     * When true, uses the blankNodeId from token payloads.
     * Default: true
     */
    preserveBlankNodeIds?: boolean;

    /**
     * Whether to preserve comments from the source.
     * When true, comments are included in the output.
     * Default: true
     */
    preserveComments?: boolean;
}

/**
 * Result of a serialization operation.
 */
export interface SerializationResult {
    /**
     * The serialized string output.
     */
    output: string;

    /**
     * Any warnings generated during serialization.
     */
    warnings?: string[];

    /**
     * Source map information for relating output positions to input positions.
     */
    sourceMap?: SourceMapEntry[];
}

/**
 * Source map entry for tracking output to input position mapping.
 */
export interface SourceMapEntry {
    /**
     * Output position (character offset in the serialized string).
     */
    outputOffset: number;

    /**
     * Length of the serialized segment.
     */
    outputLength: number;

    /**
     * Input position (character offset in the source, if available).
     */
    inputOffset?: number;

    /**
     * Length of the input segment.
     */
    inputLength?: number;

    /**
     * Type of the serialized element.
     */
    type: 'iri' | 'prefixedName' | 'blankNode' | 'literal' | 'keyword' | 'punctuation' | 'variable';
}

/**
 * Common interface for all RDF serializers.
 */
export interface ISerializer {
    /**
     * The RDF syntax this serializer produces.
     */
    readonly syntax: RdfSyntax;

    /**
     * Serializes a single quad to a string.
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string;

    /**
     * Serializes an array of quads to a string.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string;

    /**
     * Serializes quads to a string with formatting applied.
     */
    format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): SerializationResult;
}

/**
 * Interface for serializers that support token-based serialization.
 * This allows serializing directly from parser tokens while preserving
 * source information like blank node IDs.
 */
export interface ITokenSerializer extends ISerializer {
    /**
     * Serializes from Chevrotain tokens, preserving blank node IDs and source positions.
     */
    serializeFromTokens(tokens: unknown[], options?: TokenSerializerOptions): SerializationResult;
}

/**
 * Interface for SPARQL formatters.
 */
export interface ISparqlFormatter {
    /**
     * Formats a SPARQL query string.
     */
    formatFromText(query: string, options?: SerializerOptions): SerializationResult;

    /**
     * Formats SPARQL from parsed tokens.
     */
    formatFromTokens(tokens: unknown[], options?: SerializerOptions): SerializationResult;
}

/**
 * Interface for RDF text formatters (Turtle, N-Triples, etc.).
 */
export interface IRdfFormatter {
    /**
     * The RDF syntax this formatter handles.
     */
    readonly syntax: RdfSyntax;

    /**
     * Formats RDF text input.
     */
    formatFromText(input: string, options?: SerializerOptions): SerializationResult;

    /**
     * Formats from already-parsed tokens.
     */
    formatFromTokens(tokens: unknown[], options?: SerializerOptions): SerializationResult;
}
