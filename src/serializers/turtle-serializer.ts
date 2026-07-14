import type { BlankNode, NamedNode, Quad } from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { RdfSyntax } from "@faubulous/mentor-rdf-parsers";
import { RDF } from '../ontologies';
import { Rdf12Quad, TripleTerm } from '../utilities/types';
import { QuadSerializerBase } from '../quad-serializer-base';
import { SerializationResult } from '../serialization-result';
import { SerializationOptions } from '../serialization-options';
import { hasAnnotations, hasReifier, groupQuadsBySubjectPredicate } from '../utilities/quads';

/**
 * Predicate grouping keys of the RDF list vocabulary, as produced by `termToString`.
 */
const RDF_FIRST_KEY = `<${RDF.first}>`;
const RDF_REST_KEY = `<${RDF.rest}>`;

/**
 * Blank node usage statistics collected over the grouped quads.
 */
interface BlankNodeUsage {
    blankNodeRefs: Map<string, number>;
    blankNodeDefs: Map<string, Map<string, Array<Quad | Rdf12Quad>>>;
    /**
     * The last subject referencing each blank node at an object position.
     * Unique for blank nodes with a reference count of one, which is the only
     * case it is consulted for (inline cycle detection).
     */
    blankNodeReferrers: Map<string, Quad['subject'] | TripleTerm>;
}

/**
 * Per-serialization state for rendering blank nodes inline: single-use blank
 * nodes as `[ ... ]` property lists and well-formed RDF lists as `( ... )`
 * collections. Blank node ids in `collectionNodes` are consumed by a
 * collection and must not be emitted as top-level subjects or `[ ... ]`.
 */
interface InlineState {
    inlineBlankNodes: Map<string, Map<string, Array<Quad | Rdf12Quad>>>;
    collections: Map<string, Array<Quad | Rdf12Quad>>;
    collectionNodes: Set<string>;
}

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
export class TurtleSerializer extends QuadSerializerBase {
    readonly syntax: RdfSyntax = RdfSyntax.Turtle;

    constructor() {
        super();
        this.supportsPrefixes = true;
        this.supportsRdfTypeShorthand = true;
        this.supportsRdf12 = true;
    }

    /**
     * Returns a punctuation mark (`;`, `,`, `.`) prefixed with a space unless
     * `spaceBeforePunctuation` is disabled.
     */
    private punctuation(opts: Required<SerializationOptions>, mark: string): string {
        return opts.spaceBeforePunctuation ? ` ${mark}` : mark;
    }

    /**
     * Serializes a single quad/triple to Turtle format.
     * Note: For full Turtle formatting with grouping, use serialize().
     */
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializationOptions): string {
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

        return result + this.punctuation(opts, '.');
    }

    /**
     * Serializes multiple quads to Turtle format with full formatting.
     */
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): string {
        const opts = this.getOptions(options);
        // Turtle has no named graphs, so drop any quad outside the default graph
        // up front. Doing it here (rather than while emitting) keeps the grouped
        // path correct: grouping is by subject+predicate and is graph-agnostic,
        // so a subject with triples in both the default graph and a named graph
        // would otherwise be skipped or kept wholesale based on whichever quad
        // happened to group first. Use TriG to retain named graphs.
        let quadArray = Array.from(quads).filter(quad => !quad.graph || quad.graph.termType === 'DefaultGraph');

        if (quadArray.length === 0) {
            return '';
        }

        if (opts.relabelBlankNodes) {
            quadArray = this.relabelQuads(quadArray, opts);
        }

        const parts: string[] = [];

        if (opts.emitDirectives) {
            // Add base declaration if provided
            if (opts.baseIri) {
                const isTurtle = opts.directiveStyle === 'turtle';
                const baseKeyword = isTurtle ? '@base' : (opts.directiveStyle === 'sparql-lowercase' ? 'base' : 'BASE');
                const terminator = isTurtle ? this.punctuation(opts, '.') : '';
                parts.push(`${baseKeyword} <${opts.baseIri}>${terminator}`);
            }

            // Add prefix declarations
            for (const [prefix, namespace] of Object.entries(opts.prefixes)) {
                const isTurtle = opts.directiveStyle === 'turtle';
                const prefixKeyword = isTurtle ? '@prefix' : (opts.directiveStyle === 'sparql-lowercase' ? 'prefix' : 'PREFIX');
                const terminator = isTurtle ? this.punctuation(opts, '.') : '';
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
        opts: Required<SerializationOptions>
    ): string {
        const parts: string[] = [];
        const indent = opts.prettyPrint ? opts.indent : '';
        const lineEnd = opts.prettyPrint ? opts.lineEnd : ' ';

        // Build the inline rendering state: RDF lists first, then single-use
        // blank nodes (excluding the list nodes consumed by collections).
        const blankNodeUsage = this.collectBlankNodeUsage(grouped);
        const { collections, collectionNodes } = this.findCollections(blankNodeUsage, opts);
        const inlineBlankNodes = this.findInlineBlankNodes(blankNodeUsage, opts, collectionNodes);
        const state: InlineState = { inlineBlankNodes, collections, collectionNodes };

        // Calculate alignment widths if requested
        const alignWidth = opts.alignPredicates ? this.calculatePredicateWidth(grouped, opts) : 0;

        let firstSubject = true;
        for (const [_subjectKey, predicateMap] of grouped) {
            // Get the first quad to access the subject term
            const firstQuad = predicateMap.values().next().value![0];

            // Skip blank nodes that will be serialized inline
            if (firstQuad.subject.termType === 'BlankNode' && inlineBlankNodes.has(firstQuad.subject.value)) {
                continue;
            }

            // Skip list nodes that are consumed by a collection
            if (firstQuad.subject.termType === 'BlankNode' && collectionNodes.has(firstQuad.subject.value)) {
                continue;
            }

            if (!firstSubject && opts.prettyPrint && opts.blankLinesBetweenSubjects) {
                parts.push(''); // Blank line between subjects
            }
            firstSubject = false;

            let subjectBlock: string;

            // Keep unreferenced root blank-node subjects anonymous (`[ ... ]`) when
            // single-use inlining is enabled to avoid noisy top-level labels.
            if (
                firstQuad.subject.termType === 'BlankNode'
                && this.canInlineSingleUseBlankNodes(opts)
                && (blankNodeUsage.blankNodeRefs.get(firstQuad.subject.value) || 0) === 0
            ) {
                subjectBlock = `${this.serializeInlineBlankNode(predicateMap, opts, '', state, new Set())} .`;
            } else {
                subjectBlock = this.serializeSubjectBlock(
                    firstQuad.subject as NamedNode | BlankNode | TripleTerm,
                    predicateMap,
                    opts,
                    indent,
                    lineEnd,
                    alignWidth,
                    state
                );
            }

            parts.push(subjectBlock);
        }

        return parts.join(opts.lineEnd);
    }

    /**
     * Rewrites all blank node subjects, objects and reifiers with labels from
     * `blankNodeIdGenerator`, assigned in first-appearance order. Blank nodes
     * nested inside triple terms are left untouched.
     */
    private relabelQuads(
        quads: Array<Quad | Rdf12Quad>,
        opts: Required<SerializationOptions>
    ): Array<Quad | Rdf12Quad> {
        const labels = new Map<string, string>();
        let counter = 0;

        const rename = <T>(term: T): T => {
            const candidate = term as unknown as { termType?: string; value?: string };

            if (candidate?.termType !== 'BlankNode' || candidate.value === undefined) {
                return term;
            }

            let label = labels.get(candidate.value);

            if (label === undefined) {
                label = opts.blankNodeIdGenerator(counter++);
                labels.set(candidate.value, label);
            }

            return DataFactory.blankNode(label) as unknown as T;
        };

        const renameQuad = (quad: Quad | Rdf12Quad): Rdf12Quad => {
            const source = quad as Rdf12Quad;

            return {
                termType: 'Quad',
                subject: rename(source.subject),
                predicate: source.predicate,
                object: rename(source.object),
                graph: source.graph,
                ...(source.annotations ? { annotations: source.annotations.map(renameQuad) } : {}),
                ...(source.reifier ? { reifier: rename(source.reifier) } : {}),
            };
        };

        return quads.map(renameQuad);
    }

    private collectBlankNodeUsage(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>
    ): BlankNodeUsage {
        const blankNodeRefs = new Map<string, number>();
        const blankNodeDefs = new Map<string, Map<string, Array<Quad | Rdf12Quad>>>();
        const blankNodeReferrers = new Map<string, Quad['subject'] | TripleTerm>();

        // Count references to blank nodes as objects and collect their definitions.
        for (const [, predicateMap] of grouped) {
            const firstQuad = predicateMap.values().next().value![0];

            if (firstQuad.subject.termType === 'BlankNode') {
                blankNodeDefs.set(firstQuad.subject.value, predicateMap);
            }

            for (const quads of predicateMap.values()) {
                for (const quad of quads) {
                    if (quad.object.termType === 'BlankNode') {
                        const count = blankNodeRefs.get(quad.object.value) || 0;
                        blankNodeRefs.set(quad.object.value, count + 1);
                        blankNodeReferrers.set(quad.object.value, quad.subject);
                    }
                }
            }
        }

        return { blankNodeRefs, blankNodeDefs, blankNodeReferrers };
    }

    private canInlineSingleUseBlankNodes(opts: Required<SerializationOptions>): boolean {
        if (opts.blankNodeStyle === 'labeled') {
            return false;
        }

        return opts.prettyPrint && opts.inlineSingleUseBlankNodes;
    }

    private canInlineCollections(opts: Required<SerializationOptions>): boolean {
        if (opts.blankNodeStyle === 'labeled') {
            return false;
        }

        return opts.prettyPrint && opts.inlineCollections;
    }

    /**
     * Finds well-formed RDF lists that can be serialized using collection
     * syntax (`( ... )`).
     *
     * The detection is deliberately conservative — collection syntax cannot
     * carry extra triples, so any list node with additional predicates,
     * duplicate rdf:first/rdf:rest statements, annotations or reifiers, any
     * shared or cyclic chain, and any head that is not referenced exactly once
     * as an object falls back to regular blank node serialization. In
     * particular, a list used as a top-level subject (`( ... ) :p :o`) keeps
     * its blank node form.
     *
     * @returns The ordered rdf:first quads per list head, and the set of all
     * blank node ids consumed by a detected collection.
     */
    private findCollections(
        usage: BlankNodeUsage,
        opts: Required<SerializationOptions>
    ): { collections: Map<string, Array<Quad | Rdf12Quad>>; collectionNodes: Set<string> } {
        const collections = new Map<string, Array<Quad | Rdf12Quad>>();
        const collectionNodes = new Set<string>();

        if (!this.canInlineCollections(opts)) {
            return { collections, collectionNodes };
        }

        // Candidate list nodes: exactly one rdf:first and one rdf:rest
        // statement, and nothing else.
        const candidates = new Map<string, { first: Quad | Rdf12Quad; rest: Quad | Rdf12Quad }>();
        const restTargets = new Set<string>();

        for (const [bnodeId, predicateMap] of usage.blankNodeDefs) {
            if (predicateMap.size !== 2) {
                continue;
            }

            const firstQuads = predicateMap.get(RDF_FIRST_KEY);
            const restQuads = predicateMap.get(RDF_REST_KEY);

            if (firstQuads?.length !== 1 || restQuads?.length !== 1) {
                continue;
            }

            const first = firstQuads[0];
            const rest = restQuads[0];

            if (hasAnnotations(first) || hasReifier(first) || hasAnnotations(rest) || hasReifier(rest)) {
                continue;
            }

            candidates.set(bnodeId, { first, rest });

            if (rest.object.termType === 'BlankNode') {
                restTargets.add(rest.object.value);
            }
        }

        for (const headId of candidates.keys()) {
            // Interior nodes of another chain are handled via their head.
            if (restTargets.has(headId)) {
                continue;
            }

            // The head must be referenced exactly once, at an object position.
            if ((usage.blankNodeRefs.get(headId) || 0) !== 1) {
                continue;
            }

            const itemQuads: Array<Quad | Rdf12Quad> = [];
            const chain: string[] = [];
            const visited = new Set<string>();

            let nodeId: string | undefined = headId;
            let wellFormed = false;

            while (nodeId !== undefined) {
                // A cycle in the rdf:rest chain.
                if (visited.has(nodeId)) {
                    break;
                }

                const node = candidates.get(nodeId);

                // An interior node that is not a well-formed list node.
                if (!node) {
                    break;
                }

                // An interior node with additional references (a shared tail).
                if (nodeId !== headId && (usage.blankNodeRefs.get(nodeId) || 0) !== 1) {
                    break;
                }

                visited.add(nodeId);
                chain.push(nodeId);
                itemQuads.push(node.first);

                const restObject = node.rest.object;

                if (restObject.termType === 'NamedNode' && restObject.value === RDF.nil) {
                    wellFormed = true;
                    nodeId = undefined;
                } else if (restObject.termType === 'BlankNode') {
                    nodeId = restObject.value;
                } else {
                    // Malformed rdf:rest (literal or an IRI other than rdf:nil).
                    break;
                }
            }

            if (wellFormed) {
                collections.set(headId, itemQuads);

                for (const id of chain) {
                    collectionNodes.add(id);
                }
            }
        }

        return { collections, collectionNodes };
    }

    /**
     * Finds blank nodes that can be serialized inline (only referenced once as
     * object). Blank node ids in `excluded` — the list nodes consumed by
     * collections — are never inlined as property lists.
     */
    private findInlineBlankNodes(
        usage: BlankNodeUsage,
        opts: Required<SerializationOptions>,
        excluded: ReadonlySet<string>
    ): Map<string, Map<string, Array<Quad | Rdf12Quad>>> {
        if (!this.canInlineSingleUseBlankNodes(opts)) {
            return new Map();
        }

        // Keep only blank nodes referenced exactly once
        const inlineBlankNodes = new Map<string, Map<string, Array<Quad | Rdf12Quad>>>();
        for (const [bnodeId, predicateMap] of usage.blankNodeDefs) {
            const refCount = usage.blankNodeRefs.get(bnodeId) || 0;
            if (refCount === 1 && !excluded.has(bnodeId)) {
                inlineBlankNodes.set(bnodeId, predicateMap);
            }
        }

        // Prune reference cycles: mutually-referencing single-use blank nodes
        // would all be skipped at the top level (each expecting to be inlined
        // in the other), silently dropping their triples. Walk each
        // candidate's unique referrer chain; when it loops back, keep the
        // nodes on the path as labeled top-level subjects instead.
        const isSkippable = (id: string) => inlineBlankNodes.has(id) || excluded.has(id);

        for (const bnodeId of [...inlineBlankNodes.keys()]) {
            const path = new Set<string>([bnodeId]);
            let referrer = usage.blankNodeReferrers.get(bnodeId);

            while (referrer && referrer.termType === 'BlankNode' && isSkippable(referrer.value)) {
                if (path.has(referrer.value)) {
                    for (const id of path) {
                        inlineBlankNodes.delete(id);
                    }
                    break;
                }

                path.add(referrer.value);
                referrer = usage.blankNodeReferrers.get(referrer.value);
            }
        }

        return inlineBlankNodes;
    }

    /**
     * Calculates the maximum predicate width for alignment.
     */
    private calculatePredicateWidth(
        grouped: Map<string, Map<string, Array<Quad | Rdf12Quad>>>,
        opts: Required<SerializationOptions>
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
        opts: Required<SerializationOptions>,
        indent: string,
        lineEnd: string,
        alignWidth: number,
        state: InlineState
    ): string {
        const subjectStr = this.serializeTerm(subject, opts);
        const predicateParts: string[] = [];
        const predicateEntries = Array.from(predicateMap.entries());

        for (let i = 0; i < predicateEntries.length; i++) {
            const [_predicateKey, quads] = predicateEntries[i];
            const isFirst = i === 0;

            let predicateStr = this.serializeTerm(quads[0].predicate, opts);

            // Pad predicate for alignment
            if (alignWidth > 0) {
                predicateStr = predicateStr.padEnd(alignWidth);
            }

            // Serialize objects
            const objectStrs = quads.map(q => this.serializeObjectWithInlineBlankNode(q, opts, state, indent));
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
        const separator = opts.predicateListStyle === 'single-line'
            ? `${this.punctuation(opts, ';')} `
            : this.punctuation(opts, ';') + lineEnd;
        return predicateParts.join(separator) + this.punctuation(opts, '.');
    }

    /**
     * Serializes an object, potentially inlining blank nodes.
     */
    private serializeObjectWithInlineBlankNode(
        quad: Quad | Rdf12Quad,
        opts: Required<SerializationOptions>,
        state: InlineState,
        indent: string
    ): string {
        let result = this.serializeTermWithInlineBlankNodes(
            quad.object,
            opts,
            state,
            indent,
            new Set()
        );

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
        opts: Required<SerializationOptions>,
        baseIndent: string,
        state: InlineState,
        visiting: Set<string>
    ): string {
        const innerIndent = baseIndent + opts.indent;
        const predicateEntries = Array.from(predicateMap.entries());

        // For single predicate with single object, use compact form
        if (predicateEntries.length === 1 && predicateEntries[0][1].length === 1) {
            const quad = predicateEntries[0][1][0];
            const predicate = this.serializeTerm(quad.predicate, opts);
            const object = this.serializeTermWithInlineBlankNodes(
                quad.object,
                opts,
                state,
                innerIndent,
                visiting
            );
            return `[ ${predicate} ${object} ]`;
        }

        // Multi-line form for complex blank nodes
        const parts: string[] = ['['];
        const inlineParts: string[] = [];

        for (let i = 0; i < predicateEntries.length; i++) {
            const [_predicateKey, quads] = predicateEntries[i];
            const predicate = this.serializeTerm(quads[0].predicate, opts);
            const objects = quads.map(q => this.serializeTermWithInlineBlankNodes(
                q.object,
                opts,
                state,
                innerIndent,
                visiting
            ));
            const suffix = i < predicateEntries.length - 1 ? this.punctuation(opts, ';') : '';
            const objectSep = `${this.punctuation(opts, ',')} `;
            parts.push(`${innerIndent}${predicate} ${objects.join(objectSep)}${suffix}`);
            inlineParts.push(`${predicate} ${objects.join(objectSep)}${suffix}`);
        }
        parts.push(`${baseIndent}]`);

        // Try single-line form when maxLineWidth allows.
        if (opts.maxLineWidth > 0) {
            const trialInline = `[ ${inlineParts.join(' ')} ]`;
            if (baseIndent.length + trialInline.length <= opts.maxLineWidth) {
                return trialInline;
            }
        }

        return parts.join(opts.lineEnd);
    }

    private serializeTermWithInlineBlankNodes(
        term: Quad['object'] | TripleTerm,
        opts: Required<SerializationOptions>,
        state: InlineState,
        baseIndent: string,
        visiting: Set<string>
    ): string {
        if (term.termType === 'BlankNode' && state.collections.has(term.value)) {
            if (visiting.has(term.value)) {
                return this.serializeTerm(term, opts);
            }

            const itemQuads = state.collections.get(term.value)!;
            visiting.add(term.value);
            const collection = this.serializeCollection(itemQuads, opts, baseIndent, state, visiting);
            visiting.delete(term.value);

            return collection;
        }

        if (term.termType === 'BlankNode' && state.inlineBlankNodes.has(term.value)) {
            if (visiting.has(term.value)) {
                return this.serializeTerm(term, opts);
            }

            const nestedPredicateMap = state.inlineBlankNodes.get(term.value)!;
            visiting.add(term.value);
            const inline = this.serializeInlineBlankNode(nestedPredicateMap, opts, baseIndent, state, visiting);
            visiting.delete(term.value);

            return inline;
        }

        return this.serializeTerm(term, opts);
    }

    /**
     * Serializes a well-formed RDF list using collection syntax: ( item1 item2 ... )
     *
     * Uses the single-line form when the result fits into `maxLineWidth` (or
     * no width limit is set) and no item is itself multi-line; otherwise each
     * item is placed on its own indented line.
     */
    private serializeCollection(
        itemQuads: Array<Quad | Rdf12Quad>,
        opts: Required<SerializationOptions>,
        baseIndent: string,
        state: InlineState,
        visiting: Set<string>
    ): string {
        const innerIndent = baseIndent + opts.indent;
        const items = itemQuads.map(q => this.serializeTermWithInlineBlankNodes(
            q.object,
            opts,
            state,
            innerIndent,
            visiting
        ));

        const singleLine = `( ${items.join(' ')} )`;

        const isMultiLine = items.some(item => item.includes(opts.lineEnd))
            || (opts.maxLineWidth > 0 && baseIndent.length + singleLine.length > opts.maxLineWidth);

        if (!isMultiLine) {
            return singleLine;
        }

        const parts: string[] = ['('];

        for (const item of items) {
            parts.push(`${innerIndent}${item}`);
        }

        parts.push(`${baseIndent})`);

        return parts.join(opts.lineEnd);
    }

    /**
     * Formats an object list based on style and line width settings.
     */
    private formatObjectList(
        objects: string[],
        opts: Required<SerializationOptions>,
        indent: string,
        lineOffset: number
    ): string {
        if (objects.length === 1) {
            return objects[0];
        }

        const singleLine = objects.join(`${this.punctuation(opts, ',')} `);

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
        opts: Required<SerializationOptions>,
        indent: string
    ): string {
        const lineEnd = opts.lineEnd;
        const objectIndent = indent + opts.indent;
        const parts = objects.map((obj, i) => {
            const suffix = i < objects.length - 1 ? this.punctuation(opts, ',') : '';
            return i === 0 ? obj + suffix : `${objectIndent}${obj}${suffix}`;
        });
        return parts.join(lineEnd);
    }

    /**
     * Serializes an object with its annotations if present.
     */
    private serializeObjectWithAnnotations(
        quad: Quad | Rdf12Quad,
        opts: Required<SerializationOptions>
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
        opts: Required<SerializationOptions>
    ): string {
        if (annotations.length === 0) {
            return '';
        }

        const parts = annotations.map(ann => {
            const predicate = this.serializeTerm(ann.predicate, opts);
            const object = this.serializeTerm(ann.object, opts);
            return `${predicate} ${object}`;
        });

        return `{| ${parts.join(`${this.punctuation(opts, ';')} `)} |}`;
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
        opts: Required<SerializationOptions>
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
    override format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializationOptions): SerializationResult {
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
