# API Reference

This page lists the public interfaces exported by the library.

## Interfaces

### `ISerializer`

```typescript
interface ISerializer {
    serializeQuad(quad: Quad | Rdf12Quad, options?: SerializerOptions): string;
    serialize(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): string;
    format(quads: Iterable<Quad | Rdf12Quad>, options?: SerializerOptions): SerializationResult;
}
```

### `SerializationResult`

```typescript
interface SerializationResult {
    output: string;
    warnings?: string[];
    sourceMap?: SourceMapEntry[];
}
```

### `ISparqlFormatter`

```typescript
interface ISparqlFormatter {
    formatFromText(query: string, options?: SerializerOptions): SerializationResult;
    formatFromTokens(tokens: unknown[], options?: SerializerOptions): SerializationResult;
}
```

For option types and defaults, see [Serialization Options](options.md).

---

[Back to documentation index](README.md)
