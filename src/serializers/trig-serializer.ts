import { RdfSyntax} from '@faubulous/mentor-rdf-parsers';
import { Quad } from '@rdfjs/types';
import { Rdf12Quad } from '@src/utilities/types';
import { TurtleSerializer } from '@src/serializers/turtle-serializer';
import { SerializationResult } from '@src/serialization-result';
import { SerializerOptions } from '@src/serializer-options';
import { groupQuadsByGraph, groupQuadsBySubjectPredicate, hasAnnotations } from '@src/utilities/quads';

/**
 * Serializer for TriG format (RDF 1.2 compatible).
 * 
 * TriG extends Turtle to support RDF datasets with named graphs.
 * Each named graph is enclosed in `GRAPH <iri> { ... }` or `<iri> { ... }`.
 * 
 * @see https://www.w3.org/TR/rdf12-trig/
 */
export class TrigSerializer extends TurtleSerializer {
    override readonly syntax: RdfSyntax = RdfSyntax.TriG;

    /**
     * Serializes multiple quads to TriG format with full formatting.
     */
    override serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string {
        const opts = this.getOptions(options);
        const quadArray = Array.from(quads);

        if (quadArray.length === 0) {
            return '';
        }

        const parts: string[] = [];

        if (opts.emitDirectives) {
            // Add base declaration if provided
            if (opts.baseIri) {
                const baseKeyword = opts.lowercaseDirectives ? '@base' : 'BASE';
                const terminator = opts.lowercaseDirectives ? ' .' : '';
                parts.push(`${baseKeyword} <${opts.baseIri}>${terminator}`);
            }

            // Add prefix declarations
            for (const [prefix, namespace] of Object.entries(opts.prefixes)) {
                const prefixKeyword = opts.lowercaseDirectives ? '@prefix' : 'PREFIX';
                const terminator = opts.lowercaseDirectives ? ' .' : '';
                parts.push(`${prefixKeyword} ${prefix}: <${namespace}>${terminator}`);
            }

            // Add blank line after declarations
            if (parts.length > 0) {
                parts.push('');
            }
        }

        // Group quads by graph
        const graphGroups = groupQuadsByGraph(quadArray);

        // Serialize each graph
        for (const [graphKey, graphQuads] of graphGroups) {
            if (graphKey === '') {
                // Default graph - serialize as Turtle
                if (opts.groupBySubject) {
                    const grouped = groupQuadsBySubjectPredicate(graphQuads);
                    parts.push(this.serializeGraphContent(grouped, opts, ''));
                } else {
                    for (const quad of graphQuads) {
                        parts.push(this.serializeQuad(quad, opts));
                    }
                }
            } else {
                // Named graph
                const graphTerm = graphQuads[0].graph;
                const graphIri = this.serializeTerm(graphTerm, opts);

                if (opts.prettyPrint) {
                    parts.push(`${graphIri} {`);

                    if (opts.groupBySubject) {
                        const grouped = groupQuadsBySubjectPredicate(graphQuads);
                        const content = this.serializeGraphContent(grouped, opts, opts.indent);
                        if (content) {
                            parts.push(content);
                        }
                    } else {
                        for (const quad of graphQuads) {
                            const triple = this.serializeTripleOnly(quad, opts);
                            parts.push(`${opts.indent}${triple} .`);
                        }
                    }

                    parts.push('}');
                } else {
                    // Compact format
                    const triples = graphQuads.map(q => this.serializeTripleOnly(q, opts) + ' .').join(' ');
                    parts.push(`${graphIri} { ${triples} }`);
                }
            }

            if (opts.prettyPrint) {
                parts.push(''); // Blank line between graphs
            }
        }

        // Remove trailing blank line
        while (parts.length > 0 && parts[parts.length - 1] === '') {
            parts.pop();
        }

        return parts.join(opts.lineEnd) + (parts.length > 0 ? opts.lineEnd : '');
    }

    /**
     * Serializes a triple without the terminating period.
     */
    private serializeTripleOnly(quad: Quad | Rdf12Quad, opts: Required<SerializerOptions>): string {
        const subject = this.serializeTerm(quad.subject, opts);
        const predicate = this.serializeTerm(quad.predicate, opts);
        const object = this.serializeTerm(quad.object, opts);

        let result = `${subject} ${predicate} ${object}`;

        // Add annotations if present (RDF 1.2)
        if (hasAnnotations(quad)) {
            result += ' ' + this.serializeAnnotationsInternal((quad as Rdf12Quad).annotations!, opts);
        }

        return result;
    }

    /**
     * Serializes RDF 1.2 annotations.
     */
    private serializeAnnotationsInternal(
        annotations: Rdf12Quad[],
        opts: Required<SerializerOptions>
    ): string {
        if (annotations.length === 0) {
            return '';
        }

        const parts = annotations.map(ann => {
            const predicate = this.serializeTerm(ann.predicate, opts);
            const object = this.serializeTerm(ann.object, opts);
            return `${predicate} ${object}`;
        });

        return `{| ${parts.join(' ; ')} |}`;
    }

    /**
     * Serializes grouped quads within a graph context.
     */
    private serializeGraphContent(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        opts: Required<SerializerOptions>,
        baseIndent: string
    ): string {
        const parts: string[] = [];
        const indent = opts.prettyPrint ? opts.indent : '';
        const lineEnd = opts.prettyPrint ? opts.lineEnd : ' ';

        let firstSubject = true;
        for (const [_subjectKey, predicateMap] of grouped) {
            const firstQuad = predicateMap.values().next().value![0];

            if (!firstSubject && opts.prettyPrint) {
                parts.push(''); // Blank line between subjects
            }
            firstSubject = false;

            const subject = this.serializeTerm(firstQuad.subject, opts);
            const predicateParts: string[] = [];

            let first = true;
            for (const [_predicateKey, quads] of predicateMap) {
                const predicate = this.serializeTerm(quads[0].predicate, opts);
                const objects = quads.map(q => this.serializeObjectWithAnnotationsInternal(q, opts));

                if (first) {
                    predicateParts.push(`${baseIndent}${subject} ${predicate} ${objects.join(' , ')}`);
                    first = false;
                } else {
                    predicateParts.push(`${baseIndent}${indent}${predicate} ${objects.join(' , ')}`);
                }
            }

            parts.push(predicateParts.join(' ;' + lineEnd) + ' .');
        }

        return parts.join(opts.lineEnd);
    }

    /**
     * Serializes an object with its annotations if present.
     */
    private serializeObjectWithAnnotationsInternal(
        quad: Quad | Rdf12Quad,
        opts: Required<SerializerOptions>
    ): string {
        let result = this.serializeTerm(quad.object, opts);

        if (hasAnnotations(quad)) {
            result += ' ' + this.serializeAnnotationsInternal((quad as Rdf12Quad).annotations!, opts);
        }

        return result;
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
