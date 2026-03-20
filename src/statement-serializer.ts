/**
 * Comment-preserving statement serializer for quad-based output.
 *
 * When a Turtle document is parsed into quads, source comments are lost because
 * the RDF data model has no concept of comments.  This module bridges that gap
 * by using the parser's {@link QuadContext} type which pairs each quad
 * with its associated leading and trailing comments.
 *
 * The {@link StatementSerializer} class encapsulates the full workflow —
 * merging new quads, sorting, prefix/base-declaration emission, and quad
 * serialization — so that callers do not need to orchestrate multiple
 * standalone functions.
 *
 * @example
 * ```typescript
 * import { StatementSerializer, TurtleSerializer } from '@faubulous/mentor-rdf-serializers';
 *
 * const ss = new StatementSerializer(new TurtleSerializer());
 * const output = ss.serialize(contexts, {
 *     prefixes: parseResult.prefixes,
 *     lowercaseDirectives: true,
 *     sort: true,
 * });
 * ```
 *
 * @module
 */

import type { IToken } from 'chevrotain';
import type { Quad } from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import type { ISerializer, Rdf12Quad, SerializerOptions, SortOption } from './types.js';
import { applySortingStrategy } from './sorting/strategies.js';

// Re-export the parser types that callers will need.
// When mentor-rdf-parsers renames StatementInfo → QuadContext,
// update the import below and remove the type alias.
import type { QuadTokens, QuadContext } from '@faubulous/mentor-rdf-parsers';
export type { QuadTokens };

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for {@link StatementSerializer.serialize}.
 */
export interface StatementSerializerOptions {
    /**
     * Prefix mappings for compacting IRIs and emitting prefix declarations.
     */
    prefixes?: Record<string, string>;

    /**
     * Base IRI for the document.  When set, a `BASE` / `@base` declaration
     * is emitted at the top of the output.
     */
    baseIri?: string;

    /**
     * Line ending string (default: `'\n'`).
     */
    lineEnd?: string;

    /**
     * Whether to insert blank lines between subject blocks (default: `true`).
     */
    blankLinesBetweenSubjects?: boolean;

    /**
     * Sorting option — `false` to disable, `true` for alphabetical,
     * or a `SortingStrategy` / `QuadComparator` for custom ordering.
     */
    sort?: SortOption;

    /**
     * Use lowercase directives (`@prefix` / `@base`) instead of uppercase
     * (`PREFIX` / `BASE`).  Default: `false`.
     */
    lowercaseDirectives?: boolean;
}

// ---------------------------------------------------------------------------
// StatementSerializer
// ---------------------------------------------------------------------------

/**
 * Serializes {@link QuadContext | statement contexts} to a complete
 * document string, preserving source comments and emitting prefix/base
 * declarations automatically.
 *
 * This class encapsulates the full workflow — merging new quads, sorting,
 * and serialization — so that callers do not need to orchestrate multiple
 * standalone functions.
 *
 * @example
 * ```typescript
 * import { StatementSerializer, TurtleSerializer } from '@faubulous/mentor-rdf-serializers';
 *
 * const ss = new StatementSerializer(new TurtleSerializer());
 *
 * // Optionally add new quads
 * const contexts = ss.addStatements(existingContexts, [newQuad]);
 *
 * // Serialize to a complete document (including prefix declarations)
 * const output = ss.serialize(contexts, {
 *     prefixes: parseResult.prefixes,
 *     lowercaseDirectives: true,
 *     sort: true,
 * });
 * ```
 */
export class StatementSerializer {
    /**
     * Creates a new `StatementSerializer`.
     *
     * @param serializer The underlying format-specific serializer used to
     *                   render individual quads (e.g. `TurtleSerializer`).
     */
    constructor(private readonly serializer: ISerializer) { }

    /**
     * Materializes an RDF/JS-compatible `Quad` from a {@link QuadContext}.
     */
    getQuad(quadContext: QuadContext): Quad {
        const graph = quadContext.graph?.term ?? DataFactory.defaultGraph();

        return DataFactory.quad(
            quadContext.subject.term,
            quadContext.predicate.term,
            quadContext.object.term,
            graph,
        ) as unknown as Quad;
    }

    /**
     * Creates a synthetic `QuadTokens` from a `Quad`.
     * Used when merging externally created quads into `QuadContext[]`.
     *
     * The token information is synthetic (offset = Infinity) since these quads
     * don't have source positions.
     */
    private _getQuadTokens(quad: Quad | Rdf12Quad): QuadTokens {
        const syntheticToken = {
            image: '',
            startOffset: Infinity,
            endOffset: Infinity,
            startLine: Infinity,
            endLine: Infinity,
            startColumn: Infinity,
            endColumn: Infinity,
            tokenType: { name: 'SYNTHETIC' },
            tokenTypeIdx: -1,
        } as unknown as IToken;

        const result: QuadTokens = {
            subject: { term: quad.subject as any, token: syntheticToken },
            predicate: { term: quad.predicate as any, token: syntheticToken },
            object: { term: quad.object as any, token: syntheticToken },
        };

        if (quad.graph && quad.graph.termType !== 'DefaultGraph') {
            result.graph = { term: quad.graph as any, token: syntheticToken };
        }

        return result;
    }

    /**
     * Merges externally created quads into an existing set of statement
     * contexts.  New quads receive empty comment arrays so they serialize
     * cleanly between existing statements.
     *
     * @param contexts Existing statement contexts (from the parser).
     * @param newQuads Additional quads to add.
     * @returns A new array containing both the original and new contexts.
     */
    addStatements(
        contexts: QuadContext[],
        newQuads: Array<Quad | Rdf12Quad>,
    ): QuadContext[] {
        const newContexts: QuadContext[] = newQuads.map(q => ({
            ...this._getQuadTokens(q),
            leadingComments: [],
            trailingComment: undefined,
            endOffset: Infinity,
            endLine: Infinity,
        }));

        return [...contexts, ...newContexts];
    }

    /**
     * Sorts statement contexts using the provided sorting option.
     * Comments travel with their quads so that each comment block stays
     * associated with the correct statement after reordering.
     *
     * @param contexts The statement contexts to sort.
     * @param sort     Sorting option (see {@link SortOption}).
     * @returns A new sorted array.
     */
    sort(contexts: QuadContext[], sort: SortOption): QuadContext[] {
        const quadsWithCtx = contexts.map(ctx => ({
            quad: this.getQuad(ctx),
            ctx,
        }));

        const quads = quadsWithCtx.map(x => x.quad);
        const sorted: Array<Quad | Rdf12Quad> = applySortingStrategy(quads, sort);

        const quadToCtx = new Map<Quad | Rdf12Quad, QuadContext>();
        for (const { quad, ctx } of quadsWithCtx) {
            quadToCtx.set(quad, ctx);
        }

        return sorted.map(q => quadToCtx.get(q)!);
    }

    /**
     * Serializes statement contexts to a complete document string.
     *
     * The output includes:
     * - `BASE` / `@base` declaration (when `baseIri` is set)
     * - `PREFIX` / `@prefix` declarations (when `prefixes` is provided)
     * - A blank line separating declarations from statements
     * - Sorted and comment-decorated statements
     *
     * @param contexts The (optionally pre-sorted / pre-merged) statement contexts.
     * @param options  Serialization options.
     * @returns The complete serialized document string.
     */
    serialize(
        contexts: QuadContext[],
        options?: StatementSerializerOptions,
    ): string {
        const prefixes = options?.prefixes ?? {};
        const baseIri = options?.baseIri ?? '';
        const lineEnd = options?.lineEnd ?? '\n';
        const blankLines = options?.blankLinesBetweenSubjects ?? true;
        const sortOpt = options?.sort ?? false;
        const lowercaseDirectives = options?.lowercaseDirectives ?? false;

        // Sort if requested.
        const sortedContexts = sortOpt ? this.sort(contexts, sortOpt) : contexts;

        const parts: string[] = [];

        // --- Declarations ---------------------------------------------------

        if (baseIri) {
            const keyword = lowercaseDirectives ? '@base' : 'BASE';
            const terminator = lowercaseDirectives ? ' .' : '';
            parts.push(`${keyword} <${baseIri}>${terminator}`);
        }

        for (const [prefix, namespace] of Object.entries(prefixes)) {
            const keyword = lowercaseDirectives ? '@prefix' : 'PREFIX';
            const terminator = lowercaseDirectives ? ' .' : '';
            parts.push(`${keyword} ${prefix}: <${namespace}>${terminator}`);
        }

        // Blank line after declarations.
        if (parts.length > 0) {
            parts.push('');
        }

        // --- Statements -----------------------------------------------------

        const serializerOpts: SerializerOptions = {
            prefixes,
            baseIri: baseIri || undefined,
            lowercaseDirectives,
        };

        let lastSubjectValue: string | null = null;

        for (const quadContext of sortedContexts) {
            const subjectValue = quadContext.subject.term.value;
            const isNewSubject = subjectValue !== lastSubjectValue;

            // Blank line between subject blocks.
            if (isNewSubject && lastSubjectValue !== null && blankLines) {
                parts.push('');
            }

            // Leading comments.
            for (const comment of quadContext.leadingComments) {
                parts.push(comment.image);
            }

            // The quad itself.
            const quad = this.getQuad(quadContext);

            let line = this.serializer.serializeQuad(quad, serializerOpts);

            // Trailing comment on the same line.
            if (quadContext.trailingComment) {
                line += ' ' + quadContext.trailingComment.image;
            }

            parts.push(line);
            lastSubjectValue = subjectValue;
        }

        return parts.join(lineEnd);
    }
}