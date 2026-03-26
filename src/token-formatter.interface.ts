import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { SerializationResult } from "./serialization-result";
import { SerializationOptions } from "./serialization-options";

/**
 * Interface for RDF text formatters (Turtle, N-Triples, etc.).
 */
export interface ITokenFormatter {
    /**
     * The RDF syntax this formatter handles.
     */
    readonly syntax: RdfSyntax;

    /**
     * Formats RDF text input.
     */
    formatFromText(input: string, options?: SerializationOptions): SerializationResult;

    /**
     * Formats from already-parsed tokens.
     */
    formatFromTokens(tokens: unknown[], options?: SerializationOptions): SerializationResult;
}