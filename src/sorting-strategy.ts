import { Quad } from "@rdfjs/types";
import { Rdf12Quad } from "./utilities/types.js";

/**
 * Comparator function for sorting quads.
 */
export type QuadComparator = (a: Quad | Rdf12Quad, b: Quad | Rdf12Quad) => number;

/**
 * Strategy for sorting quads.
 * Supports pluggable sorting algorithms with optional preparation step.
 */
export interface SortingStrategy {
    /** Compare two quads for sorting. Returns negative if a < b, positive if a > b, 0 if equal. */
    compare: QuadComparator;

    /** Optional: pre-process quads to build indexes for efficient sorting */
    prepare?(quads: Array<Quad | Rdf12Quad>): void;
}