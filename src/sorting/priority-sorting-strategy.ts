import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from '../utilities/types';
import type { QuadSortingStrategy } from '../quad-sorting-strategy';
import { termToString } from '@src/utilities/terms';
import { RDF } from '@src/ontologies/index';

/**
 * Configuration for priority-based sorting strategy.
 */
export interface PriorityStrategyConfig {
    /** Type IRIs in priority order (earliest = highest priority) */
    typeOrder?: string[];

    /** Predicate IRIs in priority order for secondary sorting */
    predicateOrder?: string[];

    /** Where to place resources without a matching type */
    unmatchedPosition?: 'start' | 'end';

    /** How to sort unmatched resources */
    unmatchedSort?: 'alphabetical' | 'none';
}

/**
 * Priority-based sorting using type and optional predicate precedence.
 */
export class PrioritySortingStrategy implements QuadSortingStrategy {
    private readonly typeOrder: string[];

    private readonly predicateOrder: string[];

    private readonly unmatchedSort: 'alphabetical' | 'none';

    private readonly typeRank: Map<string, number>;

    private readonly predicateRank: Map<string, number>;

    private readonly unmatchedRank: number;

    private readonly typeIndex = new Map<string, number>();

    constructor(config: PriorityStrategyConfig) {
        this.typeOrder = config.typeOrder ?? [];
        this.predicateOrder = config.predicateOrder ?? [];
        this.unmatchedSort = config.unmatchedSort ?? 'alphabetical';
        this.typeRank = new Map(this.typeOrder.map((type, index) => [type, index]));
        this.predicateRank = new Map(this.predicateOrder.map((predicate, index) => [predicate, index]));

        const unmatchedPosition = config.unmatchedPosition ?? 'end';
        this.unmatchedRank = unmatchedPosition === 'start' ? -1 : this.typeOrder.length;
    }

    prepare(quads: Array<Quad | Rdf12Quad>): void {
        this.typeIndex.clear();

        for (const q of quads) {
            if (q.predicate.value === RDF.type && q.object.termType === 'NamedNode') {
                const subject = termToString(q.subject);
                const rank = this.typeRank.get(q.object.value);

                if (rank !== undefined) {
                    const existing = this.typeIndex.get(subject);

                    if (existing === undefined || rank < existing) {
                        this.typeIndex.set(subject, rank);
                    }
                }
            }
        }
    }

    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectA = termToString(a.subject);
        const subjectB = termToString(b.subject);

        const rankA = this.typeIndex.get(subjectA) ?? this.unmatchedRank;
        const rankB = this.typeIndex.get(subjectB) ?? this.unmatchedRank;

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const subjectCompare = subjectA.localeCompare(subjectB);

        if (subjectCompare !== 0) {
            return subjectCompare;
        }

        if (this.predicateOrder.length > 0) {
            const predicateRankA = this.predicateRank.get(a.predicate.value) ?? this.predicateOrder.length;
            const predicateRankB = this.predicateRank.get(b.predicate.value) ?? this.predicateOrder.length;

            if (predicateRankA !== predicateRankB) {
                return predicateRankA - predicateRankB;
            }
        }

        if (this.unmatchedSort === 'alphabetical') {
            return termToString(a.predicate).localeCompare(termToString(b.predicate))
                || termToString(a.object).localeCompare(termToString(b.object));
        }

        return 0;
    }
}
