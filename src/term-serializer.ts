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
 * Serializes single RDF terms the way a document of a syntax writes them: prefixed names where
 * a prefix is declared, `a` for `rdf:type` in predicate position, bare numbers and booleans, and
 * long strings for multi-line text where the syntax allows it. The quad serializers build on it,
 * and so can any code that writes a term into existing text.
 */
export class TermSerializer {
    private readonly _prefixes: Record<string, string>;

    private readonly _useRdfTypeShorthand: boolean;

    private readonly _blankNodeLabels: Record<string, string>;

    /**
     * Create a term serializer.
     * @param capabilities What the target syntax allows.
     * @param options The serialization options.
     */
    constructor(private readonly _capabilities: TermSerializerCapabilities, options: TermSerializerOptions = {}) {
        this._prefixes = options.prefixes ?? {};
        this._useRdfTypeShorthand = options.useRdfTypeShorthand ?? true;
        this._blankNodeLabels = options.blankNodeLabels ?? {};
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
     * Whether the syntax allows prefixed names and bare literals.
     */
    get abbreviates(): boolean {
        return this._capabilities.supportsPrefixes;
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
        return this.serializeNamedNode(term, true);
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
        if (allowTypeShorthand && this._capabilities.supportsRdfTypeShorthand && this._useRdfTypeShorthand && node.value === RDF.type) {
            return 'a';
        }

        if (this._capabilities.supportsPrefixes) {
            const match = findPrefix(node.value, this._prefixes);

            if (match) {
                return `${match.prefix}:${escapeLocalName(match.localName)}`;
            }
        }

        return `<${escapeIri(node.value)}>`;
    }

    /**
     * Serialize a blank node with its configured label, or as `_:` with its normalized identifier.
     * @param node The blank node.
     * @returns The serialized node.
     */
    serializeBlankNode(node: BlankNode): string {
        return this._blankNodeLabels[node.value] ?? `_:${normalizeBlankNodeId(node.value)}`;
    }

    /**
     * Serialize a literal: bare where the syntax allows it and the lexical form is valid for the
     * datatype, quoted with its language tag or datatype otherwise.
     * @param literal The literal.
     * @returns The serialized literal.
     */
    serializeLiteral(literal: Literal): string {
        if (literal.language) {
            return `"${escapeString(literal.value)}"@${literal.language}`;
        }

        const bare = this._serializeBareLiteral(literal);

        if (bare !== undefined) {
            return bare;
        }

        const useLongString = this._capabilities.supportsPrefixes && needsLongString(literal.value);
        const quote = useLongString ? '"""' : '"';
        const quoted = `${quote}${escapeString(literal.value, useLongString)}${quote}`;
        const datatype = literal.datatype?.value;

        if (!datatype || datatype === XSD.string) {
            return quoted;
        }

        return `${quoted}^^${this.serializeNamedNode(literal.datatype)}`;
    }

    /**
     * Write a number or boolean without quotes when the syntax allows it and the lexical form is
     * valid for the datatype.
     * @param literal The literal.
     * @returns The bare form, or `undefined` if the literal has to be quoted.
     */
    private _serializeBareLiteral(literal: Literal): string | undefined {
        if (!this._capabilities.supportsPrefixes) {
            return undefined;
        }

        const { value } = literal;
        const datatype = literal.datatype?.value;

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
}
