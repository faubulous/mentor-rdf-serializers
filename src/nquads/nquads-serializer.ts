import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad, SerializerOptions, SerializationResult, RdfSyntax as RdfSyntaxType } from '../types.js';
import { RdfSyntax } from '../types.js';
import { SerializerBase } from '../serializer-base.js';


/**
 * Serializer for N-Quads format (RDF 1.2 compatible).
 * 
 * N-Quads extends N-Triples to support named graphs (datasets).
 * Each line contains: subject predicate object [graph] .
 * 
 * RDF 1.2 adds support for triple terms (quoted triples) as subjects or objects.
 * 
 * @see https://www.w3.org/TR/rdf12-n-quads/
 */
export class NQuadsSerializer extends SerializerBase {
    readonly syntax: RdfSyntaxType = RdfSyntax.NQuads;

    constructor() {
        super();
        // N-Quads does not support prefixes or shortcuts
        this.supportsPrefixes = false;
        this.supportsRdfTypeShorthand = false;
        // N-Quads 1.2 supports triple terms
        this.supportsRdf12 = true;
    }

    /**
     * Serializes a single quad to N-Quads format.
     * 
     * @param quad The quad to serialize.
     * @param options Serialization options.
     * @returns The serialized N-Quad string.
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string {
        const opts = this.getOptions(options);

        const subject = this.serializeTerm(quad.subject, opts);
        const predicate = this.serializeTerm(quad.predicate, opts);
        const object = this.serializeTerm(quad.object, opts);

        // Include graph if present and not default graph
        if (quad.graph && quad.graph.termType !== 'DefaultGraph') {
            const graph = this.serializeTerm(quad.graph, opts);
            return `${subject} ${predicate} ${object} ${graph} .`;
        }

        return `${subject} ${predicate} ${object} .`;
    }

    /**
     * Serializes multiple quads to N-Quads format.
     * 
     * @param quads The quads to serialize.
     * @param options Serialization options.
     * @returns The serialized N-Quads string.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string {
        const opts = this.getOptions(options);
        const quadArray = Array.from(quads);
        
        const lines: string[] = [];
        for (const quad of quadArray) {
            lines.push(this.serializeQuad(quad, opts));
        }

        return lines.join(opts.lineEnd) + (lines.length > 0 ? opts.lineEnd : '');
    }

    /**
     * Formats quads with detailed result information.
     */
    override format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): SerializationResult {
        return {
            output: this.serialize(quads, options)
        };
    }
}
