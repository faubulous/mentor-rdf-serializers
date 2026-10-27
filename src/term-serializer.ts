import { RdfSyntax } from '@faubulous/mentor-rdf-parsers';
import { BlankNode, Literal, NamedNode, Term } from '@rdfjs/types';
import { RDF, XSD } from './ontologies';
import { normalizeBlankNodeId } from './utilities/blank-nodes';
import { escapeIri, escapeLocalName, escapeString } from './utilities/escaping';
import { isDecimal, isDouble, isInteger, needsLongString } from './utilities/literals';
import { findPrefix } from './utilities/prefixes';

/**
 * What a syntax allows a term serializer to abbreviate.
 */
export interface TermSerializerCapabilities {
    /**
     * Whether IRIs may be written as prefixed names and numbers, booleans and multi-line
     * strings in their bare or long forms.
     */
    supportsPrefixes: boolean;

    /**
     * Whether `rdf:type` may be written as `a` in predicate position.
     */
    supportsRdfTypeShorthand: boolean;
}

/**
 * Options of a term serializer.
 */
export interface TermSerializerOptions {
    /**
     * Prefix mappings for compact IRI serialization, prefix name to namespace IRI.
     */
    prefixes?: Record<string, string>;

    /**
     * Whether to write `rdf:type` as `a` in predicate position. Default: true.
     */
    useRdfTypeShorthand?: boolean;

    /**
     * The labels to write for blank nodes, by identifier, such as the labels a document already
     * uses. A blank node without one is written as `_:` with its normalized identifier.
     */
    blankNodeLabels?: Record<string, string>;
}

/**
 * Everything the serialization of a term depends on: the capabilities of the syntax and the
 * options of the run, resolved to plain values.
 */
export interface TermSerializerSettings {
    /**
     * Whether IRIs may be written as prefixed names and literals in their bare forms.
     */
    supportsPrefixes: boolean;

    /**
     * Whether `rdf:type` may be written as `a` in predicate position.
     */
    supportsRdfTypeShorthand: boolean;

    /**
     * Prefix name to namespace IRI.
     */
    prefixes: Record<string, string>;

    /**
     * Whether to write `rdf:type` as `a` in predicate position.
     */
    useRdfTypeShorthand: boolean;

    /**
     * The labels to write for blank nodes, by identifier, if any.
     */
    blankNodeLabels?: Record<string, string>;
}

/**
 * Serializes single RDF terms the way a document of a syntax writes them: prefixed names where
 * a prefix is declared, `a` for `rdf:type` in predicate position, bare numbers and booleans, and
 * long strings for multi-line text where the syntax allows it. The quad serializers build on the
 * static methods, which take the settings of a run; the instance methods serve code that writes
 * terms into a document, such as an editor.
 */
export class TermSerializer {
    private readonly _capabilities: TermSerializerCapabilities;

    private _settings: TermSerializerSettings;

    /**
     * Create a term serializer.
     * @param capabilities What the target syntax allows.
     * @param options The serialization options.
     */
    constructor(capabilities: TermSerializerCapabilities, options: TermSerializerOptions = {}) {
        this._capabilities = capabilities;
        this._settings = TermSerializer.settingsOf(capabilities, options);
    }

    /**
     * Create a term serializer for a syntax.
     * @param syntax The syntax the terms are written in.
     * @param options The serialization options.
     * @returns A term serializer with the capabilities of the syntax.
     */
    static forSyntax(syntax: RdfSyntax, options?: TermSerializerOptions): TermSerializer {
        const abbreviates = syntax === RdfSyntax.Turtle || syntax === RdfSyntax.TriG || syntax === RdfSyntax.N3;

        return new TermSerializer({ supportsPrefixes: abbreviates, supportsRdfTypeShorthand: abbreviates }, options);
    }

    /**
     * Resolve capabilities and options to the settings of a run.
     * @param capabilities What the target syntax allows.
     * @param options The serialization options.
     * @returns The settings.
     */
    static settingsOf(capabilities: TermSerializerCapabilities, options: TermSerializerOptions = {}): TermSerializerSettings {
        return {
            supportsPrefixes: capabilities.supportsPrefixes,
            supportsRdfTypeShorthand: capabilities.supportsRdfTypeShorthand,
            prefixes: options.prefixes ?? {},
            useRdfTypeShorthand: options.useRdfTypeShorthand ?? true,
            blankNodeLabels: options.blankNodeLabels
        };
    }

    /**
     * Serialize a named node as a prefixed name when a prefix matches, or as an IRI reference.
     * @param node The named node.
     * @param settings The settings of the run.
     * @param allowTypeShorthand Whether `rdf:type` may be written as `a`, as in predicate position.
     * @returns The serialized node.
     */
    static serializeNamedNode(node: NamedNode, settings: TermSerializerSettings, allowTypeShorthand: boolean = false): string {
        if (allowTypeShorthand && settings.supportsRdfTypeShorthand && settings.useRdfTypeShorthand && node.value === RDF.type) {
            return 'a';
        }

        if (settings.supportsPrefixes) {
            const match = findPrefix(node.value, settings.prefixes);

            if (match) {
                return `${match.prefix}:${escapeLocalName(match.localName)}`;
            }
        }

        return `<${escapeIri(node.value)}>`;
    }

    /**
     * Serialize a blank node with its configured label, or as `_:` with its normalized identifier.
     * @param node The blank node.
     * @param settings The settings of the run.
     * @returns The serialized node.
     */
    static serializeBlankNode(node: BlankNode, settings: TermSerializerSettings): string {
        return settings.blankNodeLabels?.[node.value] ?? `_:${normalizeBlankNodeId(node.value)}`;
    }

    /**
     * Serialize a literal: bare where the syntax allows it and the lexical form is valid for the
     * datatype, quoted with its language tag or datatype otherwise.
     * @param literal The literal.
     * @param settings The settings of the run.
     * @returns The serialized literal.
     */
    static serializeLiteral(literal: Literal, settings: TermSerializerSettings): string {
        const value = literal.value;
        const datatype = literal.datatype?.value;
        const language = literal.language;

        if (language) {
            return `"${escapeString(value)}"@${language}`;
        }

        if (settings.supportsPrefixes) {
            const bare = TermSerializer._serializeBareLiteral(value, datatype);

            if (bare !== undefined) {
                return bare;
            }
        }

        const useLongString = settings.supportsPrefixes && needsLongString(value);
        const quote = useLongString ? '"""' : '"';
        const quoted = `${quote}${escapeString(value, useLongString)}${quote}`;

        if (!datatype || datatype === XSD.string) {
            return quoted;
        }

        return `${quoted}^^${TermSerializer.serializeNamedNode(literal.datatype, settings)}`;
    }

    /**
     * Write a number or boolean without quotes when the lexical form is valid for the datatype.
     * @param value The lexical value.
     * @param datatype The datatype IRI, if any.
     * @returns The bare form, or `undefined` if the literal has to be quoted.
     */
    private static _serializeBareLiteral(value: string, datatype: string | undefined): string | undefined {
        if (datatype === XSD.boolean && (value === 'true' || value === 'false' || value === '1' || value === '0')) {
            return value === 'true' || value === '1' ? 'true' : 'false';
        }

        if (datatype === XSD.integer && isInteger(value)) {
            return value;
        }

        if (datatype === XSD.decimal && isDecimal(value)) {
            return value;
        }

        if (datatype === XSD.double && isDouble(value)) {
            return value;
        }

        return undefined;
    }

    /**
     * Change the options the terms are written with, keeping the capabilities of the syntax.
     * @param options The serialization options.
     * @returns This serializer.
     */
    configure(options: TermSerializerOptions): this {
        this._settings = TermSerializer.settingsOf(this._capabilities, options);

        return this;
    }

    /**
     * Whether the syntax allows prefixed names and bare literals.
     */
    get abbreviates(): boolean {
        return this._settings.supportsPrefixes;
    }

    /**
     * Serialize a term in subject position.
     * @param term The subject term.
     * @returns The serialized term.
     * @throws An error if the term cannot be a subject.
     */
    serializeSubject(term: Term): string {
        if (term.termType === 'Literal') {
            throw new Error('A literal cannot be the subject of a statement.');
        }

        return this.serializeObject(term);
    }

    /**
     * Serialize a term in predicate position, where `rdf:type` may be written as `a`.
     * @param term The predicate term.
     * @returns The serialized term.
     */
    serializePredicate(term: NamedNode): string {
        return TermSerializer.serializeNamedNode(term, this._settings, true);
    }

    /**
     * Serialize a term in object position.
     * @param term The object term.
     * @returns The serialized term.
     * @throws An error if the term type cannot be written.
     */
    serializeObject(term: Term): string {
        switch (term.termType) {
            case 'NamedNode':
                return this.serializeNamedNode(term as NamedNode);
            case 'BlankNode':
                return this.serializeBlankNode(term as BlankNode);
            case 'Literal':
                return this.serializeLiteral(term as Literal);
            default:
                throw new Error(`A term of type ${term.termType} cannot be written as a single term.`);
        }
    }

    /**
     * Serialize a named node as a prefixed name when a prefix matches, or as an IRI reference.
     * @param node The named node.
     * @param allowTypeShorthand Whether `rdf:type` may be written as `a`, as in predicate position.
     * @returns The serialized node.
     */
    serializeNamedNode(node: NamedNode, allowTypeShorthand: boolean = false): string {
        return TermSerializer.serializeNamedNode(node, this._settings, allowTypeShorthand);
    }

    /**
     * Serialize a blank node with its configured label, or as `_:` with its normalized identifier.
     * @param node The blank node.
     * @returns The serialized node.
     */
    serializeBlankNode(node: BlankNode): string {
        return TermSerializer.serializeBlankNode(node, this._settings);
    }

    /**
     * Serialize a literal: bare where the syntax allows it and the lexical form is valid for the
     * datatype, quoted with its language tag or datatype otherwise.
     * @param literal The literal.
     * @returns The serialized literal.
     */
    serializeLiteral(literal: Literal): string {
        return TermSerializer.serializeLiteral(literal, this._settings);
    }
}
