import { SortingStrategy } from "./sorting-strategy";

/**
 * Options for {@link StatementSerializer.serialize}.
 */
export interface StatementSerializerOptions {
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
    sortingStrategy?: SortingStrategy;

    /**
     * When `true`, skip the sort stage even if `sortingStrategy` is specified.  Use this
     * when the caller has already sorted the contexts and wants to avoid the O(n log n) 
     * overhead.  Default: `false`.
     */
    assumeSorted?: boolean;

    /**
     * Use lowercase directives (`@prefix` / `@base`) instead of uppercase
     * (`PREFIX` / `BASE`).  Default: `false`.
     */
    lowercaseDirectives?: boolean;
}