import { SourceMapEntry } from "./source-map-entry";

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