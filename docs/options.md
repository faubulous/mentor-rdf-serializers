# Serialization Options

All serializers accept an options object that controls formatting and output
behaviour. The tables below list every supported option grouped by category.

## Common Options

| Option | Type | Description |
|--------|------|-------------|
| `prefixes` | `Record<string, string>` | Prefix mappings for compacting IRIs |
| `baseIri` | `string` | Base IRI for relative references |
| `sort` | `boolean` | Sort output alphabetically |
| `prettyPrint` | `boolean` | Enable pretty formatting |

## Turtle/TriG Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupBySubject` | `boolean` | `true` | Group triples by subject |
| `usePrefixedNames` | `boolean` | `true` | Use prefixed names where possible |
| `useShorthandTypes` | `boolean` | `true` | Use `a` for `rdf:type` |
| `useLongStrings` | `boolean` | `true` | Use `"""` for multiline strings |
| `useNumericShorthands` | `boolean` | `true` | Use numeric literals without quotes |

## Formatting Options

These options control the visual layout of Turtle, TriG, and SPARQL output:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxLineWidth` | `number` | `0` | Maximum line width before wrapping (0 = no wrapping) |
| `alignPredicates` | `boolean` | `false` | Align predicates in columns |
| `alignObjects` | `boolean` | `false` | Align objects in columns (requires `alignPredicates`) |
| `blankNodeStyle` | `'labeled' \| 'inline' \| 'auto'` | `'auto'` | How to format blank nodes |
| `inlineSingleUseBlankNodes` | `boolean` | `true` | In pretty-print mode, serialize single-use blank nodes locally as `[ ... ]` where possible |
| `objectListStyle` | `'single-line' \| 'multi-line' \| 'auto'` | `'auto'` | How to format multiple objects |
| `predicateListStyle` | `'single-line' \| 'multi-line' \| 'first-same-line'` | `'first-same-line'` | How to format predicate lists |
| `blankLinesBetweenSubjects` | `boolean` | `true` | Insert blank lines between subject blocks |

## JSON-LD Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useTypeShorthand` | `boolean` | `true` | Use `@type` instead of `rdf:type` |
| `useIdShorthand` | `boolean` | `true` | Use `@id` for IRI references |
| `compactArrays` | `boolean` | `true` | Unwrap single-element arrays |
| `embedContext` | `boolean` | `true` | Include `@context` in output |
| `jsonIndent` | `number` | `2` | Indentation for pretty printing |

## SPARQL Options

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

## Token Serialization Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preserveBlankNodeIds` | `boolean` | `true` | Preserve original blank node IDs |
| `preserveComments` | `boolean` | `true` | Preserve comments from source |

---

[Back to documentation index](README.md)
