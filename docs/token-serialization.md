# Token-based Serialization

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
    preserveComments: true
});

// Serialize only a specific range (for range formatting)
const rangeOutput = tokenSerializer.serializeRange(
    parseResult.tokens,
    startOffset,
    endOffset,
    { preserveComments: true }
);
```

`serializeRange()` is particularly useful for range-formatting workflows where
only a portion of the document should be re-serialized while leaving the
surrounding text untouched.

---

[Back to documentation index](README.md)
