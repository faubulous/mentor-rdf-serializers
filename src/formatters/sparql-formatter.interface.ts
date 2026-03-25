import { SerializationResult } from "@src/serialization-result";
import { SerializerOptions } from "@src/serializer-options";

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