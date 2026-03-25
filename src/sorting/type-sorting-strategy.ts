import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from '@src/types.js';
import { RDF } from '@src/ontologies/index.js';
import { SortingStrategy } from '@src/sorting-strategy.js';
import { termToString } from '@src/utilities/utils.js';

export interface TypeSortingStrategyConfig {
    /**
     * Where to place resources without rdf:type
     */
    unmatchedPosition?: 'start' | 'end';

    /**
     * How to sort within each type group.
     */
    secondarySort?: 'alphabetical' | 'none';
}

/**
 * Groups quads by rdf:type, then sorts alphabetically within each type.
 */
export class TypeSortingStrategy implements SortingStrategy {
    private readonly unmatchedPosition: 'start' | 'end';

    private readonly secondarySort: 'alphabetical' | 'none';

    private readonly typeIndex = new Map<string, string>();

    constructor(config: TypeSortingStrategyConfig = {}) {
        this.unmatchedPosition = config.unmatchedPosition ?? 'end';
        this.secondarySort = config.secondarySort ?? 'alphabetical';
    }

    prepare(quads: Array<Quad | Rdf12Quad>): void {
        this.typeIndex.clear();

        for (const q of quads) {
            if (q.predicate.value === RDF.type && q.object.termType === 'NamedNode') {
                const subject = termToString(q.subject);
                const typeIri = q.object.value;

                this.typeIndex.set(subject, typeIri);
            }
        }
    }

    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectA = termToString(a.subject);
        const subjectB = termToString(b.subject);

        const typeA = this.typeIndex.get(subjectA);
        const typeB = this.typeIndex.get(subjectB);

        const hasTypeA = typeA !== undefined;
        const hasTypeB = typeB !== undefined;

        if (!hasTypeA && hasTypeB) {
            return this.unmatchedPosition === 'start' ? -1 : 1;
        }

        if (hasTypeA && !hasTypeB) {
            return this.unmatchedPosition === 'start' ? 1 : -1;
        }

        if (hasTypeA && hasTypeB) {
            const typeCompare = typeA.localeCompare(typeB);

            if (typeCompare !== 0) {
                return typeCompare;
            }
        }

        if (this.secondarySort === 'alphabetical') {
            return subjectA.localeCompare(subjectB)
                || termToString(a.predicate).localeCompare(termToString(b.predicate))
                || termToString(a.object).localeCompare(termToString(b.object));
        }

        return 0;
    }
}
