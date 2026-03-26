import { RdfSyntax } from '@faubulous/mentor-rdf-parsers';
import type { BlankNode, Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { Rdf12Quad, Rdf12Term, TripleTerm } from '../utilities/types';
import { RDF, XSD } from '../ontologies';
import { SerializationResult } from '../serialization-result';
import { SerializationOptions } from '../serialization-options';
import { IQuadSerializer } from '../quad-serializer.interface';
import { mergeOptions } from '../quad-serializer-base';
import { findPrefix } from '../utilities/prefixes';
import { groupQuadsByGraph, groupQuadsBySubject } from '../utilities/quads';
import { parseLanguageTag } from '../utilities/terms';
import { normalizeBlankNodeId } from '../utilities/blank-nodes';

/**
 * JSON-LD specific options.
 */
export interface JsonLdSerializerOptions extends SerializationOptions {
    /**
     * Whether to use @type shorthand instead of rdf:type.
     * Default: true
     */
    useTypeShorthand?: boolean;

    /**
     * Whether to use @id shorthand instead of full IRI objects.
     * Default: true
     */
    useIdShorthand?: boolean;

    /**
     * Whether to compact arrays with single items.
     * Default: true
     */
    compactArrays?: boolean;

    /**
     * Whether to embed @context in the output.
     * Default: true
     */
    embedContext?: boolean;

    /**
     * JSON indentation spaces (default: 2).
     */
    jsonIndent?: number;

    /**
     * Whether to pretty-print the JSON output with newlines and indentation.
     */
    prettyPrint?: boolean;

    /**
     * Mapping of prefixes to namespaces for compacting IRIs in the output.
     */
    prefixes?: Record<string, string>;
}

/**
 * JSON-LD node structure.
 */
interface JsonLdNode {
    '@id'?: string;
    '@type'?: string | string[];
    '@value'?: string | number | boolean;
    '@language'?: string;
    '@direction'?: 'ltr' | 'rtl';
    '@list'?: JsonLdValue[];
    [key: string]: JsonLdValue | JsonLdValue[] | undefined;
}

type JsonLdValue = string | number | boolean | JsonLdNode | null;

/**
 * Serializer for JSON-LD format.
 * 
 * JSON-LD is a JSON-based format for Linked Data that can be used
 * both as RDF and as plain JSON.
 * 
 * Supports RDF 1.2 features including:
 * - Triple terms via @id references
 * - Base direction in language tags
 * 
 * @see https://www.w3.org/TR/json-ld11/
 */
export class JsonLdSerializer implements IQuadSerializer {
    readonly syntax: RdfSyntax = RdfSyntax.JsonLd;

    /**
     * Serializes a single quad to JSON-LD format.
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: JsonLdSerializerOptions): string {
        return this.serialize([quad], options);
    }

    /**
     * Serializes multiple quads to JSON-LD format.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: JsonLdSerializerOptions): string {
        const opts = this.getOptions(options);
        const quadArray = Array.from(quads);

        if (quadArray.length === 0) {
            return '{}';
        }

        // Group by graph first
        const graphGroups = groupQuadsByGraph(quadArray);

        // Build JSON-LD structure
        const result: Record<string, unknown> = {};

        // Add @context if prefixes are provided
        if (opts.embedContext && Object.keys(opts.prefixes).length > 0) {
            result['@context'] = this.buildContext(opts);
        }

        // Check if we have multiple graphs
        const hasNamedGraphs = Array.from(graphGroups.keys()).some(k => k !== '');

        if (hasNamedGraphs) {
            // Dataset with named graphs
            const graphs: JsonLdNode[] = [];

            for (const [graphKey, graphQuads] of graphGroups) {
                const graphNode = this.buildGraph(graphQuads, opts);

                if (graphKey !== '') {
                    graphNode['@id'] = this.extractIri(graphQuads[0].graph);
                }

                graphs.push(graphNode);
            }

            result['@graph'] = graphs.length === 1 && !opts.compactArrays ? graphs : graphs;
        } else {
            // Single default graph
            const defaultGraphQuads = graphGroups.get('') || [];
            const graphContent = this.buildGraphContent(defaultGraphQuads, opts);

            if (graphContent.length === 1 && opts.compactArrays) {
                Object.assign(result, graphContent[0]);
            } else {
                result['@graph'] = graphContent;
            }
        }

        const indent = opts.jsonIndent ?? 2;

        return JSON.stringify(result, null, opts.prettyPrint ? indent : undefined);
    }

    /**
     * Formats quads to JSON-LD with detailed result.
     */
    format(quads: Iterable<Quad | Rdf12Quad>, options?: JsonLdSerializerOptions): SerializationResult {
        return {
            output: this.serialize(quads, options)
        };
    }

    /**
     * Builds the @context object from prefixes.
     */
    private buildContext(opts: Required<JsonLdSerializerOptions>): Record<string, string> {
        const context: Record<string, string> = {};

        for (const [prefix, namespace] of Object.entries(opts.prefixes)) {
            context[prefix] = namespace;
        }

        return context;
    }

    /**
     * Builds a graph node containing all quads.
     */
    private buildGraph(quads: Array<Quad | Rdf12Quad>, opts: Required<JsonLdSerializerOptions>): JsonLdNode {
        const content = this.buildGraphContent(quads, opts);

        return { '@graph': content } as JsonLdNode;
    }

    /**
     * Builds the content of a graph (array of nodes).
     */
    private buildGraphContent(quads: Array<Quad | Rdf12Quad>, opts: Required<JsonLdSerializerOptions>): JsonLdNode[] {
        const subjectGroups = groupQuadsBySubject(quads);
        const nodes: JsonLdNode[] = [];

        for (const [_subjectKey, subjectQuads] of subjectGroups) {
            const node = this.buildNode(subjectQuads[0].subject as (Term | TripleTerm), subjectQuads, opts);

            nodes.push(node);
        }

        return nodes;
    }

    /**
     * Builds a JSON-LD node from a subject and its quads.
     */
    private buildNode(subject: Term | TripleTerm, quads: Array<Quad | Rdf12Quad>, opts: Required<JsonLdSerializerOptions>): JsonLdNode {
        const node: JsonLdNode = {};

        // Add @id for named nodes and blank nodes
        if (subject.termType === 'NamedNode') {
            node['@id'] = this.compactIri((subject as NamedNode).value, opts);
        } else if (subject.termType === 'BlankNode') {
            node['@id'] = `_:${normalizeBlankNodeId((subject as BlankNode).value)}`;
        } else if (subject.termType === 'TripleTerm') {
            // Handle RDF 1.2 triple term subjects
            // JSON-LD doesn't directly support this, so we represent as reified statement
            const tt = subject as TripleTerm;
            node['@type'] = this.compactIri(RDF.Statement, opts);
            node[this.compactIri(RDF.subject, opts)] = this.buildValue(tt.subject, opts) as JsonLdValue;
            node[this.compactIri(RDF.predicate, opts)] = this.buildValue(tt.predicate, opts) as JsonLdValue;
            node[this.compactIri(RDF.object, opts)] = this.buildValue(tt.object, opts) as JsonLdValue;
        }

        // Group properties
        const properties = new Map<string, Array<Quad | Rdf12Quad>>();

        for (const quad of quads) {
            const predKey = quad.predicate.value;

            if (!properties.has(predKey)) {
                properties.set(predKey, []);
            }

            properties.get(predKey)!.push(quad);
        }

        // Build properties
        for (const [predicateIri, propQuads] of properties) {
            const values = propQuads.map(q => this.buildValue(q.object, opts));

            // Use @type shorthand for rdf:type
            if (opts.useTypeShorthand && predicateIri === RDF.type) {
                const types = values.map(v => {
                    if (typeof v === 'object' && v !== null && '@id' in v) {
                        return (v as JsonLdNode)['@id'];
                    }
                    return v;
                }).filter((v): v is string => typeof v === 'string');

                node['@type'] = opts.compactArrays && types.length === 1 ? types[0] : types;
            } else {
                const propName = this.compactIri(predicateIri, opts);
                node[propName] = opts.compactArrays && values.length === 1
                    ? values[0] as JsonLdValue
                    : values as JsonLdValue[];
            }
        }

        return node;
    }

    /**
     * Builds a JSON-LD value from an RDF term.
     */
    private buildValue(term: Term | Rdf12Term, opts: Required<JsonLdSerializerOptions>): JsonLdValue {
        switch (term.termType) {
            case 'NamedNode':
                if (opts.useIdShorthand) {
                    return { '@id': this.compactIri(term.value, opts) };
                } else {
                    return { '@id': term.value };
                }
            case 'BlankNode':
                return { '@id': `_:${normalizeBlankNodeId(term.value)}` };
            case 'Literal':
                return this.buildLiteralValue(term as Literal, opts);
            case 'TripleTerm':
                return this.buildTripleTermValue(term as TripleTerm, opts);
            default:
                return null;
        }
    }

    /**
     * Builds a JSON-LD literal value.
     */
    private buildLiteralValue(literal: Literal, opts: Required<JsonLdSerializerOptions>): JsonLdValue {
        const datatype = literal.datatype?.value;
        const language = literal.language;

        // Language-tagged literal
        if (language) {
            const parsed = parseLanguageTag(language);
            const result: JsonLdNode = {
                '@value': literal.value,
                '@language': parsed.language
            };

            if (parsed.direction) {
                result['@direction'] = parsed.direction;
            }

            return result;
        }

        // Native JSON types
        if (datatype === XSD.boolean) {
            return literal.value === 'true' || literal.value === '1';
        }

        if (datatype === XSD.integer) {
            const num = parseInt(literal.value, 10);

            if (!isNaN(num)) {
                return num;
            }
        }

        if (datatype === XSD.double || datatype === XSD.decimal) {
            const num = parseFloat(literal.value);

            if (!isNaN(num)) {
                return num;
            }
        }

        // Plain string (xsd:string is default)
        if (!datatype || datatype === XSD.string) {
            return literal.value;
        }

        // Typed literal
        return {
            '@value': literal.value,
            '@type': this.compactIri(datatype, opts)
        };
    }

    /**
     * Builds a JSON-LD representation of a triple term (RDF 1.2).
     */
    private buildTripleTermValue(tripleTerm: TripleTerm, opts: Required<JsonLdSerializerOptions>): JsonLdNode {
        // JSON-LD 1.1 doesn't have native triple term support,
        // but we can represent it as a reified statement
        const result: JsonLdNode = { '@type': this.compactIri(RDF.Statement, opts) };
        result[this.compactIri(RDF.subject, opts)] = this.buildValue(tripleTerm.subject, opts) as JsonLdValue;
        result[this.compactIri(RDF.predicate, opts)] = this.buildValue(tripleTerm.predicate, opts) as JsonLdValue;
        result[this.compactIri(RDF.object, opts)] = this.buildValue(tripleTerm.object, opts) as JsonLdValue;

        return result;
    }

    /**
     * Compacts an IRI using prefixes.
     */
    private compactIri(iri: string, opts: Required<JsonLdSerializerOptions>): string {
        const prefixMatch = findPrefix(iri, opts.prefixes);

        if (prefixMatch) {
            return `${prefixMatch.prefix}:${prefixMatch.localName}`;
        }

        return iri;
    }

    /**
     * Extracts the IRI value from a graph term.
     */
    private extractIri(term: Term): string {
        if (term.termType === 'NamedNode') {
            return term.value;
        }

        if (term.termType === 'BlankNode') {
            return `_:${normalizeBlankNodeId(term.value)}`;
        }

        return '';
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: JsonLdSerializerOptions): Required<JsonLdSerializerOptions> {
        return {
            ...mergeOptions(options),
            useTypeShorthand: options?.useTypeShorthand ?? true,
            useIdShorthand: options?.useIdShorthand ?? true,
            compactArrays: options?.compactArrays ?? true,
            embedContext: options?.embedContext ?? true,
            jsonIndent: options?.jsonIndent ?? 2
        };
    }
}
