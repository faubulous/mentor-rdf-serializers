import { Quad } from '@rdfjs/types';
import { QuadContext, IToken } from '@faubulous/mentor-rdf-parsers';
import { IQuadSerializer } from './quad-serializer.interface';
import { SerializerOptions, SortingOption } from './serializer-options';
import { StatementSerializerOptions } from './statement-serializer-options';
import { QuadSortingStrategy } from './quad-sorting-strategy';
import { QuadSorter } from './quad-sorter';

/**
 * Serializes {@link QuadContext | statement contexts} to a complete
 * document string, preserving source comments and emitting prefix/base
 * declarations automatically.
 */
export class StatementSerializer {
    /**
     * Shared synthetic token for contexts created from external quads.
     */
    private readonly syntheticToken: IToken = {
        image: '',
        startOffset: Infinity,
        endOffset: Infinity,
        startLine: Infinity,
        endLine: Infinity,
        startColumn: Infinity,
        endColumn: Infinity,
        tokenType: { name: 'SYNTHETIC' },
        tokenTypeIdx: -1,
    };

    /**
     * Creates a new `StatementSerializer`.
     *
     * @param serializer The underlying format-specific serializer used to
     *                   render individual quads (e.g. `TurtleSerializer`).
     */
    constructor(private readonly serializer: IQuadSerializer) { }

    /**
     * Merges externally created quads into an existing set of statement
     * contexts.  New quads receive empty comment arrays so they serialize
     * cleanly between existing statements.
     *
     * @param contexts Existing statement contexts (from the parser).
     * @param newQuads Additional quads to add.
     * @returns A new array containing both the original and new contexts.
     */
    addStatements(contexts: QuadContext[], newQuads: Quad[]): QuadContext[] {
        const result: QuadContext[] = newQuads.map(q => ({
            termType: q.termType,
            subject: q.subject,
            subjectToken: this.syntheticToken,
            predicate: q.predicate,
            predicateToken: this.syntheticToken,
            object: q.object,
            objectToken: this.syntheticToken,
            graph: q.graph,
            leadingComments: [],
            trailingComment: undefined,
            value: '',
            equals: q.equals
        }));

        return [
            ...contexts,
            ...result
        ];
    }

    /**
     * Sorts statement contexts using the provided sorting option.
     * Comments travel with their quads so that each comment block stays
     * associated with the correct statement after reordering.
     *
     * @param contexts The statement contexts to sort.
     * @param sort Sorting option (see {@link SortOption}).
     * @returns A new sorted array.
     */
    sort(contexts: QuadContext[], sort: SortingOption): QuadContext[] {
        return QuadSorter.sort(contexts as Quad[], sort) as QuadContext[];
    }

    /**
     * Serializes statement contexts to a complete document string.
     *
     * The output includes:
     * - `BASE` / `@base` declaration (when `baseIri` is set)
     * - `PREFIX` / `@prefix` declarations (when `prefixes` is provided)
     * - A blank line separating declarations from statements
     * - Pretty-printed subject blocks with predicate-object grouping
     * - Sorted and comment-decorated statements
     *
     * @param contexts The (optionally pre-sorted / pre-merged) statement contexts.
     * @param options  Serialization options.
     * @returns The complete serialized document string.
     */
    serialize(contexts: QuadContext[], options?: StatementSerializerOptions,): string {
        const prefixes = options?.prefixes ?? {};
        const baseIri = options?.baseIri ?? '';
        const lineEnd = options?.lineEnd ?? '\n';
        const blankLines = options?.blankLinesBetweenSubjects ?? true;
        const sortingStrategy = options?.sortingStrategy ?? false;
        const assumeSorted = options?.assumeSorted ?? false;
        const lowercaseDirectives = options?.lowercaseDirectives ?? false;

        // Sort if requested and not already sorted.
        const sortedContexts = (sortingStrategy && !assumeSorted) ? this.sort(contexts, sortingStrategy) : contexts;
        const parts: string[] = [];

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

        const serializerOpts: SerializerOptions = {
            prefixes,
            baseIri: baseIri || undefined,
            lowercaseDirectives,
            lineEnd,
            emitDirectives: false,
        };

        // Group contexts by subject for pretty-printed output with
        // predicate-object lists (e.g. Turtle's ";" syntax).
        const subjectGroups = new Map<string, QuadContext[]>();

        for (const ctx of sortedContexts) {
            const key = ctx.subject.value;

            if (!subjectGroups.has(key)) {
                subjectGroups.set(key, []);
            }

            subjectGroups.get(key)!.push(ctx);
        }

        const groupEntries = Array.from(subjectGroups.entries());

        // Fast path: render all quads in one serializer call and split by
        // subject-block separators. This avoids repeated serializer setup.
        const batchedBody = this.serializer.serialize(sortedContexts, {
            ...serializerOpts,
            blankLinesBetweenSubjects: true,
        });
        const batchedBlocks = this.splitSubjectBlocks(batchedBody, lineEnd);
        const canUseBatchedBlocks = batchedBlocks.length === groupEntries.length;

        for (let groupIndex = 0; groupIndex < groupEntries.length; groupIndex++) {
            const [_subjectKey, groupContexts] = groupEntries[groupIndex];

            // Blank line between subject blocks.
            if (groupIndex > 0 && blankLines) {
                parts.push('');
            }

            // Collect comments from all contexts in this subject group.
            // Leading comments are emitted before the subject block.
            // Trailing comments on non-last quads are also emitted as
            // leading comments since they cannot be placed inline within
            // a grouped subject block.
            for (let i = 0; i < groupContexts.length; i++) {
                const ctx = groupContexts[i];

                if (ctx.leadingComments) {
                    for (const comment of ctx.leadingComments) {
                        parts.push(comment.image);
                    }
                }

                if (i < groupContexts.length - 1 && ctx.trailingComment) {
                    parts.push(ctx.trailingComment.image);
                }
            }

            // Serialize the subject block using the underlying serializer,
            // which handles predicate-object grouping and pretty-printing.
            let body: string;

            if (canUseBatchedBlocks) {
                body = batchedBlocks[groupIndex];
            } else {
                body = this.serializer.serialize(groupContexts, serializerOpts);
            }

            // Append trailing comment from the last context in the group.
            const lastCtx = groupContexts[groupContexts.length - 1];

            if (lastCtx.trailingComment) {
                parts.push(this.appendTrailingComment(body, lineEnd, lastCtx.trailingComment.image));
            } else {
                parts.push(body);
            }
        }

        return parts.join(lineEnd);
    }

    /**
     * Splits serializer output into subject blocks using blank-line separators.
     */
    private splitSubjectBlocks(body: string, lineEnd: string): string[] {
        if (!body) {
            return [];
        }

        const blocks = body.split(`${lineEnd}${lineEnd}`);

        return blocks.filter(block => block.trim() !== '');
    }

    /**
     * Appends a trailing comment to the final logical line of a block.
     */
    private appendTrailingComment(body: string, lineEnd: string, commentImage: string): string {
        const lastBreak = body.lastIndexOf(lineEnd);

        if (lastBreak === -1) {
            return `${body} ${commentImage}`;
        }

        const lineStart = lastBreak + lineEnd.length;

        return body.slice(0, lineStart) + body.slice(lineStart) + ' ' + commentImage;
    }
}