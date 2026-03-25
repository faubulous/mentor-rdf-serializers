import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad } from '@src/types.js';
import { SortingStrategy } from '@src/sorting-strategy.js';
import { termToString } from '../utilities/utils.js';

export interface SemanticSortingStrategyConfig {
    /**
     * Where to place resources that form cycles (can't be fully ordered)
     */
    cyclesPosition?: 'start' | 'end';
}

/**
 * Semantic ordering based on subject dependencies.
 */
export class SemanticSortingStrategy implements SortingStrategy {
    private readonly cyclesPosition: 'start' | 'end';

    private readonly subjectOrder = new Map<string, number>();

    constructor(config: SemanticSortingStrategyConfig = {}) {
        this.cyclesPosition = config.cyclesPosition ?? 'end';
    }

    prepare(quads: Array<Quad | Rdf12Quad>): void {
        this.subjectOrder.clear();

        const subjects = new Set<string>();
        const dependencies = new Map<string, Set<string>>();

        for (const q of quads) {
            const subject = termToString(q.subject);

            subjects.add(subject);

            if (q.object.termType === 'NamedNode' || q.object.termType === 'BlankNode') {
                const object = termToString(q.object);

                if (!dependencies.has(subject)) {
                    dependencies.set(subject, new Set());
                }

                dependencies.get(subject)!.add(object);
            }
        }

        const inDegree = new Map<string, number>();
        const outEdges = new Map<string, Set<string>>();

        for (const subject of subjects) {
            inDegree.set(subject, 0);
            outEdges.set(subject, new Set());
        }

        for (const [subject, deps] of dependencies) {
            for (const dep of deps) {
                if (subjects.has(dep)) {
                    inDegree.set(subject, (inDegree.get(subject) ?? 0) + 1);
                    outEdges.get(dep)!.add(subject);
                }
            }
        }

        const queue: string[] = [];

        for (const [subject, degree] of inDegree) {
            if (degree === 0) {
                queue.push(subject);
            }
        }

        queue.sort();

        let order = 0;

        while (queue.length > 0) {
            const current = queue.shift()!;

            this.subjectOrder.set(current, order++);

            const dependents = Array.from(outEdges.get(current) ?? []).sort();

            for (const dependent of dependents) {
                const newDegree = (inDegree.get(dependent) ?? 1) - 1;

                inDegree.set(dependent, newDegree);

                if (newDegree === 0) {
                    queue.push(dependent);
                    queue.sort();
                }
            }
        }

        const cyclicSubjects = Array.from(subjects)
            .filter((subject) => !this.subjectOrder.has(subject))
            .sort();

        if (this.cyclesPosition === 'start') {
            for (let i = 0; i < cyclicSubjects.length; i++) {
                this.subjectOrder.set(cyclicSubjects[i], i - cyclicSubjects.length);
            }
        } else {
            for (const subject of cyclicSubjects) {
                this.subjectOrder.set(subject, order++);
            }
        }
    }

    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectA = termToString(a.subject);
        const subjectB = termToString(b.subject);

        const orderA = this.subjectOrder.get(subjectA) ?? Number.MAX_SAFE_INTEGER;
        const orderB = this.subjectOrder.get(subjectB) ?? Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return termToString(a.predicate).localeCompare(termToString(b.predicate))
            || termToString(a.object).localeCompare(termToString(b.object));
    }
}
