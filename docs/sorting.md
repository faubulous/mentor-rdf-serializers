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

## Configuration summary

| Strategy | Purpose | Key options |
|----------|---------|-------------|
| Alphabetical | Stable lexicographic ordering | none |
| By type | Group by `rdf:type` | `unmatchedPosition`, `secondarySort` |
| Semantic | Definitions before dependents | `cyclesPosition` |
| Priority | Domain-specific ordering | `typeOrder`, `predicateOrder`, `unmatchedPosition`, `unmatchedSort` |

---

[Back to documentation index](README.md)
