import { SerializationResult } from "../serialization-result";
import { SerializerOptions } from "../serializer-options";

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