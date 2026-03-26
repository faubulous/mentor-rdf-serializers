import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from '../utilities/types';
import { QuadSortingStrategy } from '@src/quad-sorting-strategy';
import { termToString } from '@src/utilities/terms';

/**
 * Alphabetical sorting by subject, predicate, object.
 */
export class AlphabeticalSortingStrategy implements QuadSortingStrategy {
    readonly name = 'alphabetical';

    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectCompare = termToString(a.subject).localeCompare(termToString(b.subject));

        if (subjectCompare !== 0) {
            return subjectCompare;
        }

        const predicateCompare = termToString(a.predicate).localeCompare(termToString(b.predicate));

        if (predicateCompare !== 0) {
            return predicateCompare;
        }
        return termToString(a.object).localeCompare(termToString(b.object));
    }
}
