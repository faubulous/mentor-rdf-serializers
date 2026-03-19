/**
 * Comment-preserving statement groups for quad-based serialization.
 *
 * When a Turtle document is parsed into quads, source comments are lost because
 * the RDF data model has no concept of comments. This module bridges that gap:
 * it uses the parser's `QuadInfo` API (which pairs each quad with its source
 * tokens) to associate nearby comment tokens with the quads they annotate.
 *
 * A `StatementGroup` bundles a quad with its leading and trailing comments so
 * that sorting, merging, and re-serialization can move comments together with
 * the statement they belong to.
 */

import type { IToken } from 'chevrotain';
import type { Quad } from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import type { Rdf12Quad, SortOption } from './types.js';
import { applySortingStrategy } from './sorting/strategies.js';

// Re-export the parser types that callers will need.
// The import is a `type` import so there is no hard runtime dependency –
// consumers must have `@faubulous/mentor-rdf-parsers` installed.
import type { QuadInfo } from '@faubulous/mentor-rdf-parsers';
export type { QuadInfo };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A quad together with the source comments that should stay attached to it.
 */
export interface StatementGroup {
    /**
     * The RDF quad (constructed from `QuadInfo.subject/predicate/object`).
     * For groups created from `QuadInfo`, this is the materialized quad.
     * For externally added quads, this is the quad as-is.
     */
    quad: Quad | Rdf12Quad;

    /**
     * Comment lines that appeared immediately before the statement's subject
     * in the source document (i.e. between the previous statement's end and
     * this statement's subject token).
     */
    leadingComments: IToken[];

    /**
     * A comment that appeared on the same line as the statement's terminating
     * punctuation (`.` or `;` at the end of the statement).
     */
    trailingComment?: IToken;

    /**
     * The source offset of the statement's first meaningful token (the subject).
     * Used for sorting stability. `Infinity` for externally added quads.
     */
    sourceOffset: number;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Builds `StatementGroup[]` from `QuadInfo[]` and the raw token stream.
 *
 * The algorithm:
 *  1. Extract comment tokens from the token stream.
 *  2. Derive statement spans from `QuadInfo` entries (subject offset → end of
 *     last component).
 *  3. For each statement, claim all comment tokens whose `startOffset` lies
 *     between the end of the previous statement and the subject's
 *     `startOffset` as **leading comments**.
 *  4. Any comment on the **same source line** as the statement's last token is
 *     claimed as the **trailing comment**.
 *  5. Unclaimed comments at the very end of the document are attached to the
 *     last group (trailing) or returned as document-level trailing comments.
 *
 * @param quadInfos  The `QuadInfo[]` returned by `TurtleReader.turtleDocInfo()`.
 * @param tokens     The full token array from `TurtleLexer.tokenize().tokens`
 *                   (must include `COMMENT` tokens).
 * @returns An array of statement groups with comments attached.
 */
export function groupCommentsWithQuads(
    quadInfos: QuadInfo[],
    tokens: IToken[]
): StatementGroup[] {
    if (quadInfos.length === 0) {
        return [];
    }

    // 1. Collect all comment tokens, sorted by offset.
    const comments = tokens
        .filter(t => t.tokenType.name === 'COMMENT')
        .sort((a, b) => a.startOffset - b.startOffset);

    if (comments.length === 0) {
        // No comments → simple groups.
        return quadInfos.map(qi => ({
            quad: materializeQuad(qi),
            leadingComments: [],
            trailingComment: undefined,
            sourceOffset: qi.subject.token.startOffset,
        }));
    }

    // 2. Build statement info sorted by subject offset.
    //    Multiple QuadInfos may share the same subject (grouped statements),
    //    so we group by subject key + startOffset to find per-subject spans.
    const subjectGroups = groupBySubject(quadInfos);

    // 3. Walk through subject groups and claim comments.
    const result: StatementGroup[] = [];
    let commentIdx = 0;
    let previousStatementEnd = -1; // end offset of the previous statement span

    for (const sg of subjectGroups) {
        const subjectOffset = sg.subjectStartOffset;
        const statementEndOffset = sg.endOffset;
        const statementEndLine = sg.endLine;

        // Collect leading comments: those between previousStatementEnd and subjectOffset.
        const leading: IToken[] = [];
        while (commentIdx < comments.length) {
            const c = comments[commentIdx];
            if (c.startOffset < subjectOffset && c.startOffset > previousStatementEnd) {
                leading.push(c);
                commentIdx++;
            } else {
                break;
            }
        }

        // Collect trailing comment: a comment on the same line as the statement end.
        let trailing: IToken | undefined;
        if (
            commentIdx < comments.length &&
            comments[commentIdx].startOffset > statementEndOffset &&
            comments[commentIdx].startLine === statementEndLine
        ) {
            trailing = comments[commentIdx];
            commentIdx++;
        }

        // Create one StatementGroup per quad in this subject group.
        // Only the first quad gets the leading comments; only the last gets the trailing.
        for (let i = 0; i < sg.quadInfos.length; i++) {
            result.push({
                quad: materializeQuad(sg.quadInfos[i]),
                leadingComments: i === 0 ? leading : [],
                trailingComment: i === sg.quadInfos.length - 1 ? trailing : undefined,
                sourceOffset: sg.quadInfos[i].subject.token.startOffset,
            });
        }

        previousStatementEnd = statementEndOffset;
    }

    // 4. Remaining trailing comments → attach to the last group.
    if (commentIdx < comments.length && result.length > 0) {
        const last = result[result.length - 1];
        const lastEndLine = subjectGroups[subjectGroups.length - 1].endLine;
        while (commentIdx < comments.length) {
            if (!last.trailingComment && comments[commentIdx].startLine === lastEndLine) {
                last.trailingComment = comments[commentIdx];
            } else {
                // Append as an additional leading comment on the last group
                // (they'll appear after the statement — this is a "document footer" comment).
                last.leadingComments.push(comments[commentIdx]);
            }
            commentIdx++;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Merging & sorting
// ---------------------------------------------------------------------------

/**
 * Merges externally added quads into an existing set of statement groups.
 *
 * New quads receive empty comment arrays so they serialize cleanly between
 * existing groups.
 *
 * @param groups   Existing statement groups (with comments attached).
 * @param newQuads Additional quads to merge in.
 * @param sort     Sorting option — same values as `SerializerOptions.sort`.
 * @returns A new array with all groups, sorted if requested.
 */
export function mergeStatementGroups(
    groups: StatementGroup[],
    newQuads: Array<Quad | Rdf12Quad>,
    sort?: SortOption
): StatementGroup[] {
    const newGroups: StatementGroup[] = newQuads.map(q => ({
        quad: q,
        leadingComments: [],
        trailingComment: undefined,
        sourceOffset: Infinity, // new quads sort after existing ones at the same rank
    }));

    const all = [...groups, ...newGroups];

    if (sort === false) {
        return all;
    }

    if (!sort) {
        return all;
    }

    return sortStatementGroups(all, sort);
}

/**
 * Sorts statement groups using the provided sorting option.
 *
 * The sort operates on the *quad* inside each group — comments travel with
 * their quad. When two quads compare equal the original source order is
 * preserved (stable sort).
 */
export function sortStatementGroups(
    groups: StatementGroup[],
    sort: SortOption
): StatementGroup[] {
    // Extract quads, sort them, then map the sorted order back to groups.
    const quads = groups.map(g => g.quad);
    const sorted: Array<Quad | Rdf12Quad> = applySortingStrategy(quads, sort);

    // Build a lookup: quad identity → group (using reference equality).
    const quadToGroup = new Map<Quad | Rdf12Quad, StatementGroup>();
    for (const g of groups) {
        quadToGroup.set(g.quad, g);
    }

    return sorted.map(q => quadToGroup.get(q)!);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Options for `serializeStatementGroups`.
 */
export interface StatementGroupSerializerOptions {
    /**
     * Prefix mappings for compact IRI serialization.
     */
    prefixes?: Record<string, string>;

    /**
     * Base IRI for relative references.
     */
    baseIri?: string;

    /**
     * Indentation string (default: `'  '`).
     */
    indent?: string;

    /**
     * Line ending string (default: `'\n'`).
     */
    lineEnd?: string;

    /**
     * Whether to insert blank lines between subject blocks (default: `true`).
     */
    blankLinesBetweenSubjects?: boolean;
}

/**
 * Serializes statement groups to Turtle, preserving comments.
 *
 * This is a lightweight serialization path that emits each group's leading
 * comments, then the serialized quad, then the trailing comment. It delegates
 * the actual quad serialization to a provided callback so it can be used with
 * any serializer.
 *
 * @param groups     The (optionally sorted/merged) statement groups.
 * @param serializeQuad  A function that serializes a single quad to a string
 *                       (e.g. `TurtleSerializer.serializeQuad`).
 * @param options    Formatting options.
 * @returns The serialized Turtle string with comments preserved.
 */
export function serializeStatementGroups(
    groups: StatementGroup[],
    serializeQuad: (quad: Quad | Rdf12Quad) => string,
    options?: StatementGroupSerializerOptions
): string {
    const le = options?.lineEnd ?? '\n';
    const blankLines = options?.blankLinesBetweenSubjects ?? true;

    const parts: string[] = [];

    // Emit prefix declarations.
    if (options?.baseIri) {
        parts.push(`@base <${options.baseIri}> .`);
    }
    if (options?.prefixes) {
        for (const [prefix, namespace] of Object.entries(options.prefixes)) {
            parts.push(`@prefix ${prefix}: <${namespace}> .`);
        }
    }
    if (parts.length > 0) {
        parts.push(''); // blank line after declarations
    }

    let lastSubjectValue: string | null = null;

    for (const group of groups) {
        const subject = group.quad.subject;
        const subjectValue = 'value' in subject ? subject.value : String(subject);
        const isNewSubject = subjectValue !== lastSubjectValue;

        // Blank line between subject blocks.
        if (isNewSubject && lastSubjectValue !== null && blankLines) {
            parts.push('');
        }

        // Leading comments.
        for (const comment of group.leadingComments) {
            parts.push(comment.image);
        }

        // The quad itself.
        let line = serializeQuad(group.quad);

        // Trailing comment on the same line.
        if (group.trailingComment) {
            line += ' ' + group.trailingComment.image;
        }

        parts.push(line);
        lastSubjectValue = subjectValue;
    }

    return parts.join(le);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Internal: subject-grouped span for comment assignment. */
interface SubjectSpan {
    subjectKey: string;
    subjectStartOffset: number;
    endOffset: number;
    endLine: number;
    quadInfos: QuadInfo[];
}

/**
 * Groups consecutive `QuadInfo` entries that share the same subject into spans,
 * sorted by the subject's source offset. This mirrors Turtle's subject
 * grouping: `ex:S ex:p1 "a" ; ex:p2 "b" .` produces two QuadInfos with the
 * same subject offset but different predicate/object offsets.
 */
function groupBySubject(quadInfos: QuadInfo[]): SubjectSpan[] {
    const spans: SubjectSpan[] = [];
    let current: SubjectSpan | null = null;

    for (const qi of quadInfos) {
        const subjKey = qi.subject.term.value;
        const subjOffset = qi.subject.token.startOffset;

        if (!current || current.subjectKey !== subjKey || current.subjectStartOffset !== subjOffset) {
            current = {
                subjectKey: subjKey,
                subjectStartOffset: subjOffset,
                endOffset: maxEndOffset(qi),
                endLine: maxEndLine(qi),
                quadInfos: [qi],
            };
            spans.push(current);
        } else {
            current.quadInfos.push(qi);
            const end = maxEndOffset(qi);
            const line = maxEndLine(qi);
            if (end > current.endOffset) current.endOffset = end;
            if (line > current.endLine) current.endLine = line;
        }
    }

    return spans;
}

function maxEndOffset(qi: QuadInfo): number {
    let end = qi.object.token.endOffset ?? qi.object.token.startOffset;
    if (qi.predicate.token.endOffset !== undefined && qi.predicate.token.endOffset > end) {
        end = qi.predicate.token.endOffset;
    }
    return end;
}

function maxEndLine(qi: QuadInfo): number {
    return qi.object.token.endLine ?? qi.object.token.startLine ?? 0;
}

/**
 * Materializes a `QuadInfo` into an RDF/JS-compatible `Quad` object.
 * We build a minimal quad from the term references in the QuadInfo.
 */
function materializeQuad(qi: QuadInfo): Quad {
    const graph = qi.graph?.term ?? DataFactory.defaultGraph();

    return DataFactory.quad(
        qi.subject.term,
        qi.predicate.term,
        qi.object.term,
        graph
    ) as unknown as Quad;
}
