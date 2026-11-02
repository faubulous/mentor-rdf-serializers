import { DataFactory } from 'rdf-data-factory';

/**
 * The RDF/JS data factory the serializers create their terms with. It is the factory of
 * `rdf-data-factory`, which the Mentor parsers and the RDF/JS stores use as well.
 */
export const RdfDataFactory = new DataFactory();
