import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from '../utilities/types';
import { QuadSortingStrategy } from '../quad-sorting-strategy';
import { getTermSortKey } from './term-sort-key';

/**
 * Alphabetical sorting by subject, predicate, object.
 */
export class AlphabeticalSortingStrategy implements QuadSortingStrategy {
    readonly name = 'alphabetical';

    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectCompare = getTermSortKey(a.subject).localeCompare(getTermSortKey(b.subject));

        if (subjectCompare !== 0) {
            return subjectCompare;
        }

        const predicateCompare = getTermSortKey(a.predicate).localeCompare(getTermSortKey(b.predicate));

        if (predicateCompare !== 0) {
            return predicateCompare;
        }
        return getTermSortKey(a.object).localeCompare(getTermSortKey(b.object));
    }
}
