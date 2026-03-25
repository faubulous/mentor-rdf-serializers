import { RdfSyntax} from '@faubulous/mentor-rdf-parsers';
import { Quad } from '@rdfjs/types';
import { Rdf12Quad } from '@src/types.js';
import { SerializerBase } from '@src/serializer-base.js';
import { SerializationResult } from '@src/serialization-result';
import { SerializerOptions } from '@src/serializer-options';


/**
 * Serializer for N-Triples format (RDF 1.2 compatible).
 * 
 * N-Triples is a line-based, plain text format for encoding RDF graphs.
 * Each line contains a single triple: subject predicate object .
 * 
 * RDF 1.2 adds support for triple terms (quoted triples) as subjects or objects.
 * 
 * @see https://www.w3.org/TR/rdf12-n-triples/
 */
export class NTriplesSerializer extends SerializerBase {
    readonly syntax: RdfSyntax = RdfSyntax.NTriples;

    constructor() {
        super();
        // N-Triples does not support prefixes or shortcuts
        this.supportsPrefixes = false;
        this.supportsRdfTypeShorthand = false;
        // N-Triples 1.2 supports triple terms
        this.supportsRdf12 = true;
    }

    /**
     * Serializes a single quad/triple to N-Triples format.
     * 
     * @param quad The quad to serialize.
     * @param options Serialization options.
     * @returns The serialized N-Triple string.
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string {
        const opts = this.getOptions(options);

        const subject = this.serializeTerm(quad.subject, opts);
        const predicate = this.serializeTerm(quad.predicate, opts);
        const object = this.serializeTerm(quad.object, opts);

        return `${subject} ${predicate} ${object} .`;
    }

    /**
     * Serializes multiple quads/triples to N-Triples format.
     * 
     * @param quads The quads to serialize.
     * @param options Serialization options.
     * @returns The serialized N-Triples string.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string {
        const opts = this.getOptions(options);
        const quadArray = Array.from(quads);
        
        const lines: string[] = [];
        for (const quad of quadArray) {
            // Skip quads with graph (N-Triples doesn't support named graphs)
            if (quad.graph && quad.graph.termType !== 'DefaultGraph') {
                continue;
            }
            lines.push(this.serializeQuad(quad, opts));
        }

        return lines.join(opts.lineEnd) + (lines.length > 0 ? opts.lineEnd : '');
    }

    /**
     * Formats quads with detailed result information.
     */
    override format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): SerializationResult {
        const warnings: string[] = [];
        const quadArray = Array.from(quads);

        // Check for unsupported features and add warnings
        for (const quad of quadArray) {
            if (quad.graph && quad.graph.termType !== 'DefaultGraph') {
                warnings.push(`Named graph ignored: N-Triples does not support named graphs.`);
                break;
            }
        }

        return {
            output: this.serialize(quads, options),
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}
