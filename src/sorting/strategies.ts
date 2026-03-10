/**
 * Sorting strategies for RDF quads.
 * 
 * These strategies allow customizing the order of quads in serialized output,
 * supporting use cases like grouping by type, semantic ordering (dependencies first),
 * and custom priority ordering.
 */

import type { Quad } from '@rdfjs/types';
import type { Rdf12Quad, QuadComparator, SortingStrategy, PriorityStrategyConfig } from '../types.js';
import { termToString, RDF_TYPE } from '../utils.js';

/**
 * Alphabetical sorting by subject, predicate, object.
 * This is the default sorting strategy.
 */
export const alphabeticalStrategy: SortingStrategy = {
    name: 'alphabetical',
    compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
        const subjectCompare = termToString(a.subject).localeCompare(termToString(b.subject));
        if (subjectCompare !== 0) return subjectCompare;
        
        const predicateCompare = termToString(a.predicate).localeCompare(termToString(b.predicate));
        if (predicateCompare !== 0) return predicateCompare;
        
        return termToString(a.object).localeCompare(termToString(b.object));
    }
};

/**
 * Strategy that groups quads by their rdf:type, then sorts alphabetically within each type.
 * Resources without a type are placed according to unmatchedPosition.
 */
export function createByTypeStrategy(config?: {
    /** Where to place resources without rdf:type */
    unmatchedPosition?: 'start' | 'end';
    /** How to sort within each type group */
    secondarySort?: 'alphabetical' | 'none';
}): SortingStrategy {
    const unmatchedPosition = config?.unmatchedPosition ?? 'end';
    const secondarySort = config?.secondarySort ?? 'alphabetical';
    
    return {
        name: 'byType',
        _typeIndex: new Map<string, string>(),
        _allTypes: new Set<string>(),
        
        prepare(quads: Array<Quad | Rdf12Quad>): void {
            (this._typeIndex as Map<string, string>).clear();
            (this._allTypes as Set<string>).clear();
            
            for (const q of quads) {
                if (q.predicate.value === RDF_TYPE && q.object.termType === 'NamedNode') {
                    const subj = termToString(q.subject);
                    const typeIri = q.object.value;
                    (this._typeIndex as Map<string, string>).set(subj, typeIri);
                    (this._allTypes as Set<string>).add(typeIri);
                }
            }
        },
        
        compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
            const typeIndex = this._typeIndex as Map<string, string>;
            const allTypes = Array.from(this._allTypes as Set<string>).sort();
            
            const subjA = termToString(a.subject);
            const subjB = termToString(b.subject);
            
            const typeA = typeIndex.get(subjA);
            const typeB = typeIndex.get(subjB);
            
            // Handle unmatched (no type)
            const hasTypeA = typeA !== undefined;
            const hasTypeB = typeB !== undefined;
            
            if (!hasTypeA && hasTypeB) {
                return unmatchedPosition === 'start' ? -1 : 1;
            }
            if (hasTypeA && !hasTypeB) {
                return unmatchedPosition === 'start' ? 1 : -1;
            }
            
            // Both have types or both don't
            if (hasTypeA && hasTypeB) {
                const typeCompare = allTypes.indexOf(typeA).toString().localeCompare(
                    allTypes.indexOf(typeB).toString()
                );
                if (typeCompare !== 0) {
                    return typeA.localeCompare(typeB);
                }
            }
            
            // Secondary sort
            if (secondarySort === 'alphabetical') {
                return subjA.localeCompare(subjB)
                    || termToString(a.predicate).localeCompare(termToString(b.predicate))
                    || termToString(a.object).localeCompare(termToString(b.object));
            }
            
            return 0;
        }
    };
}

/**
 * Semantic ordering: resources that are referenced by others come before their referents.
 * Uses topological sort to ensure dependencies are defined before they are used.
 */
export function createSemanticStrategy(config?: {
    /** Where to place resources that form cycles (can't be fully ordered) */
    cyclesPosition?: 'start' | 'end';
}): SortingStrategy {
    const cyclesPosition = config?.cyclesPosition ?? 'end';
    
    return {
        name: 'semantic',
        _subjectOrder: new Map<string, number>(),
        
        prepare(quads: Array<Quad | Rdf12Quad>): void {
            const subjectOrder = this._subjectOrder as Map<string, number>;
            subjectOrder.clear();
            
            // Build dependency graph
            const subjects = new Set<string>();
            const dependencies = new Map<string, Set<string>>(); // subject → subjects it depends on
            
            for (const q of quads) {
                const subj = termToString(q.subject);
                subjects.add(subj);
                
                // If object is a resource that's also a subject, it's a dependency
                if (q.object.termType === 'NamedNode' || q.object.termType === 'BlankNode') {
                    const obj = termToString(q.object);
                    if (!dependencies.has(subj)) {
                        dependencies.set(subj, new Set());
                    }
                    dependencies.get(subj)!.add(obj);
                }
            }
            
            // Topological sort using Kahn's algorithm
            const inDegree = new Map<string, number>();
            const outEdges = new Map<string, Set<string>>(); // points to dependents
            
            for (const subj of subjects) {
                inDegree.set(subj, 0);
                outEdges.set(subj, new Set());
            }
            
            // Build in-degree counts and reverse edges
            for (const [subj, deps] of dependencies) {
                for (const dep of deps) {
                    if (subjects.has(dep)) {
                        inDegree.set(subj, (inDegree.get(subj) ?? 0) + 1);
                        outEdges.get(dep)!.add(subj);
                    }
                }
            }
            
            // Process nodes with no dependencies first
            const queue: string[] = [];
            for (const [subj, degree] of inDegree) {
                if (degree === 0) {
                    queue.push(subj);
                }
            }
            queue.sort(); // Alphabetical within same level
            
            let order = 0;
            const ordered: string[] = [];
            
            while (queue.length > 0) {
                const current = queue.shift()!;
                subjectOrder.set(current, order++);
                ordered.push(current);
                
                const dependents = Array.from(outEdges.get(current) ?? []).sort();
                for (const dep of dependents) {
                    const newDegree = (inDegree.get(dep) ?? 1) - 1;
                    inDegree.set(dep, newDegree);
                    if (newDegree === 0) {
                        queue.push(dep);
                        queue.sort();
                    }
                }
            }
            
            // Handle cycles - remaining subjects not in ordered list
            const cycleOrder = cyclesPosition === 'start' ? -1 : order;
            for (const subj of subjects) {
                if (!subjectOrder.has(subj)) {
                    subjectOrder.set(subj, cycleOrder);
                }
            }
        },
        
        compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
            const subjectOrder = this._subjectOrder as Map<string, number>;
            const subjA = termToString(a.subject);
            const subjB = termToString(b.subject);
            
            const orderA = subjectOrder.get(subjA) ?? Infinity;
            const orderB = subjectOrder.get(subjB) ?? Infinity;
            
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            
            // Within same subject, sort by predicate then object
            return termToString(a.predicate).localeCompare(termToString(b.predicate))
                || termToString(a.object).localeCompare(termToString(b.object));
        }
    };
}

/**
 * Priority-based sorting: order resources by their type according to a priority list.
 * Types earlier in the list appear first. Unmatched resources are placed according to config.
 */
export function createPriorityStrategy(config: PriorityStrategyConfig): SortingStrategy {
    const {
        typeOrder = [],
        predicateOrder = [],
        unmatchedPosition = 'end',
        unmatchedSort = 'alphabetical'
    } = config;
    
    const typeRank = new Map(typeOrder.map((t, i) => [t, i]));
    const predicateRank = new Map(predicateOrder.map((p, i) => [p, i]));
    const unmatchedRank = unmatchedPosition === 'start' ? -1 : typeOrder.length;
    
    return {
        name: 'priority',
        _typeIndex: new Map<string, number>(),
        
        prepare(quads: Array<Quad | Rdf12Quad>): void {
            const typeIndex = this._typeIndex as Map<string, number>;
            typeIndex.clear();
            
            for (const q of quads) {
                if (q.predicate.value === RDF_TYPE && q.object.termType === 'NamedNode') {
                    const subj = termToString(q.subject);
                    const rank = typeRank.get(q.object.value);
                    
                    if (rank !== undefined) {
                        // Use lowest rank if subject has multiple types
                        const existing = typeIndex.get(subj);
                        if (existing === undefined || rank < existing) {
                            typeIndex.set(subj, rank);
                        }
                    }
                }
            }
        },
        
        compare(a: Quad | Rdf12Quad, b: Quad | Rdf12Quad): number {
            const typeIndex = this._typeIndex as Map<string, number>;
            const subjA = termToString(a.subject);
            const subjB = termToString(b.subject);
            
            const rankA = typeIndex.get(subjA) ?? unmatchedRank;
            const rankB = typeIndex.get(subjB) ?? unmatchedRank;
            
            // Primary: by type rank
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            
            // Secondary: by subject
            const subjCompare = subjA.localeCompare(subjB);
            if (subjCompare !== 0) {
                return subjCompare;
            }
            
            // Tertiary: by predicate rank if configured
            if (predicateOrder.length > 0) {
                const predRankA = predicateRank.get(a.predicate.value) ?? predicateOrder.length;
                const predRankB = predicateRank.get(b.predicate.value) ?? predicateOrder.length;
                if (predRankA !== predRankB) {
                    return predRankA - predRankB;
                }
            }
            
            // Final: alphabetical within same rank
            if (unmatchedSort === 'alphabetical') {
                return termToString(a.predicate).localeCompare(termToString(b.predicate))
                    || termToString(a.object).localeCompare(termToString(b.object));
            }
            
            return 0;
        }
    };
}

/**
 * Applies a sorting strategy to an array of quads.
 * 
 * @param quads The quads to sort
 * @param strategy The sorting strategy (strategy object, comparator function, or true for alphabetical)
 * @returns A new sorted array of quads
 */
export function applySortingStrategy(
    quads: Array<Quad | Rdf12Quad>,
    strategy: boolean | SortingStrategy | QuadComparator
): Array<Quad | Rdf12Quad> {
    if (strategy === false) {
        return quads;
    }
    
    const sorted = [...quads];
    
    if (strategy === true) {
        // Default alphabetical
        sorted.sort(alphabeticalStrategy.compare.bind(alphabeticalStrategy));
    } else if (typeof strategy === 'function') {
        // Custom comparator function
        sorted.sort(strategy);
    } else {
        // Strategy object
        strategy.prepare?.(sorted);
        sorted.sort(strategy.compare.bind(strategy));
    }
    
    return sorted;
}
