# @faubulous/mentor-rdf-serializers

A comprehensive RDF serialization library for TypeScript, designed as the counterpart to [@faubulous/mentor-rdf-parsers](https://github.com/faubulous/mentor-rdf-parsers). Optimized for IDE use cases such as code formatting and partial serialization.

## Features

- **Multiple Formats**: N-Triples, N-Quads, Turtle, TriG, N3, JSON-LD
- **SPARQL Formatting**: Format SPARQL queries and updates with comment preservation
- **RDF 1.2 Support**: Full support for RDF 1.2 features including:
  - Triple Terms (`<<( s p o )>>`)
  - Reified Triples (`<< s p o >>`)
  - Annotations (`{| p o |}`)
  - Language direction (`@en--ltr`, `@ar--rtl`)
- **Advanced Formatting Options**: Control line width, alignment, blank node style, and more
- **Comment Preservation**: Preserve comments when reformatting source files
- **Token-based Serialization**: Serialize directly from parser tokens, preserving blank node IDs
- **Sorting Strategies**: Pluggable sorting with built-in alphabetical and priority-based strategies
- **IDE Integration**: Designed for code formatting and partial document serialization
- **Prefix Handling**: Automatic prefix compaction and expansion
- **Configurable Output**: Pretty printing, sorting, grouping options

## Architecture

The `mentor-rdf-serializers` package is designed to work seamlessly with `mentor-rdf-parsers`, forming a complete round-trip pipeline for RDF processing in IDEs and editors.

```mermaid
flowchart LR
    subgraph Source
        A[RDF text (Turtle, TriG, ...)]
        B[SPARQL text]
        C[RDF/JS quads]
    end

    subgraph mentor-rdf-parsers
        P1[Parser]
        T1[Tokens]
        Q1[Quads]

        A --> P1
        P1 --> T1
        P1 --> Q1

        B --> L2[SparqlLexer] --> T2[SPARQL tokens]
    end

    subgraph mentor-rdf-serializers
        S1[Quad serializers\n(Turtle, N-Triples, ...)]
        TS[TokenSerializer]
        SF[SparqlFormatter]
    end

    subgraph Output
        O1[Serialized / formatted RDF]
        O2[Formatted SPARQL]
    end

    C --> S1 --> O1
    Q1 --> S1
    T1 --> TS --> O1
    T2 --> SF --> O2

    style mentor-rdf-parsers fill:#e1f5fe
    style mentor-rdf-serializers fill:#fff3e0
```

## Installation

```bash
npm install @faubulous/mentor-rdf-serializers
```

## Quick Start

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
// @prefix ex: <http://example.org/> .
// @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
//
// ex:subject a ex:Class ;
//     ex:name "Example"@en .
```

## Serializers

### N-Triples

```typescript
import { NTriplesSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new NTriplesSerializer();
const output = serializer.serialize(quads, { sort: true });
```

### N-Quads

```typescript
import { NQuadsSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new NQuadsSerializer();
const output = serializer.serialize(quads);
```

### Turtle

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

### TriG

```typescript
import { TriGSerializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new TriGSerializer();
const output = serializer.serialize(quadsWithGraphs, {
    prefixes: { 'ex': 'http://example.org/' }
});
```

### N3

```typescript
import { N3Serializer } from '@faubulous/mentor-rdf-serializers';

const serializer = new N3Serializer();
const output = serializer.serialize(quads); // Supports formulas and implications
```

### JSON-LD

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

## SPARQL Formatting

```typescript
import { SparqlFormatter } from '@faubulous/mentor-rdf-serializers';

const formatter = new SparqlFormatter();

// Format a SELECT query
const selectResult = formatter.formatFromText(`
    SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(?o > 10) }
`, {
    uppercaseKeywords: true,
    alignPatterns: true,
    sameBraceLine: true,
    separateClauses: true,
    maxLineWidth: 80
});

console.log(selectResult.output);

// Format a SPARQL UPDATE (same API)
const updateResult = formatter.formatFromText(`
    INSERT DATA { <http://example.org/s> <http://example.org/p> "value" }
`, { 
    indent: '    ',
    uppercaseKeywords: true 
});

console.log(updateResult.output);

// Comments are preserved
const withComments = formatter.formatFromText(`
    # Find all people
    SELECT ?person WHERE {
        ?person a <http://example.org/Person> .  # Match persons
    }
`);

console.log(withComments.output); // Comments remain in the formatted output
```

## Token-based Serialization

For IDE integration, you can serialize directly from parser tokens, which preserves blank node IDs and comments from the source document.

```typescript
import { TokenSerializer } from '@faubulous/mentor-rdf-serializers';
import { TurtleParser } from '@faubulous/mentor-rdf-parsers';

const parser = new TurtleParser();
const parseResult = parser.parse(sourceDocument);

const tokenSerializer = new TokenSerializer();

// Serialize all tokens
const output = tokenSerializer.serialize(parseResult.tokens, {
    preserveBlankNodeIds: true,
    preserveComments: true  // Keeps comments in output
});

// Serialize only a specific range (for range formatting)
const rangeOutput = tokenSerializer.serializeRange(
    parseResult.tokens,
    startOffset,
    endOffset,
    { preserveComments: true }
);
```

## Serialization Options

### Common Options

| Option | Type | Description |
|--------|------|-------------|
| `prefixes` | `Record<string, string>` | Prefix mappings for compacting IRIs |
| `baseIri` | `string` | Base IRI for relative references |
| `sort` | `boolean` | Sort output alphabetically |
| `prettyPrint` | `boolean` | Enable pretty formatting |

### Turtle/TriG Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupBySubject` | `boolean` | `true` | Group triples by subject |
| `usePrefixedNames` | `boolean` | `true` | Use prefixed names where possible |
| `useShorthandTypes` | `boolean` | `true` | Use `a` for `rdf:type` |
| `useLongStrings` | `boolean` | `true` | Use `"""` for multiline strings |
| `useNumericShorthands` | `boolean` | `true` | Use numeric literals without quotes |

### Formatting Options

These options control the visual layout of Turtle, TriG, and SPARQL output:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxLineWidth` | `number` | `0` | Maximum line width before wrapping (0 = no wrapping) |
| `alignPredicates` | `boolean` | `false` | Align predicates in columns |
| `alignObjects` | `boolean` | `false` | Align objects in columns (requires `alignPredicates`) |
| `blankNodeStyle` | `'labeled' \| 'inline' \| 'auto'` | `'auto'` | How to format blank nodes |
| `objectListStyle` | `'single-line' \| 'multi-line' \| 'auto'` | `'auto'` | How to format multiple objects |
| `predicateListStyle` | `'single-line' \| 'multi-line' \| 'first-same-line'` | `'first-same-line'` | How to format predicate lists |
| `blankLinesBetweenSubjects` | `boolean` | `true` | Insert blank lines between subject blocks |

#### Blank Node Style

```typescript
// 'labeled' - Always use labeled blank nodes
_:b0 ex:name "Alice" .
_:b0 ex:knows _:b1 .

// 'inline' - Use inline property lists where possible
[ ex:name "Alice" ; ex:knows [ ex:name "Bob" ] ] .

// 'auto' - Inline for single-reference blank nodes, labeled for multi-reference
```

#### Object List Style

```typescript
// 'single-line' - Objects on same line
ex:s ex:p "a", "b", "c" .

// 'multi-line' - Each object on its own line
ex:s ex:p "a",
    "b",
    "c" .

// 'auto' - Based on maxLineWidth
```

#### Predicate List Style

```typescript
// 'first-same-line' - First predicate with subject
ex:s a ex:Class ;
    ex:name "Example" ;
    ex:value 42 .

// 'multi-line' - All predicates on separate lines
ex:s
    a ex:Class ;
    ex:name "Example" ;
    ex:value 42 .

// 'single-line' - All on one line (compact)
ex:s a ex:Class ; ex:name "Example" ; ex:value 42 .
```

### JSON-LD Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useTypeShorthand` | `boolean` | `true` | Use `@type` instead of `rdf:type` |
| `useIdShorthand` | `boolean` | `true` | Use `@id` for IRI references |
| `compactArrays` | `boolean` | `true` | Unwrap single-element arrays |
| `embedContext` | `boolean` | `true` | Include `@context` in output |
| `jsonIndent` | `number` | `2` | Indentation for pretty printing |

### SPARQL Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uppercaseKeywords` | `boolean` | `true` | Uppercase SPARQL keywords |
| `lowercaseKeywords` | `boolean` | `false` | Lowercase SPARQL keywords |
| `alignPatterns` | `boolean` | `true` | Align WHERE clause patterns |
| `sameBraceLine` | `boolean` | `true` | Opening braces on same line |
| `separateClauses` | `boolean` | `true` | Blank lines between major clauses |
| `maxLineWidth` | `number` | `0` | Maximum line width before wrapping |
| `objectListStyle` | `string` | `'auto'` | How to format object lists in patterns |
| `predicateListStyle` | `string` | `'first-same-line'` | How to format predicate lists |
| `blankLinesBetweenSubjects` | `boolean` | `true` | Blank lines between subject blocks |

### Token Serialization Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preserveBlankNodeIds` | `boolean` | `true` | Preserve original blank node IDs |
| `preserveComments` | `boolean` | `true` | Preserve comments from source |

## RDF 1.2 Features

### Triple Terms

```typescript
import { TurtleSerializer } from '@faubulous/mentor-rdf-serializers';
import type { TripleTerm, Rdf12Quad } from '@faubulous/mentor-rdf-serializers';

const tripleTerm: TripleTerm = {
    termType: 'TripleTerm',
    subject: { termType: 'NamedNode', value: 'http://example.org/s' },
    predicate: { termType: 'NamedNode', value: 'http://example.org/p' },
    object: { termType: 'Literal', value: 'value', language: '', datatype: { termType: 'NamedNode', value: 'http://www.w3.org/2001/XMLSchema#string' } }
};

// Output: <<( <http://example.org/s> <http://example.org/p> "value" )>>
```

### Reified Triples with Annotations

```turtle
# Input
ex:subject ex:predicate ex:object {| ex:source ex:source1 |} .

# Serialized correctly with annotations
```

### Language Direction (RDF 1.2)

```typescript
const literal = DataFactory.literal('مرحبا', 'ar--rtl');
// Output in Turtle: "مرحبا"@ar--rtl
// Output in JSON-LD: { "@value": "مرحبا", "@language": "ar", "@direction": "rtl" }
```

## API Reference

### Interfaces

#### `ISerializer`

```typescript
interface ISerializer {
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string;
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string;
    format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): SerializationResult;
}
```

#### `SerializationResult`

```typescript
interface SerializationResult {
    output: string;
    warnings?: string[];
    sourceMap?: SourceMapEntry[];
}
```

#### `ISparqlFormatter`

```typescript
interface ISparqlFormatter {
    formatFromText(query: string, options?: SerializerOptions): SerializationResult;
    formatFromTokens(tokens: unknown[], options?: SerializerOptions): SerializationResult;
}
```

## VS Code Formatter

Here's how to create a document formatter for Turtle files in VS Code:

```typescript
import * as vscode from 'vscode';
import { TurtleParser } from '@faubulous/mentor-rdf-parsers';
import { TurtleSerializer } from '@faubulous/mentor-rdf-serializers';

export class TurtleDocumentFormatter implements vscode.DocumentFormattingEditProvider {
    private parser = new TurtleParser();
    private serializer = new TurtleSerializer();

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const text = document.getText();
        
        // Parse the document
        const parseResult = this.parser.parse(text);
        
        if (parseResult.errors.length > 0) {
            // Don't format if there are parse errors
            return [];
        }

        // Get user preferences from VS Code settings
        const config = vscode.workspace.getConfiguration('turtle');
        
        // Serialize with formatting options
        const result = this.serializer.serialize(parseResult.quads, {
            prefixes: parseResult.prefixes,
            baseIri: parseResult.baseIri,
            indent: options.insertSpaces ? ' '.repeat(options.tabSize) : '\t',
            prettyPrint: true,
            groupBySubject: true,
            sort: config.get('sortStatements', true),
            maxLineWidth: config.get('maxLineWidth', 80),
            alignPredicates: config.get('alignPredicates', false),
            blankNodeStyle: config.get('blankNodeStyle', 'auto'),
            predicateListStyle: config.get('predicateListStyle', 'first-same-line'),
            blankLinesBetweenSubjects: config.get('blankLinesBetweenSubjects', true)
        });

        // Return a single edit replacing the entire document
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );

        return [vscode.TextEdit.replace(fullRange, result.output)];
    }
}

// Register the formatter in your extension's activate function
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            { language: 'turtle', scheme: 'file' },
            new TurtleDocumentFormatter()
        )
    );
}
```

### SPARQL Formatter for VS Code

```typescript
import * as vscode from 'vscode';
import { SparqlFormatter } from '@faubulous/mentor-rdf-serializers';

export class SparqlDocumentFormatter implements vscode.DocumentFormattingEditProvider {
    private formatter = new SparqlFormatter();

    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const text = document.getText();
        const config = vscode.workspace.getConfiguration('sparql');
        
        const result = this.formatter.formatFromText(text, {
            indent: options.insertSpaces ? ' '.repeat(options.tabSize) : '\t',
            prettyPrint: true,
            uppercaseKeywords: config.get('uppercaseKeywords', true),
            alignPatterns: config.get('alignPatterns', true),
            sameBraceLine: config.get('sameBraceLine', true),
            separateClauses: config.get('separateClauses', true),
            maxLineWidth: config.get('maxLineWidth', 80)
        });

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );

        return [vscode.TextEdit.replace(fullRange, result.output)];
    }
}
```

### Range Formatting (Format Selection)

For formatting only a selected range, use the `TokenSerializer` to preserve surrounding content:

```typescript
import { TurtleParser } from '@faubulous/mentor-rdf-parsers';
import { TokenSerializer } from '@faubulous/mentor-rdf-serializers';

export class TurtleRangeFormatter implements vscode.DocumentRangeFormattingEditProvider {
    private parser = new TurtleParser();
    private tokenSerializer = new TokenSerializer();

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const text = document.getText();
        const parseResult = this.parser.parse(text);
        
        if (parseResult.errors.length > 0) {
            return [];
        }

        // Get byte offsets for the selected range
        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);

        // Serialize only tokens within the range
        const result = this.tokenSerializer.serializeRange(
            parseResult.tokens,
            startOffset,
            endOffset,
            { preserveComments: true, preserveBlankNodeIds: true }
        );

        return [vscode.TextEdit.replace(range, result.output)];
    }
}
```

## License

[LGPL-2.1-or-later](https://github.com/faubulous/mentor-rdf-parsers/blob/main/LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [@faubulous/mentor-rdf-parsers](https://github.com/faubulous/mentor-rdf-parsers) - RDF parsing library
- [@faubulous/mentor-vscode](https://github.com/faubulous/mentor-vscode) - RDF IDE and workbench
