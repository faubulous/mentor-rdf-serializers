/**
 * Source map entry for tracking output to input position mapping.
 */
export interface SourceMapEntry {
    /**
     * Output position (character offset in the serialized string).
     */
    outputOffset: number;

    /**
     * Length of the serialized segment.
     */
    outputLength: number;

    /**
     * Input position (character offset in the source, if available).
     */
    inputOffset?: number;

    /**
     * Length of the input segment.
     */
    inputLength?: number;

    /**
     * Type of the serialized element.
     */
    type: 'iri' | 'prefixedName' | 'blankNode' | 'literal' | 'keyword' | 'punctuation' | 'variable';
}