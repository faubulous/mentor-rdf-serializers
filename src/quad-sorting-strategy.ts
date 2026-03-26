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
export interface QuadSortingStrategy {
    /**
     * Compare two quads for sorting.
     */
    compare: QuadComparator;

    /**
     * Pre-process quads to build indexes for efficient sorting.
     * @param quads - The quads to prepare for sorting
     */
    prepare?(quads: Array<Quad | Rdf12Quad>): void;
}