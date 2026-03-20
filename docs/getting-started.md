# Getting Started

This guide walks through installation and a minimal serialization example.

## Prerequisites

- Node.js 18 or later
- TypeScript 5+ (recommended)

## Installation

```bash
npm install @faubulous/mentor-rdf-serializers
```

## Quick Start

The following example creates two RDF quads and serializes them to Turtle:

```typescript
import { TurtleSerializer } from '@faubulous/mentor-rdf-serializers';
import DataFactory from '@rdfjs/data-model';

const serializer = new TurtleSerializer();

const quads = [
    DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        DataFactory.namedNode('http://example.org/Class')
    ),
    DataFactory.quad(
        DataFactory.namedNode('http://example.org/subject'),
        DataFactory.namedNode('http://example.org/name'),
        DataFactory.literal('Example', 'en')
    )
];

const turtle = serializer.serialize(quads, {
    prefixes: {
        'ex': 'http://example.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    }
});

console.log(turtle);
```

Output:

```turtle
PREFIX ex: <http://example.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

ex:subject a ex:Class ;
    ex:name "Example"@en .
```

## Next Steps

- See [Serializers](serializers.md) for all supported formats.
- See [Options](options.md) for the full configuration reference.
- See [Architecture](architecture.md) for how the parser and serializer fit together.

---

[Back to documentation index](README.md)
