import { Quad } from "@rdfjs/types";
import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { Rdf12Quad } from "./utilities/types";
import { SerializerOptions } from "./serializer-options";
import { SerializationResult } from "./serialization-result";

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