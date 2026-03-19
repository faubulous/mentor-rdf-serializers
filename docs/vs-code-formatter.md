# VS Code Formatter

The examples below demonstrate how to integrate the serializer into a VS Code
extension as a document formatting provider. The same approach works for any
editor that supports the Language Server Protocol.

## Turtle Formatter

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

        const parseResult = this.parser.parse(text);

        if (parseResult.errors.length > 0) {
            return [];
        }

        const config = vscode.workspace.getConfiguration('turtle');

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

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );

        return [vscode.TextEdit.replace(fullRange, result.output)];
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            { language: 'turtle', scheme: 'file' },
            new TurtleDocumentFormatter()
        )
    );
}
```

## SPARQL Formatter

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

## Range Formatting

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

        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);

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

---

[Back to documentation index](README.md)
