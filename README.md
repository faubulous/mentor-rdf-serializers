# Mentor RDF Serializers

[![npm version](https://img.shields.io/npm/v/@faubulous/mentor-rdf-serializers.svg)](https://www.npmjs.com/package/@faubulous/mentor-rdf-serializers)
[![npm downloads](https://img.shields.io/npm/dm/@faubulous/mentor-rdf-parsers.svg)](https://www.npmjs.com/package/@faubulous/mentor-rdf-parsers)
[![License: LGPL-2.1](https://img.shields.io/badge/License-LGPL--2.1-blue.svg)](https://opensource.org/licenses/LGPL-2.1)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![RDF 1.2](https://img.shields.io/badge/RDF-1.2-green.svg)](https://www.w3.org/TR/rdf12-concepts/)

**A TypeScript library for serializing and formatting RDF and SPARQL, built for IDE integration.**

Designed as the counterpart to [@faubulous/mentor-rdf-parsers](https://github.com/faubulous/mentor-rdf-parsers), this library provides RDF serialization and SPARQL formatting with first-class support for editor workflows such as document formatting, range formatting, comment preservation, and configurable output styles.

## Features

| | |
|---|---|
| **Multi-Format Output** | Serialize to N-Triples, N-Quads, Turtle, TriG, N3, and JSON-LD |
| **SPARQL Formatting** | Format queries and updates with keyword casing, alignment, and comment preservation |
| **RDF 1.2** | Triple terms (`<<( s p o )>>`), reified triples, annotations, and language direction |
| **Sorting Strategies** | Alphabetical, by-type, semantic, and priority-based quad ordering |
| **Comment Preservation** | Token-based serialization keeps comments attached to their statements |
| **Token Serialization** | Serialize directly from parser tokens to preserve blank node IDs and source layout |
| **Configurable Layout** | Line width, predicate alignment, blank node style, object list wrapping, and more |
| **IDE-Ready** | Partial document serialization, range formatting, and VS Code integration examples |

## Quick Start

```bash
npm install @faubulous/mentor-rdf-serializers
```

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

console.log(serializer.serialize(quads, {
    prefixes: {
        'ex': 'http://example.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    }
}));
```

```turtle
PREFIX ex: <http://example.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

ex:subject a ex:Class ;
    ex:name "Example"@en .
```

## Documentation

Detailed guides and API documentation are available in the [docs](docs/README.md) folder:

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation and first serialization |
| [Architecture](docs/architecture.md) | Parser/serializer pipeline overview |
| [Serializers](docs/serializers.md) | Format-specific serializer usage |
| [Token Serialization](docs/token-serialization.md) | Serialize from parser tokens |
| [SPARQL Formatting](docs/sparql-formatting.md) | Query and update formatting |
| [Sorting](docs/sorting.md) | Quad ordering strategies |
| [Options](docs/options.md) | Full configuration reference |
| [RDF 1.2](docs/rdf-1.2.md) | Triple terms, annotations, language direction |
| [API Reference](docs/api-reference.md) | Interfaces and types |
| [VS Code Formatter](docs/vs-code-formatter.md) | Editor integration example |

## Related Projects

| Package | Description |
|---------|-------------|
| [@faubulous/mentor-rdf-parsers](https://github.com/faubulous/mentor-rdf-parsers) | RDF parsing library — the parser counterpart |
| [@faubulous/mentor-vscode](https://github.com/faubulous/mentor-vscode) | RDF IDE and workbench for VS Code |

## Contributing

Contributions are welcome. Please feel free to open an issue or submit a pull request on [GitHub](https://github.com/faubulous/mentor-rdf-serializers).

## License

[LGPL-2.1-or-later](https://github.com/faubulous/mentor-rdf-serializers/blob/main/LICENSE)
