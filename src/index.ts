// Types and interfaces
export type {
    ISerializer,
    ITokenSerializer,
    IRdfFormatter,
    ISparqlFormatter,
    Rdf12Quad,
    Rdf12Term,
    Reifier,
    TripleTerm,
    SerializerOptions,
    TokenSerializerOptions,
    SerializationResult,
    SourceMapEntry,
    QuadComparator,
    SortingStrategy,
    PriorityStrategyConfig,
    SortOption,
    BlankNodeStyle,
    ObjectListStyle,
    PredicateListStyle
} from './types.js';

export { RdfSyntax } from './types.js';

// Utilities
export {
    escapeIri,
    escapeString,
    escapeLocalName,
    findPrefix,
    isValidLocalName,
    isTripleTerm,
    isReifier,
    hasAnnotations,
    hasReifier,
    needsLongString,
    isInteger,
    isDecimal,
    isDouble,
    groupQuadsBySubject,
    groupQuadsBySubjectPredicate,
    groupQuadsByGraph,
    termToString,
    sortQuads,
    parseLanguageTag,
    formatLanguageTag,
    resetBlankNodeCounter,
    generateBlankNodeId,
    mergeOptions,
    RDF_NAMESPACE,
    XSD_NAMESPACE,
    RDF_TYPE,
    XSD_STRING,
    XSD_INTEGER,
    XSD_DECIMAL,
    XSD_DOUBLE,
    XSD_BOOLEAN,
    DEFAULT_OPTIONS
} from './utils.js';

// Base serializer
export { BaseSerializer } from './base-serializer.js';

// Base token formatter
export {
    BaseTokenFormatter,
    annotateTokens,
    type TokenAnnotation,
    type AnnotatedToken,
    type Scope,
    type BaseFormatterContext,
    type BaseFormatterOptions,
} from './base-token-formatter.js';

// N-Triples serializer
export { NTriplesSerializer } from './ntriples/serializer.js';

// N-Quads serializer
export { NQuadsSerializer } from './nquads/serializer.js';

// Turtle serializer
export { TurtleSerializer } from './turtle/serializer.js';

// TriG serializer
export { TrigSerializer } from './trig/serializer.js';

// N3 serializer
export {
    N3Serializer,
    type N3SerializerOptions,
    type N3Formula,
    type N3QuickVariable,
    isN3Formula,
    isN3QuickVariable
} from './n3/serializer.js';

// JSON-LD serializer
export {
    JsonLdSerializer,
    type JsonLdSerializerOptions
} from './jsonld/serializer.js';

// SPARQL formatter
export {
    SparqlFormatter,
    type SparqlFormatterOptions
} from './sparql/formatter.js';

// Turtle formatter
export {
    TurtleFormatter,
    type TurtleFormatterOptions
} from './turtle/formatter.js';

// N-Triples formatter
export { NTriplesFormatter } from './ntriples/formatter.js';

// N-Quads formatter
export { NQuadsFormatter } from './nquads/formatter.js';

// TriG formatter
export {
    TrigFormatter,
    type TrigFormatterOptions
} from './trig/formatter.js';

// N3 formatter
export {
    N3Formatter,
    type N3FormatterOptions
} from './n3/formatter.js';

// Token-based serialization
export {
    TokenSerializer,
    type Token,
    getBlankNodeIdFromToken,
    isBlankNodeToken,
    getTokenPosition
} from './token-serializer.js';

// Sorting strategies
export {
    alphabeticalStrategy,
    createByTypeStrategy,
    createSemanticStrategy,
    createPriorityStrategy,
    applySortingStrategy
} from './sorting/index.js';

// Statement groups (comment-preserving quad serialization)
export type {
    StatementGroup,
    StatementGroupSerializerOptions,
    QuadInfo
} from './statement-group.js';

export {
    groupCommentsWithQuads,
    mergeStatementGroups,
    sortStatementGroups,
    serializeStatementGroups
} from './statement-group.js';
