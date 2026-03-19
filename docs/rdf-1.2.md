# RDF 1.2 Features

All serializers support the latest RDF 1.2 constructs. The examples below show
how triple terms, reified triples with annotations, and base-direction–aware
language tags are represented in the output.

## Triple Terms

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

## Reified Triples with Annotations

```turtle
# Input
ex:subject ex:predicate ex:object {| ex:source ex:source1 |} .

# Serialized correctly with annotations
```

## Language Direction

```typescript
const literal = DataFactory.literal('مرحبا', 'ar--rtl');
// Output in Turtle: "مرحبا"@ar--rtl
// Output in JSON-LD: { "@value": "مرحبا", "@language": "ar", "@direction": "rtl" }
```

---

[Back to documentation index](README.md)
