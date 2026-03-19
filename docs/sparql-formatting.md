# SPARQL Formatting

The `SparqlFormatter` formats SPARQL queries and updates while preserving
comments. It supports keyword casing, pattern alignment, brace placement, and
line-width wrapping.

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

console.log(withComments.output);
```

For all available options, see [Serialization Options](options.md).

---

[Back to documentation index](README.md)
