import { SortingStrategy, QuadComparator } from "./sorting-strategy";

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
     * Whether to use lowercase `@prefix` and `@base` (Turtle style).
     * When false, uses uppercase `PREFIX` and `BASE` (SPARQL style).
     * Default: false (SPARQL style)
     */
    lowercaseDirectives?: boolean;

    /**
     * Whether to emit `PREFIX`/`BASE` directives in serializer output.
     * Default: true.
     */
    emitDirectives?: boolean;

    /**
     * Custom blank node ID generator.
     * If provided, this function will be called to generate IDs for new blank nodes.
     */
    blankNodeIdGenerator?: (counter: number) => string;
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
 * Default serializer options.
 */
export const DEFAULT_OPTIONS: Required<SerializerOptions> = {
    baseIri: '',
    prefixes: {},
    indent: '  ',
    lineEnd: '\n',
    prettyPrint: true,
    sort: false,
    groupBySubject: true,
    useRdfTypeShorthand: true,
    maxLineWidth: 0,
    alignPredicates: false,
    alignObjects: false,
    blankNodeStyle: 'auto',
    objectListStyle: 'auto',
    predicateListStyle: 'first-same-line',
    blankLinesBetweenSubjects: true,
    lowercaseDirectives: false,
    emitDirectives: true,
    blankNodeIdGenerator: (counter: number) => `b${counter}`
};