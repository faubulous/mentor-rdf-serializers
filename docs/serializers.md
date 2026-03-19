# Serializers

Each serializer implements the same `ISerializer` interface and accepts
RDF/JS `Quad` objects. Choose the serializer that matches your target format.

## N-Triples

```typescript
import { NTriplesSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new NTriplesSerializer();
const output = serializer.serialize(quads, { sort: true });
```

## N-Quads

```typescript
import { NQuadsSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new NQuadsSerializer();
const output = serializer.serialize(quads);
```

## Turtle

```typescript
import { TurtleSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new TurtleSerializer();
const output = serializer.serialize(quads, {
    prefixes: { 'ex': 'http://example.org/' },
    baseIri: 'http://example.org/',
    groupBySubject: true,
    sort: true
});
```

## TriG

```typescript
import { TriGSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new TriGSerializer();
const output = serializer.serialize(quadsWithGraphs, {
    prefixes: { 'ex': 'http://example.org/' }
});
```

## N3

```typescript
import { N3Serializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new N3Serializer();
const output = serializer.serialize(quads); // Supports formulas and implications
```

## JSON-LD

```typescript
import { JsonLdSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new JsonLdSerializer();
const output = serializer.serialize(quads, {
    prefixes: { 'ex': 'http://example.org/' },
    useTypeShorthand: true,
    useIdShorthand: true,
    compactArrays: true,
    prettyPrint: true
});
```

For a complete list of configuration options, see [Serialization Options](options.md).

---

[Back to documentation index](README.md)
