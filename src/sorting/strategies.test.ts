import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import {
    alphabeticalStrategy,
    createByTypeStrategy,
    createSemanticStrategy,
    createPriorityStrategy,
    applySortingStrategy
} from './strategies.js';

// Helper to get value from a term (safe cast since all test quads use NamedNode)
const termValue = (term: unknown) => (term as { value: string }).value;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';

describe('Sorting Strategies', () => {
    describe('alphabeticalStrategy', () => {
        it('should sort by subject first', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('x')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('y'))
            ];

            const sorted = applySortingStrategy(quads, alphabeticalStrategy);

            expect(termValue(sorted[0].subject)).toBe('http://example.org/a');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/b');
        });

        it('should sort by predicate when subjects are equal', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p2'), DataFactory.literal('x')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p1'), DataFactory.literal('y'))
            ];

            const sorted = applySortingStrategy(quads, alphabeticalStrategy);

            expect(termValue(sorted[0].predicate)).toBe('http://example.org/p1');
            expect(termValue(sorted[1].predicate)).toBe('http://example.org/p2');
        });

        it('should sort by object when subject and predicate are equal', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('z')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('a'))
            ];

            const sorted = applySortingStrategy(quads, alphabeticalStrategy);

            expect(termValue(sorted[0].object)).toBe('a');
            expect(termValue(sorted[1].object)).toBe('z');
        });
    });

    describe('createByTypeStrategy', () => {
        it('should group quads by their rdf:type', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/instance1'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeB')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/instance1'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Instance 1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/instance2'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/TypeA')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/instance2'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Instance 2'))
            ];

            const strategy = createByTypeStrategy();
            const sorted = applySortingStrategy(quads, strategy);

            // TypeA comes before TypeB alphabetically
            expect(termValue(sorted[0].subject)).toBe('http://example.org/instance2');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/instance2');
            expect(termValue(sorted[2].subject)).toBe('http://example.org/instance1');
        });

        it('should place untyped resources at the end by default', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/untyped'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('No type')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/Type')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Has type'))
            ];

            const strategy = createByTypeStrategy();
            const sorted = applySortingStrategy(quads, strategy);

            // Typed resources first, untyped at end
            expect(termValue(sorted[0].subject)).toBe('http://example.org/typed');
            expect(termValue(sorted[sorted.length - 1].subject)).toBe('http://example.org/untyped');
        });

        it('should place untyped resources at the start when configured', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/Type')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/untyped'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('No type'))
            ];

            const strategy = createByTypeStrategy({ unmatchedPosition: 'start' });
            const sorted = applySortingStrategy(quads, strategy);

            expect(termValue(sorted[0].subject)).toBe('http://example.org/untyped');
        });
    });

    describe('createSemanticStrategy', () => {
        it('should order resources so dependencies come first', () => {
            const quads = [
                // B references A
                DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/dependsOn'), DataFactory.namedNode('http://example.org/A')),
                // A has no dependencies
                DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('A'))
            ];

            const strategy = createSemanticStrategy();
            const sorted = applySortingStrategy(quads, strategy);

            // A should come before B because B depends on A
            expect(termValue(sorted[0].subject)).toBe('http://example.org/A');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/B');
        });

        it('should handle chains of dependencies', () => {
            const quads = [
                // C depends on B
                DataFactory.quad(DataFactory.namedNode('http://example.org/C'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/B')),
                // B depends on A
                DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/A')),
                // A has no dependencies
                DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/label'), DataFactory.literal('A'))
            ];

            const strategy = createSemanticStrategy();
            const sorted = applySortingStrategy(quads, strategy);

            // Order should be A, B, C
            expect(termValue(sorted[0].subject)).toBe('http://example.org/A');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/B');
            expect(termValue(sorted[2].subject)).toBe('http://example.org/C');
        });

        it('should handle resources with no dependencies', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/Z'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('Z')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/name'), DataFactory.literal('A'))
            ];

            const strategy = createSemanticStrategy();
            const sorted = applySortingStrategy(quads, strategy);

            // With no dependencies, should be alphabetical
            expect(termValue(sorted[0].subject)).toBe('http://example.org/A');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/Z');
        });

        it('should handle cycles gracefully', () => {
            const quads = [
                // A depends on B
                DataFactory.quad(DataFactory.namedNode('http://example.org/A'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/B')),
                // B depends on A (cycle!)
                DataFactory.quad(DataFactory.namedNode('http://example.org/B'), DataFactory.namedNode('http://example.org/uses'), DataFactory.namedNode('http://example.org/A'))
            ];

            const strategy = createSemanticStrategy();
            // Should not throw
            const sorted = applySortingStrategy(quads, strategy);

            // Both should be present
            expect(sorted.length).toBe(2);
        });
    });

    describe('createPriorityStrategy', () => {
        it('should order by type priority', () => {
            const quads = [
                // Instance (lower priority)
                DataFactory.quad(DataFactory.namedNode('http://example.org/instance'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/Instance')),
                // Class (higher priority)
                DataFactory.quad(DataFactory.namedNode('http://example.org/myClass'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(RDFS_CLASS)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/myClass'), DataFactory.namedNode('http://example.org/label'), DataFactory.literal('My Class'))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [RDFS_CLASS, 'http://example.org/Instance']
            });
            const sorted = applySortingStrategy(quads, strategy);

            // Class should come first
            expect(termValue(sorted[0].subject)).toBe('http://example.org/myClass');
        });

        it('should place unmatched types at the end by default', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/unknown'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/UnknownType')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/class'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(RDFS_CLASS))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [RDFS_CLASS]
            });
            const sorted = applySortingStrategy(quads, strategy);

            expect(termValue(sorted[0].subject)).toBe('http://example.org/class');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/unknown');
        });

        it('should place unmatched types at the start when configured', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/class'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(RDFS_CLASS)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/unknown'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode('http://example.org/UnknownType'))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [RDFS_CLASS],
                unmatchedPosition: 'start'
            });
            const sorted = applySortingStrategy(quads, strategy);

            expect(termValue(sorted[0].subject)).toBe('http://example.org/unknown');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/class');
        });

        it('should handle resources with multiple types using lowest rank', () => {
            const quads = [
                // Has both Class and Property types - Class has lower rank
                DataFactory.quad(DataFactory.namedNode('http://example.org/multi'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_OBJECT_PROPERTY)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/multi'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS)),
                // Only has Property type
                DataFactory.quad(DataFactory.namedNode('http://example.org/prop'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_OBJECT_PROPERTY))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [OWL_CLASS, OWL_OBJECT_PROPERTY]
            });
            const sorted = applySortingStrategy(quads, strategy);

            // multi should come first (has OWL_CLASS which is rank 0)
            expect(termValue(sorted[0].subject)).toBe('http://example.org/multi');
        });

        it('should sort by predicate priority as secondary sort', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/description'), DataFactory.literal('desc')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode('http://example.org/label'), DataFactory.literal('label')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/s'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(RDFS_CLASS))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [RDFS_CLASS],
                predicateOrder: [RDF_TYPE, 'http://example.org/label', 'http://example.org/description']
            });
            const sorted = applySortingStrategy(quads, strategy);

            expect(termValue(sorted[0].predicate)).toBe(RDF_TYPE);
            expect(termValue(sorted[1].predicate)).toBe('http://example.org/label');
            expect(termValue(sorted[2].predicate)).toBe('http://example.org/description');
        });

        it('should handle resources without any type', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/typed'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(RDFS_CLASS)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/untyped'), DataFactory.namedNode('http://example.org/label'), DataFactory.literal('No type'))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [RDFS_CLASS],
                unmatchedPosition: 'end'
            });
            const sorted = applySortingStrategy(quads, strategy);

            expect(termValue(sorted[0].subject)).toBe('http://example.org/typed');
            expect(termValue(sorted[1].subject)).toBe('http://example.org/untyped');
        });
    });

    describe('applySortingStrategy', () => {
        it('should not sort when strategy is false', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
            ];

            const result = applySortingStrategy(quads, false);

            // Order preserved
            expect(termValue(result[0].subject)).toBe('http://example.org/b');
        });

        it('should use alphabetical when strategy is true', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
            ];

            const result = applySortingStrategy(quads, true);

            expect(termValue(result[0].subject)).toBe('http://example.org/a');
        });

        it('should accept a custom comparator function', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/short'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/verylongname'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
            ];

            // Sort by subject IRI length (shortest first)
            const result = applySortingStrategy(quads, (a, b) => 
                termValue(a.subject).length - termValue(b.subject).length
            );

            expect(termValue(result[0].subject)).toBe('http://example.org/short');
        });

        it('should not mutate the original array', () => {
            const quads = [
                DataFactory.quad(DataFactory.namedNode('http://example.org/b'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('1')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/a'), DataFactory.namedNode('http://example.org/p'), DataFactory.literal('2'))
            ];

            const original = [...quads];
            applySortingStrategy(quads, true);

            expect(termValue(quads[0].subject)).toBe(termValue(original[0].subject));
        });
    });

    describe('Real-world ontology ordering', () => {
        it('should order an OWL ontology properly', () => {
            const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';
            const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
            const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
            const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
            const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';

            const quads = [
                // Property definition
                DataFactory.quad(DataFactory.namedNode('http://example.org/hasName'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_OBJECT_PROPERTY)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/hasName'), DataFactory.namedNode(RDFS_DOMAIN), DataFactory.namedNode('http://example.org/Person')),
                DataFactory.quad(DataFactory.namedNode('http://example.org/hasName'), DataFactory.namedNode(RDFS_RANGE), DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#string')),
                // Class definition
                DataFactory.quad(DataFactory.namedNode('http://example.org/Person'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/Person'), DataFactory.namedNode(RDFS_LABEL), DataFactory.literal('Person')),
                // Ontology definition
                DataFactory.quad(DataFactory.namedNode('http://example.org/onto'), DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_ONTOLOGY)),
                DataFactory.quad(DataFactory.namedNode('http://example.org/onto'), DataFactory.namedNode(RDFS_COMMENT), DataFactory.literal('Example ontology'))
            ];

            const strategy = createPriorityStrategy({
                typeOrder: [
                    OWL_ONTOLOGY,      // Ontology first
                    OWL_CLASS,         // Then classes
                    OWL_OBJECT_PROPERTY // Then properties
                ],
                predicateOrder: [
                    RDF_TYPE,          // Type declarations first
                    RDFS_LABEL,        // Then labels
                    RDFS_COMMENT,      // Then comments
                    RDFS_DOMAIN,       // Then domain/range
                    RDFS_RANGE
                ]
            });

            const sorted = applySortingStrategy(quads, strategy);

            // First should be ontology
            expect(termValue(sorted[0].subject)).toBe('http://example.org/onto');
            expect(termValue(sorted[0].predicate)).toBe(RDF_TYPE);
            
            // Then ontology comment
            expect(termValue(sorted[1].subject)).toBe('http://example.org/onto');
            expect(termValue(sorted[1].predicate)).toBe(RDFS_COMMENT);

            // Then class
            expect(termValue(sorted[2].subject)).toBe('http://example.org/Person');
            expect(termValue(sorted[2].predicate)).toBe(RDF_TYPE);

            // Then class label
            expect(termValue(sorted[3].subject)).toBe('http://example.org/Person');
            expect(termValue(sorted[3].predicate)).toBe(RDFS_LABEL);

            // Then property
            expect(termValue(sorted[4].subject)).toBe('http://example.org/hasName');
        });
    });
});
