import type { BlankNode, NamedNode, Quad } from '@rdfjs/types';
import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { Rdf12Quad, TripleTerm } from '@src/utilities/types';
import { SerializerBase } from '@src/serializer-base';
import { SerializationResult } from '@src/serialization-result';
import { SerializerOptions } from '@src/serializer-options';
import { hasAnnotations, hasReifier, groupQuadsBySubjectPredicate } from '@src/utilities/quads';

/**
 * Serializer for Turtle format (RDF 1.2 compatible).
 * 
 * Turtle is a human-readable format for RDF graphs with support for:
 * - Prefix declarations for compact IRIs
 * - Subject grouping with predicate-object lists
 * - Object lists for shared subject-predicate
 * - Blank node property lists
 * - Collections (RDF lists)
 * - Numeric and boolean literal shortcuts
 * - The 'a' shorthand for rdf:type
 * 
 * RDF 1.2 adds support for:
 * - Triple terms: <<( subject predicate object )>>
 * - Reified triples: << subject predicate object >> or << ... ~ reifierId >>
 * - Annotations: {| predicate object |}
 * - Base direction for language tags: @en--ltr, @ar--rtl
 * 
 * @see https://www.w3.org/TR/rdf12-turtle/
 */
export class TurtleSerializer extends SerializerBase {
    readonly syntax: RdfSyntax = RdfSyntax.Turtle;

    constructor() {
        super();
        this.supportsPrefixes = true;
        this.supportsRdfTypeShorthand = true;
        this.supportsRdf12 = true;
    }

    /**
     * Serializes a single quad/triple to Turtle format.
     * Note: For full Turtle formatting with grouping, use serialize().
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string {
        const opts = this.getOptions(options);

        const subject = this.serializeTerm(quad.subject, opts);
        const predicate = this.serializeTerm(quad.predicate, opts);
        const object = this.serializeTerm(quad.object, opts);

        let result = `${subject} ${predicate} ${object}`;

        // Add annotations if present (RDF 1.2)
        if (hasAnnotations(quad)) {
            result += ' ' + this.serializeAnnotations(quad.annotations!, opts);
        }

        // Add reifier if present (RDF 1.2)
        if (hasReifier(quad)) {
            result = `<< ${result} >> ~ ${this.serializeTerm(quad.reifier!, opts)}`;
        }

        return result + ' .';
    }

    /**
     * Serializes multiple quads to Turtle format with full formatting.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string {
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

        // Serialize quads grouped by subject
        if (opts.groupBySubject) {
            const grouped = groupQuadsBySubjectPredicate(quadArray);
            parts.push(this.serializeGrouped(grouped, opts));
        } else {
            for (const quad of quadArray) {
                // Skip quads with named graphs in Turtle
                if (quad.graph && quad.graph.termType !== 'DefaultGraph') {
                    continue;
                }
                parts.push(this.serializeQuad(quad, opts));
            }
        }

        return parts.join(opts.lineEnd);
    }

    /**
     * Serializes grouped quads with subject and predicate grouping.
     */
    private serializeGrouped(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        opts: Required<SerializerOptions>
    ): string {
        const parts: string[] = [];
        const indent = opts.prettyPrint ? opts.indent : '';
        const lineEnd = opts.prettyPrint ? opts.lineEnd : ' ';

        // Build inline blank node map if using auto/inline style
        const inlineBlankNodes = this.findInlineBlankNodes(grouped, opts);

        // Calculate alignment widths if requested
        const alignWidth = opts.alignPredicates ? this.calculatePredicateWidth(grouped, opts) : 0;

        let firstSubject = true;
        for (const [_subjectKey, predicateMap] of grouped) {
            // Get the first quad to access the subject term
            const firstQuad = predicateMap.values().next().value![0];

            // Skip quads with named graphs in Turtle
            if (firstQuad.graph && firstQuad.graph.termType !== 'DefaultGraph') {
                continue;
            }

            // Skip blank nodes that will be serialized inline
            if (firstQuad.subject.termType === 'BlankNode' && inlineBlankNodes.has(firstQuad.subject.value)) {
                continue;
            }

            if (!firstSubject && opts.prettyPrint && opts.blankLinesBetweenSubjects) {
                parts.push(''); // Blank line between subjects
            }
            firstSubject = false;

            const subjectBlock = this.serializeSubjectBlock(
                firstQuad.subject as NamedNode | BlankNode | TripleTerm,
                predicateMap,
                opts,
                indent,
                lineEnd,
                alignWidth,
                inlineBlankNodes
            );
            parts.push(subjectBlock);
        }

        return parts.join(opts.lineEnd);
    }

    /**
     * Finds blank nodes that can be serialized inline (only referenced once as object).
     */
    private findInlineBlankNodes(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        opts: Required<SerializerOptions>
    ): Map<string, Map<string, Array<Quad | Rdf12Quad>>> {
        if (opts.blankNodeStyle === 'labeled') {
            return new Map();
        }

        const blankNodeRefs = new Map<string, number>();
        const blankNodeDefs = new Map<string, Map<string, Array<Quad | Rdf12Quad>>>();

        // Count references to blank nodes as objects and collect their definitions
        for (const [subjectKey, predicateMap] of grouped) {
            const firstQuad = predicateMap.values().next().value![0];

            // Track blank node definitions
            if (firstQuad.subject.termType === 'BlankNode') {
                blankNodeDefs.set(firstQuad.subject.value, predicateMap);
            }

            // Count references as objects
            for (const quads of predicateMap.values()) {
                for (const quad of quads) {
                    if (quad.object.termType === 'BlankNode') {
                        const count = blankNodeRefs.get(quad.object.value) || 0;
                        blankNodeRefs.set(quad.object.value, count + 1);
                    }
                }
            }
        }

        // Keep only blank nodes referenced exactly once
        const inlineBlankNodes = new Map<string, Map<string, Array<Quad | Rdf12Quad>>>();
        for (const [bnodeId, predicateMap] of blankNodeDefs) {
            const refCount = blankNodeRefs.get(bnodeId) || 0;
            if (refCount === 1) {
                inlineBlankNodes.set(bnodeId, predicateMap);
            }
        }

        return inlineBlankNodes;
    }

    /**
     * Calculates the maximum predicate width for alignment.
     */
    private calculatePredicateWidth(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        opts: Required<SerializerOptions>
    ): number {
        let maxWidth = 0;
        for (const predicateMap of grouped.values()) {
            for (const quads of predicateMap.values()) {
                const predicate = this.serializeTerm(quads[0].predicate, opts);
                maxWidth = Math.max(maxWidth, predicate.length);
            }
        }
        return maxWidth;
    }

    /**
     * Serializes a subject block with all its predicates and objects.
     */
    private serializeSubjectBlock(
        subject: NamedNode | BlankNode | TripleTerm,
        predicateMap: Map<string, Array<Quad | Rdf12Quad>>,
        opts: Required<SerializerOptions>,
        indent: string,
        lineEnd: string,
        alignWidth: number,
        inlineBlankNodes: Map<string, Map<string, Array<Quad | Rdf12Quad>>>
    ): string {
        const subjectStr = this.serializeTerm(subject, opts);
        const predicateParts: string[] = [];
        const predicateEntries = Array.from(predicateMap.entries());

        for (let i = 0; i < predicateEntries.length; i++) {
            const [_predicateKey, quads] = predicateEntries[i];
            const isFirst = i === 0;
            const isLast = i === predicateEntries.length - 1;

            let predicateStr = this.serializeTerm(quads[0].predicate, opts);

            // Pad predicate for alignment
            if (alignWidth > 0) {
                predicateStr = predicateStr.padEnd(alignWidth);
            }

            // Serialize objects
            const objectStrs = quads.map(q => this.serializeObjectWithInlineBlankNode(q, opts, inlineBlankNodes, indent));
            const objectList = this.formatObjectList(objectStrs, opts, indent, subjectStr.length + predicateStr.length + 2);

            if (isFirst) {
                if (opts.predicateListStyle === 'multi-line' && predicateEntries.length > 1) {
                    predicateParts.push(subjectStr);
                    predicateParts.push(`${indent}${predicateStr} ${objectList}`);
                } else {
                    predicateParts.push(`${subjectStr} ${predicateStr} ${objectList}`);
                }
            } else {
                predicateParts.push(`${indent}${predicateStr} ${objectList}`);
            }
        }

        // Join predicates based on style
        const separator = opts.predicateListStyle === 'single-line' ? ' ; ' : ' ;' + lineEnd;
        return predicateParts.join(separator) + ' .';
    }

    /**
     * Serializes an object, potentially inlining blank nodes.
     */
    private serializeObjectWithInlineBlankNode(
        quad: Quad | Rdf12Quad,
        opts: Required<SerializerOptions>,
        inlineBlankNodes: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        indent: string
    ): string {
        // Check if object is an inline blank node
        if (quad.object.termType === 'BlankNode' && inlineBlankNodes.has(quad.object.value)) {
            const bnodePredicateMap = inlineBlankNodes.get(quad.object.value)!;
            return this.serializeInlineBlankNode(bnodePredicateMap, opts, indent);
        }

        let result = this.serializeTerm(quad.object, opts);

        if (hasAnnotations(quad)) {
            result += ' ' + this.serializeAnnotations((quad as Rdf12Quad).annotations!, opts);
        }

        return result;
    }

    /**
     * Serializes a blank node inline using property list syntax: [ prop value ; ... ]
     */
    private serializeInlineBlankNode(
        predicateMap: Map<string, Array<Quad | Rdf12Quad>>,
        opts: Required<SerializerOptions>,
        baseIndent: string
    ): string {
        const innerIndent = baseIndent + opts.indent;
        const predicateEntries = Array.from(predicateMap.entries());

        // For single predicate with single object, use compact form
        if (predicateEntries.length === 1 && predicateEntries[0][1].length === 1) {
            const quad = predicateEntries[0][1][0];
            const predicate = this.serializeTerm(quad.predicate, opts);
            const object = this.serializeTerm(quad.object, opts);
            return `[ ${predicate} ${object} ]`;
        }

        // Multi-line form for complex blank nodes
        const parts: string[] = ['['];
        for (let i = 0; i < predicateEntries.length; i++) {
            const [_predicateKey, quads] = predicateEntries[i];
            const predicate = this.serializeTerm(quads[0].predicate, opts);
            const objects = quads.map(q => this.serializeTerm(q.object, opts));
            const suffix = i < predicateEntries.length - 1 ? ' ;' : '';
            parts.push(`${innerIndent}${predicate} ${objects.join(' , ')}${suffix}`);
        }
        parts.push(`${baseIndent}]`);

        return parts.join(opts.lineEnd);
    }

    /**
     * Formats an object list based on style and line width settings.
     */
    private formatObjectList(
        objects: string[],
        opts: Required<SerializerOptions>,
        indent: string,
        lineOffset: number
    ): string {
        if (objects.length === 1) {
            return objects[0];
        }

        const singleLine = objects.join(' , ');

        // Check which style to use
        if (opts.objectListStyle === 'single-line') {
            return singleLine;
        }

        if (opts.objectListStyle === 'multi-line') {
            return this.formatMultiLineObjects(objects, opts, indent);
        }

        // Auto mode: check line width
        if (opts.maxLineWidth > 0) {
            const totalWidth = lineOffset + singleLine.length;
            if (totalWidth > opts.maxLineWidth) {
                return this.formatMultiLineObjects(objects, opts, indent);
            }
        }

        return singleLine;
    }

    /**
     * Formats objects on multiple lines.
     */
    private formatMultiLineObjects(
        objects: string[],
        opts: Required<SerializerOptions>,
        indent: string
    ): string {
        const lineEnd = opts.lineEnd;
        const objectIndent = indent + opts.indent;
        const parts = objects.map((obj, i) => {
            const suffix = i < objects.length - 1 ? ' ,' : '';
            return i === 0 ? obj + suffix : `${objectIndent}${obj}${suffix}`;
        });
        return parts.join(lineEnd);
    }

    /**
     * Serializes an object with its annotations if present.
     */
    private serializeObjectWithAnnotations(
        quad: Quad | Rdf12Quad,
        opts: Required<SerializerOptions>
    ): string {
        let result = this.serializeTerm(quad.object, opts);

        if (hasAnnotations(quad)) {
            result += ' ' + this.serializeAnnotations((quad as Rdf12Quad).annotations!, opts);
        }

        return result;
    }

    /**
     * Serializes RDF 1.2 annotations.
     * Syntax: {| predicate object ; ... |}
     */
    private serializeAnnotations(
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
     * Serializes a reified triple (RDF 1.2).
     * Syntax: << subject predicate object >> or << subject predicate object ~ reifierId >>
     */
    protected serializeReifiedTriple(
        subject: NamedNode | BlankNode | TripleTerm,
        predicate: NamedNode,
        object: NamedNode | BlankNode | TripleTerm,
        reifier: NamedNode | BlankNode | undefined,
        opts: Required<SerializerOptions>
    ): string {
        const s = this.serializeTerm(subject, opts);
        const p = this.serializeTerm(predicate, opts);
        const o = this.serializeTerm(object, opts);

        if (reifier) {
            const r = this.serializeTerm(reifier, opts);
            return `<< ${s} ${p} ${o} ~ ${r} >>`;
        }

        return `<< ${s} ${p} ${o} >>`;
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
                warnings.push(`Named graph ignored: Turtle does not support named graphs. Use TriG instead.`);
                break;
            }
        }

        return {
            output: this.serialize(quads, options),
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}
