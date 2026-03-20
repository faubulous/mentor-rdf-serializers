# Sorting

The serializer can reorder RDF quads before output. This is useful for stable formatting, code reviews, and domain-specific ordering.

## Built-in strategies

### Alphabetical

Alphabetical sorting is the default. It orders quads by:

1. subject
2. predicate
3. object

Use it when you want predictable, lexicographic output.

### By type

The by-type strategy groups quads by each subject's `rdf:type`.

- Typed resources are grouped by their type IRI
- Untyped resources can be placed at the start or end
- Output within each group can optionally be sorted alphabetically

Example:

```typescript
import { createByTypeStrategy, applySortingStrategy } from '@faubulous/mentor-rdf-serializers';

const strategy = createByTypeStrategy({
    unmatchedPosition: 'end',
    secondarySort: 'alphabetical'
});

const sorted = applySortingStrategy(quads, strategy);
```

### Semantic

The semantic strategy tries to place referenced resources before the resources that depend on them.

This is useful when you want definitions to appear before usage.

- It builds a dependency graph from named-node and blank-node objects
- It performs a topological sort
- Cycles are handled gracefully

Example:

```typescript
import { createSemanticStrategy, applySortingStrategy } from '@faubulous/mentor-rdf-serializers';

const sorted = applySortingStrategy(quads, createSemanticStrategy());
```

### Priority

The priority strategy orders resources by type priority and can also use predicate priority.

- `typeOrder` defines the preferred type ordering
- `predicateOrder` can refine ordering within the same resource rank
- Unmatched resources can go at the start or end
- Unmatched entries can still be sorted alphabetically

Example:

```typescript
import { createPriorityStrategy, applySortingStrategy } from '@faubulous/mentor-rdf-serializers';

const sorted = applySortingStrategy(quads, createPriorityStrategy({
    typeOrder: [
        'http://www.w3.org/2000/01/rdf-schema#Class',
        'http://www.w3.org/2002/07/owl#ObjectProperty'
    ],
    predicateOrder: [
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        'http://www.w3.org/2000/01/rdf-schema#label'
    ]
}));
```

## Applying sorting

`applySortingStrategy()` accepts three forms:

- `false` to disable sorting
- `true` for alphabetical sorting
- a strategy object or custom comparator

Example:

```typescript
import { applySortingStrategy, alphabeticalStrategy } from '@faubulous/mentor-rdf-serializers';

const sorted = applySortingStrategy(quads, alphabeticalStrategy);
```

## Comment preservation

Quad-level sorting does not know which source comments belong to which statement.
If you need comments to move with their triple, the sort should operate on
statement groups, not raw quads.

Best practice:

1. Use the parser's token metadata to recover source offsets for each statement.
2. Group the leading comment block and any same-line trailing comment with the statement.
3. Sort the statement groups as a unit.
4. Serialize each group back to text in its sorted position.

This preserves cases such as:

- a comment line immediately before a subject
- an inline or end-of-line comment after the final object or period

If you only sort raw quads, comments can be preserved in the output stream but
they will not automatically move with the matching triple.

### Example: Sorting quads while preserving comments

The `StatementSerializer` class handles the complete workflow — merging,
sorting, prefix emission, and serialization — so you do not need to
orchestrate multiple functions manually.

```typescript
import { TurtleLexer, TurtleParser, TurtleReader, StatementInfo } from '@faubulous/mentor-rdf-parsers';
import {
    StatementSerializer,
    TurtleSerializer,
} from '@faubulous/mentor-rdf-serializers';
import DataFactory from '@rdfjs/data-model';

// 1. Parse the source document (keeping tokens for comment recovery)
const source = `
@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# This class represents people
ex:Person a rdfs:Class .

# This class represents organizations
ex:Organization a rdfs:Class . # core concept
`;

const lexResult = new TurtleLexer().tokenize(source);
const cst = new TurtleParser().parse(lexResult.tokens);
const reader = new TurtleReader();

// 2. Get statement contexts with comments directly from the parser
const contexts = reader.readStatementInfos(cst, lexResult.tokens);

// 3. Create a StatementSerializer backed by a TurtleSerializer
const serializer = new StatementSerializer(new TurtleSerializer());

// 4. Optionally add new quads (they will have no comments)
const newQuad = DataFactory.quad(
    DataFactory.namedNode('http://example.org/Animal'),
    DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#Class')
);

const merged = serializer.addStatements(contexts, [newQuad]);

// 5. Serialize to a complete document — prefixes, sorting, and comments
//    are all handled automatically
const output = serializer.serialize(merged, {
    prefixes: {
        ex: 'http://example.org/',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    },
    lowercaseDirectives: true,   // match the original @prefix style
    sort: true,
    blankLinesBetweenSubjects: true,
});

console.log(output);
```

Output (sorted alphabetically with comments preserved):

```turtle
@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Animal a rdfs:Class .

# This class represents organizations
ex:Organization a rdfs:Class . # core concept

# This class represents people
ex:Person a rdfs:Class .
```

Notice that:
- Prefix declarations are emitted automatically by `serialize()` — no manual
  construction needed
- Set `lowercaseDirectives: true` to match the original Turtle `@prefix` style,
  or leave it `false` (the default) for SPARQL-style `PREFIX`
- The new `ex:Animal` triple appears first (alphabetically before Organization)
- Each original comment stays attached to its statement
- The trailing comment `# core concept` moves with `ex:Organization`

### Using custom sorting strategies

You can pass any sorting strategy to `StatementSerializer.serialize()` via the
`sort` option, or call `sort()` separately:

```typescript
import {
    StatementSerializer,
    TurtleSerializer,
    createPriorityStrategy,
} from '@faubulous/mentor-rdf-serializers';

const ss = new StatementSerializer(new TurtleSerializer());

const strategy = createPriorityStrategy({
    typeOrder: [
        'http://www.w3.org/2002/07/owl#Class',
        'http://www.w3.org/2000/01/rdf-schema#Class'
    ]
});

// Option A: pass the strategy to serialize()
const output = ss.serialize(contexts, { prefixes, sort: strategy });

// Option B: sort explicitly, then serialize without re-sorting
const sorted = ss.sort(contexts, strategy);
const output2 = ss.serialize(sorted, { prefixes });
```

## Configuration summary

| Strategy | Purpose | Key options |
|----------|---------|-------------|
| Alphabetical | Stable lexicographic ordering | none |
| By type | Group by `rdf:type` | `unmatchedPosition`, `secondarySort` |
| Semantic | Definitions before dependents | `cyclesPosition` |
| Priority | Domain-specific ordering | `typeOrder`, `predicateOrder`, `unmatchedPosition`, `unmatchedSort` |

---

[Back to documentation index](README.md)
