import { QuadSortingStrategy } from "./quad-sorting-strategy";

/**
 * Options for {@link StatementSerializer.serialize}.
 */
export interface QuadContextSerializerOptions {
    /**
     * Prefix mappings for compacting IRIs and emitting prefix declarations.
     */
    prefixes?: Record<string, string>;

    /**
     * Base IRI for the document.  When set, a `BASE` / `@base` declaration
     * is emitted at the top of the output.
     */
    baseIri?: string;

    /**
     * Line ending string (default: `'\n'`).
     */
    lineEnd?: string;

    /**
     * Whether to insert blank lines between subject blocks (default: `true`).
     */
    blankLinesBetweenSubjects?: boolean;

    /**
     * The sorting strategy to use for reordering statements.
     */
    sortingStrategy?: QuadSortingStrategy;

    /**
     * When `true`, skip the sort stage even if `sortingStrategy` is specified.  Use this
     * when the caller has already sorted the contexts and wants to avoid the O(n log n) 
     * overhead.  Default: `false`.
     */
    assumeSorted?: boolean;

    /**
     * Controls the style used for prefix and base directives.
     * - `'turtle'`: Turtle-style (`@prefix ex: <…> .` / `@base <…> .`)
     * - `'sparql-lowercase'`: SPARQL-style lowercase (`prefix ex: <…>` / `base <…>`)
     * - `'sparql-uppercase'`: SPARQL-style uppercase (`PREFIX ex: <…>` / `BASE <…>`)
     * Default: `'sparql-uppercase'`
     */
    directiveStyle?: 'turtle' | 'sparql-lowercase' | 'sparql-uppercase';

    /**
     * Whether to serialize single-use blank nodes as local property lists
     * (`[ ... ]`) when pretty printing.
     *
     * Default: `true`.
     */
    inlineSingleUseBlankNodes?: boolean;
}