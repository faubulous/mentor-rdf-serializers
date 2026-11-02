import { describe, it, expect } from 'vitest';
import { RdfDataFactory } from '../data-factory';
import { PrioritySortingStrategy } from './priority-sorting-strategy';
import { QuadSorter } from '../quad-sorter';

const termValue = (term: unknown) => (term as { value: string }).value;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';

describe('PrioritySortingStrategy', () => {
    it('orders by configured type priority', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [RDFS_CLASS, 'http://example.org/Instance']
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/instance'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/Instance')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/class'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(RDFS_CLASS))
        ];

        strategy.prepare(quads);

        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/class');
    });

    it('uses the lowest rank when a subject has multiple types', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [OWL_CLASS, OWL_OBJECT_PROPERTY]
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/multi'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_OBJECT_PROPERTY)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/multi'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_CLASS)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/prop'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_OBJECT_PROPERTY))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/multi');
    });

    it('places unmatched types at the end by default', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [RDFS_CLASS]
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/unknown'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/UnknownType')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/class'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(RDFS_CLASS))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/class');
        expect(termValue(quads[1].subject)).toBe('http://example.org/unknown');
    });

    it('places unmatched types at the start when configured', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [RDFS_CLASS],
            unmatchedPosition: 'start'
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/class'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(RDFS_CLASS)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/unknown'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode('http://example.org/UnknownType'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/unknown');
        expect(termValue(quads[1].subject)).toBe('http://example.org/class');
    });

    it('sorts by predicate priority as secondary ordering', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [RDFS_CLASS],
            predicateOrder: [RDF_TYPE, 'http://example.org/label', 'http://example.org/description']
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/description'), RdfDataFactory.literal('desc')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode('http://example.org/label'), RdfDataFactory.literal('label')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/s'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(RDFS_CLASS))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].predicate)).toBe(RDF_TYPE);
        expect(termValue(quads[1].predicate)).toBe('http://example.org/label');
        expect(termValue(quads[2].predicate)).toBe('http://example.org/description');
    });

    it('handles subjects without any matching type', () => {
        const strategy = new PrioritySortingStrategy({
            typeOrder: [RDFS_CLASS],
            unmatchedPosition: 'end'
        });

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/typed'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(RDFS_CLASS)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/untyped'), RdfDataFactory.namedNode('http://example.org/label'), RdfDataFactory.literal('No type'))
        ];

        strategy.prepare(quads);
        quads.sort((a, b) => strategy.compare(a, b));

        expect(termValue(quads[0].subject)).toBe('http://example.org/typed');
        expect(termValue(quads[1].subject)).toBe('http://example.org/untyped');
    });

    it('orders an OWL ontology consistently with priority sorting', () => {
        const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
        const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
        const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';
        const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';
        const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
        const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
        const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
        const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';

        const quads = [
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/hasName'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_OBJECT_PROPERTY)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/hasName'), RdfDataFactory.namedNode(RDFS_DOMAIN), RdfDataFactory.namedNode('http://example.org/Person')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/hasName'), RdfDataFactory.namedNode(RDFS_RANGE), RdfDataFactory.namedNode('http://www.w3.org/2001/XMLSchema#string')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/Person'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_CLASS)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/Person'), RdfDataFactory.namedNode(RDFS_LABEL), RdfDataFactory.literal('Person')),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/onto'), RdfDataFactory.namedNode(RDF_TYPE), RdfDataFactory.namedNode(OWL_ONTOLOGY)),
            RdfDataFactory.quad(RdfDataFactory.namedNode('http://example.org/onto'), RdfDataFactory.namedNode(RDFS_COMMENT), RdfDataFactory.literal('Example ontology'))
        ];

        const strategy = new PrioritySortingStrategy({
            typeOrder: [OWL_ONTOLOGY, OWL_CLASS, OWL_OBJECT_PROPERTY],
            predicateOrder: [RDF_TYPE, RDFS_LABEL, RDFS_COMMENT, RDFS_DOMAIN, RDFS_RANGE]
        });

        const sorted = QuadSorter.sort(quads, strategy);

        expect(termValue(sorted[0].subject)).toBe('http://example.org/onto');
        expect(termValue(sorted[0].predicate)).toBe(RDF_TYPE);
        expect(termValue(sorted[1].subject)).toBe('http://example.org/onto');
        expect(termValue(sorted[1].predicate)).toBe(RDFS_COMMENT);
        expect(termValue(sorted[2].subject)).toBe('http://example.org/Person');
        expect(termValue(sorted[2].predicate)).toBe(RDF_TYPE);
        expect(termValue(sorted[3].subject)).toBe('http://example.org/Person');
        expect(termValue(sorted[3].predicate)).toBe(RDFS_LABEL);
        expect(termValue(sorted[4].subject)).toBe('http://example.org/hasName');
    });
});
