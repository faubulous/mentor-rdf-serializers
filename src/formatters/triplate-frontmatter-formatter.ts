import {
    compile,
    symbols as triplateSymbols,
    type ExampleValue,
    type TemplateSymbol,
    type TypeBase,
    type TypeExpr
} from 'triplate';

/** Options for {@link TriplateFrontmatterFormatter}. */
export interface FrontmatterFormatOptions {
    /** The indent string for one nesting level (e.g. `'  '` or `'\t'`). */
    indent: string;
}

type CommentSymbol = Extract<TemplateSymbol, { kind: 'comment' }>;

/**
 * Formats the `---…---` frontmatter block of a Triplate template from its parsed AST:
 * a canonical `params { … }` / `example id { … }` layout, one declaration per line at
 * the requested indent, with `#` comments preserved and re-indented in place.
 *
 * The frontmatter is Triplate's own syntax (not RDF), so it is reprinted from
 * `triplate`'s compiled AST rather than the host token stream. The formatter never
 * corrupts: on any failure — including if the reprint would not parse back — it returns
 * the original frontmatter verbatim.
 */
export class TriplateFrontmatterFormatter {
    /** 
     * Captures the leading `---…---` frontmatter block of a Triplate template.
     */
    private readonly _frontmatterExpression = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

    /**
     * Returns the formatted `---…---` block for `templateText` (everything up to and
     * including the closing `---` line), or the original frontmatter unchanged if it
     * cannot be safely reformatted. Returns `''` when there is no frontmatter.
     */
    format(templateText: string, options: FrontmatterFormatOptions): string {
        const match = this._frontmatterExpression.exec(templateText);

        if (!match) {
            return '';
        }

        const original = match[0];

        try {
            const formatted = this._format(templateText, options);

            // Safety net: the reformatted frontmatter must parse back to a valid template.
            compile(formatted + templateText.slice(original.length));

            return formatted;
        } catch {
            return original;
        }
    }

    private _format(text: string, options: FrontmatterFormatOptions): string {
        const indent = options.indent;
        const compiled = compile(text);
        const allSymbols = triplateSymbols(text);

        const comments = allSymbols
            .filter((s): s is CommentSymbol => s.kind === 'comment')
            .sort((a, b) => a.start - b.start);
        const paramOffsets = allSymbols.filter(s => s.kind === 'paramDecl').map(s => s.start);
        const bindingOffsets = allSymbols.filter(s => s.kind === 'bindingKey').map(s => s.start);

        const lines: string[] = [];
        let ci = 0;
        let firstBlock = true;

        // Emit any comments positioned before `offset`, indented with `ind`.
        const flushBefore = (offset: number, ind: string): void => {
            while (ci < comments.length && comments[ci].start < offset) {
                lines.push(ind + comments[ci].value);
                ci++;
            }
        };

        // Opens a `{ … }` block, separating it from the previous block with one blank line,
        // then flushing any comments that precede it (so a comment stays attached to the block).
        const startBlock = (offset: number): void => {
            if (!firstBlock) {
                lines.push('');
            }

            firstBlock = false;
            flushBefore(offset, '');
        };

        // params block.
        if (compiled.schema.params.length > 0) {
            startBlock(this._paramsKeywordOffset(text, paramOffsets[0] ?? Infinity));
            lines.push('params {');

            compiled.schema.params.forEach((param, i) => {
                flushBefore(paramOffsets[i] ?? Infinity, indent);
                lines.push(`${indent}${param.name}: ${this._stringifyType(param.type)}`);
            });

            lines.push('}');
        }

        // example blocks.
        let bk = 0;

        for (const example of compiled.examples) {
            startBlock(this._offsetOf(text, example.line, example.column));

            const description = example.description !== undefined ? ` ${this._quote(example.description)}` : '';
            lines.push(`example ${example.id}${description} {`);

            for (const [name, value] of Object.entries(example.bindings)) {
                flushBefore(bindingOffsets[bk] ?? Infinity, indent);
                bk++;
                lines.push(`${indent}${name}: ${this._stringifyValue(value)}`);
            }

            lines.push('}');
        }

        // Trailing comments before the closing fence.
        flushBefore(Infinity, '');

        return `---\n${lines.join('\n')}\n---\n`;
    }


    /** Locates the `params` keyword offset within the frontmatter, for comment placement. */
    private _paramsKeywordOffset(text: string, fallback: number): number {
        const fm = this._frontmatterExpression.exec(text)?.[0] ?? '';
        const i = fm.search(/\bparams\b/);

        return i >= 0 ? i : fallback;
    }

    /** Converts a 1-based line/column (Triplate AST convention) to a 0-based offset. */
    private _offsetOf(text: string, line: number, column: number): number {
        let offset = 0;
        let currentLine = 1;

        while (currentLine < line && offset < text.length) {
            if (text.charCodeAt(offset) === 10 /* \n */) {
                currentLine++;
            }
            offset++;
        }

        return offset + (column - 1);
    }

    /** Stringifies a Triplate type expression to canonical single-line source. */
    private _stringifyType(type: TypeExpr): string {
        let s = this._stringifyTypeBase(type.base);

        if (type.array) s += '[]';
        if (type.optional) s += ' optional';
        if (type.min !== undefined) s += ` min ${type.min}`;
        if (type.max !== undefined) s += ` max ${type.max}`;

        return s;
    }

    private _stringifyTypeBase(base: TypeBase): string {
        if (base.kind === 'record') {
            const fields = Object.entries(base.fields).map(([name, t]) => `${name}: ${this._stringifyType(t)}`).join(', ');
            return `{ ${fields} }`;
        }

        if (base.kind === 'literal') {
            return `literal(${base.datatype})`;
        }

        if (base.kind === 'custom') {
            return base.name;
        }

        return base.kind;
    }

    /** Stringifies a Triplate example value to canonical single-line source. */
    private _stringifyValue(value: ExampleValue): string {
        switch (value.kind) {
            case 'iri':
                return `<${value.value}>`;
            case 'pname':
                return `${value.prefix}:${value.local}`;
            case 'string': {
                const literal = this._quote(value.value);

                if (value.lang) {
                    return `${literal}@${value.lang}`;
                } else if (value.datatype) {
                    return `${literal}^^${value.datatype}`;
                } else {
                    return literal;
                }
            }
            case 'number':
                return String(value.value);
            case 'bool':
                return String(value.value);
            case 'list':
                return `[${value.items.map(item => this._stringifyValue(item)).join(', ')}]`;
            case 'record': {
                const fields = Object.entries(value.fields).map(([name, v]) => `${name}: ${this._stringifyValue(v)}`).join(', ');
                return `{ ${fields} }`;
            }
        }
    }

    /** Quotes a string as a Triplate `"…"` literal, escaping `\`, `"` and newlines. */
    private _quote(s: string): string {
        return `"${s.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')}"`;
    }
}