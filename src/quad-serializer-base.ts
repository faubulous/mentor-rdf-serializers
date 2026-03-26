import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { BlankNode, Literal, NamedNode, Quad, Term, Variable } from '@rdfjs/types';
import { Rdf12Quad, Rdf12Term, TripleTerm } from './utilities/types';
import { RDF, XSD } from './ontologies';
import { IQuadSerializer } from './quad-serializer.interface';
import { SerializationResult } from './serialization-result';
import { SerializationOptions, DEFAULT_OPTIONS } from './serialization-options';
import { escapeLocalName, escapeIri, escapeString } from "./utilities/escaping";
import { isInteger, isDecimal, isDouble, needsLongString } from "./utilities/literals";
import { normalizeBlankNodeId } from './utilities/blank-nodes';
import { findPrefix } from "./utilities/prefixes";

/**
 * Abstract base class for RDF serializers. Provides common functionality 
 * for serializing terms and literals.
 */
export abstract class QuadSerializerBase implements IQuadSerializer {
    /**
     * The RDF syntax supported by this serializer.
     */
    abstract readonly syntax: RdfSyntax;

    /**
     * Whether this serializer supports prefixed names.
     */
    protected supportsPrefixes: boolean = false;

    /**
     * Whether this serializer supports the 'a' shorthand for rdf:type.
     */
    protected supportsRdfTypeShorthand: boolean = false;

    /**
     * Whether this serializer supports RDF 1.2 features (triple terms, reifiers, annotations).
     */
    protected supportsRdf12: boolean = false;

    /**
     * Serializes a single quad to a string.
     */
    abstract serializeQuad(quad: Quad | Rdf12Quad, options?: SerializationOptions): string;

    /**
     * Serializes an array of quads to a string.
     */
    abstract serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): string;

    /**
     * Serializes quads with formatting, returning detailed result.
     */
    format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): SerializationResult {
        return {
            output: this.serialize(quads, options)
        };
    }

    /**
     * Serializes a named node (IRI).
     */
    protected serializeNamedNode(node: NamedNode, options: Required<SerializationOptions>): string {
        // Check for rdf:type shorthand
        if (this.supportsRdfTypeShorthand && options.useRdfTypeShorthand && node.value === RDF.type) {
            return 'a';
        }

        if (this.supportsPrefixes && Object.keys(options.prefixes).length > 0) {
            const prefixMatch = findPrefix(node.value, options.prefixes);

            if (prefixMatch) {
                const escapedLocalName = escapeLocalName(prefixMatch.localName);

                return `${prefixMatch.prefix}:${escapedLocalName}`;
            }
        }

        return `<${escapeIri(node.value)}>`;
    }

    /**
     * Serializes a blank node.
     */
    protected serializeBlankNode(node: BlankNode, _options: Required<SerializationOptions>): string {
        return `_:${normalizeBlankNodeId(node.value)}`;
    }

    /**
     * Serializes a literal value.
     */
    protected serializeLiteral(literal: Literal, options: Required<SerializationOptions>): string {
        const value = literal.value;
        const datatype = literal.datatype?.value;
        const language = literal.language;

        if (language) {
            const escapedValue = escapeString(value);

            return `"${escapedValue}"@${language}`;
        }

        if (this.supportsPrefixes && datatype === XSD.boolean) {
            if (value === 'true' || value === '1') {
                return 'true';
            }
            if (value === 'false' || value === '0') {
                return 'false';
            }
        }

        if (this.supportsPrefixes) {
            if (datatype === XSD.integer && isInteger(value)) {
                return value;
            }
            if (datatype === XSD.decimal && isDecimal(value)) {
                return value;
            }
            if (datatype === XSD.double && isDouble(value)) {
                return value;
            }
        }

        // Check if we need long string quoting
        const useLongString = this.supportsPrefixes && needsLongString(value);
        const quote = useLongString ? '"""' : '"';
        const escapedValue = escapeString(value, useLongString);

        // xsd:string is the default, no need to serialize it
        if (!datatype || datatype === XSD.string) {
            return `${quote}${escapedValue}${quote}`;
        }

        // Serialize with datatype
        const datatypeStr = this.serializeNamedNode(
            {
                termType: 'NamedNode',
                value: datatype,
                equals: () => false
            } as NamedNode,
            options
        );

        return `${quote}${escapedValue}${quote}^^${datatypeStr}`;
    }

    /**
     * Serializes a SPARQL variable.
     */
    protected serializeVariable(variable: Variable, _options: Required<SerializationOptions>): string {
        return `?${variable.value}`;
    }

    /**
     * Serializes an RDF 1.2 Triple Term.
     */
    protected serializeTripleTerm(tripleTerm: TripleTerm, options: Required<SerializationOptions>): string {
        if (!this.supportsRdf12) {
            throw new Error('Triple terms are not supported in this format');
        } else {
            const subject = this.serializeTerm(tripleTerm.subject, options);
            const predicate = this.serializeTerm(tripleTerm.predicate, options);
            const object = this.serializeTerm(tripleTerm.object, options);

            return `<<( ${subject} ${predicate} ${object} )>>`;
        }
    }

    /**
     * Serializes any RDF term.
     */
    protected serializeTerm(term: Term | Rdf12Term, options: Required<SerializationOptions>): string {
        switch (term.termType) {
            case 'DefaultGraph':
                return '';
            case 'NamedNode':
                return this.serializeNamedNode(term as NamedNode, options);
            case 'BlankNode':
                return this.serializeBlankNode(term as BlankNode, options);
            case 'Literal':
                return this.serializeLiteral(term as Literal, options);
            case 'Variable':
                return this.serializeVariable(term as Variable, options);
            case 'TripleTerm':
                return this.serializeTripleTerm(term as TripleTerm, options);
            default:
                throw new Error(`Unknown term type: ${term.termType}`);
        }
    }

    /**
     * Gets merged options with defaults.
     */
    protected getOptions(options?: SerializationOptions): Required<SerializationOptions> {
        return mergeOptions(options);
    }
}

/**
 * Merges user options with defaults.
 */
export function mergeOptions(options?: SerializationOptions): Required<SerializationOptions> {
    return {
        ...DEFAULT_OPTIONS,
        ...options,
        prefixes: {
            ...DEFAULT_OPTIONS.prefixes,
            ...options?.prefixes
        }
    };
}