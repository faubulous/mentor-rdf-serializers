import { SerializationResult } from "../serialization-result";
import { SerializationOptions } from "../serialization-options";

/**
 * Interface for SPARQL formatters.
 */
export interface ISparqlFormatter {
    /**
     * Formats a SPARQL query string.
     */
    formatFromText(query: string, options?: SerializationOptions): SerializationResult;

    /**
     * Formats SPARQL from parsed tokens.
     */
    formatFromTokens(tokens: unknown[], options?: SerializationOptions): SerializationResult;
}