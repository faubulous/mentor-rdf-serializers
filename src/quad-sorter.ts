import type { Quad } from '@rdfjs/types';
import type { QuadComparator, SortingStrategy } from './sorting-strategy.js';
import type { Rdf12Quad } from './types.js';
import { AlphabeticalSortingStrategy } from './sorting/alphabetical-sorting-strategy.js';

/**
 * Applies sorting strategies to arrays of quads.
 */
export class QuadSorter {
    private static readonly defaultAlphabeticalStrategy = new AlphabeticalSortingStrategy();

    static apply(quads: Array<Quad | Rdf12Quad>, strategy: boolean | SortingStrategy | QuadComparator): Array<Quad | Rdf12Quad> {
        if (strategy === false) {
            return quads;
        }

        const sorted = [...quads];

        if (strategy === true) {
            sorted.sort((a, b) => this.defaultAlphabeticalStrategy.compare(a, b));

            return sorted;
        }

        if (typeof strategy === 'function') {
            sorted.sort(strategy);

            return sorted;
        }

        strategy.prepare?.(sorted);

        sorted.sort((a, b) => strategy.compare(a, b));

        return sorted;
    }
}
