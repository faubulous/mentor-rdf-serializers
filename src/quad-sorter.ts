import type { Quad } from '@rdfjs/types';
import type { QuadComparator, QuadSortingStrategy } from './quad-sorting-strategy';
import { AlphabeticalSortingStrategy } from './sorting/alphabetical-sorting-strategy';
import { Rdf12Quad } from './utilities/types';

/**
 * Applies sorting strategies to arrays of quads.
 */
export class QuadSorter {
    private static readonly defaultAlphabeticalStrategy = new AlphabeticalSortingStrategy();

    static sort(quads: Array<Quad | Rdf12Quad>, strategy: boolean | QuadSortingStrategy | QuadComparator): Array<Quad | Rdf12Quad> {
        if (strategy === false) {
            return quads;
        }

        const result = [...quads];

        if (strategy === true) {
            result.sort((a, b) => this.defaultAlphabeticalStrategy.compare(a, b));

            return result;
        }

        if (typeof strategy === 'function') {
            result.sort(strategy);

            return result;
        }

        strategy.prepare?.(result);

        result.sort((a, b) => strategy.compare(a, b));

        return result;
    }
}
