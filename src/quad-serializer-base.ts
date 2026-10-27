import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { BlankNode, Literal, NamedNode, Quad, Term, Variable } from '@rdfjs/types';
import { Rdf12Quad, Rdf12Term, TripleTerm } from './utilities/types';
import { IQuadSerializer } from './quad-serializer.interface';
import { SerializationResult } from './serialization-result';
import { SerializationOptions, DEFAULT_OPTIONS } from './serialization-options';
import { TermSerializer, TermSerializerSettings } from './term-serializer';

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
     * The settings the terms of the current serialization run are written with, resolved from
     * the capabilities of this serializer and the options the hooks are called with.
     */
    private _termSettings?: TermSerializerSettings;

    /**
     * The options the term settings were resolved from.
     */
    private _termOptions?: Required<SerializationOptions>;

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
        return TermSerializer.serializeNamedNode(node, this.termSettingsFor(options), true);
    }

    /**
     * Serializes a blank node.
     */
    protected serializeBlankNode(node: BlankNode, options: Required<SerializationOptions>): string {
        return TermSerializer.serializeBlankNode(node, this.termSettingsFor(options));
    }

    /**
     * Serializes a literal value.
     */
    protected serializeLiteral(literal: Literal, options: Required<SerializationOptions>): string {
        return TermSerializer.serializeLiteral(literal, this.termSettingsFor(options));
    }

    /**
     * Gets the settings the terms are written with for a set of options. Some serializers merge
     * the options anew for every quad, so a run is told apart by the options object the hooks
     * are called with; resolving the settings again is cheap.
     * @param options The merged options of the run.
     * @returns The term settings.
     */
    protected termSettingsFor(options: Required<SerializationOptions>): TermSerializerSettings {
        if (options !== this._termOptions || !this._termSettings) {
            this._termSettings = TermSerializer.settingsOf(
                { supportsPrefixes: this.supportsPrefixes, supportsRdfTypeShorthand: this.supportsRdfTypeShorthand },
                { prefixes: options.prefixes, useRdfTypeShorthand: options.useRdfTypeShorthand }
            );
            this._termOptions = options;
        }

        return this._termSettings;
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