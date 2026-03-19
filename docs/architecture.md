# Architecture

The `mentor-rdf-serializers` package is designed to work seamlessly with `mentor-rdf-parsers`, forming a complete round-trip pipeline for RDF processing in IDEs and editors.

```mermaid
flowchart LR
    subgraph Source
        A["RDF text (Turtle, TriG, ...)"]
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
        S1["Quad serializers\n(Turtle, N-Triples, ...)"]
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

---

[Back to documentation index](README.md)
