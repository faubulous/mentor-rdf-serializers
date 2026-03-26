import { Quad } from "@rdfjs/types";
import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { Rdf12Quad } from "./utilities/types";
import { SerializationOptions } from "./serialization-options";
import { SerializationResult } from "./serialization-result";

/**
 * Common interface for all serializers that can serialize RDF quads to a string format.
 */
export interface IQuadSerializer {
    /**
     * The RDF syntax this serializer produces.
     */
    readonly syntax: RdfSyntax;

    /**
     * Serializes a single quad to a string.
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializationOptions): string;

    /**
     * Serializes an array of quads to a string.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): string;

    /**
     * Serializes quads to a string with formatting applied.
     */
    format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): SerializationResult;
}