import type { Quad, Term } from '@rdfjs/types';
import {
    ILexer,
    IParser,
    N3Parser,
    N3Reader,
    NQuadsParser,
    NQuadsReader,
    NTriplesParser,
    NTriplesReader,
    RdfSyntax,
    RdfToken,
    SparqlParser,
    SparqlReader,
    TrigParser,
    TrigReader,
    TurtleParser,
    TurtleQuadReader,
    TurtleReader,
} from '@faubulous/mentor-rdf-parsers';
import { termToString } from 'rdf-string';
import { SerializationResult } from './serialization-result';

/**
 * The tokens of a document as a lexer returns them.
 */
export type LexingResult = ReturnType<ILexer['tokenize']>;

/**
 * The tokens of a document.
 */
type Tokens = LexingResult['tokens'];

/**
 * The syntax tree a grammar parser returns.
 */
type SyntaxTree = ReturnType<IParser['parse']>;

const SYNTAX_ERRORS_WARNING = 'The document has syntax errors, so it was not formatted.';

const UNREADABLE_WARNING = 'The content of the document could not be read, so the formatting could not be verified and was not applied.';

const CONTENT_CHANGED_WARNING = 'Formatting would have changed the content or the comments of the document, so it was not applied.';

/**
 * The namespace that prefixes the document uses without declaring them are given for verification.
 */
const PLACEHOLDER_NAMESPACE = 'urn:mentor:undeclared-prefix:';

/**
 * The outcome of reading a document for the guard.
 */
interface ReadResult {
    /**
     * Whether the grammar parser found syntax errors. Semantic errors, such as undefined prefixes, are not syntax errors.
     */
    hasSyntaxErrors: boolean;

    /**
     * The quads of the document, if they were asked for and could be read.
     */
    quads?: Quad[];
}

/**
 * Decides whether a formatter may replace a document with its formatted text. A document with syntax
 * errors is never formatted. When asked to verify, the formatted text must also read to the same content,
 * the quads of an RDF document or the syntax graph of a SPARQL query, and keep every comment.
 */
export class FormattingGuard {
    /**
     * The grammar parser of the syntax, created on first use because building it is expensive.
     */
    private _parser: IParser | undefined;

    /**
     * @param _syntax The syntax of the documents.
     * @param _lexer The lexer the formatter uses, which also reads the formatted text.
     */
    constructor(private readonly _syntax: RdfSyntax, private readonly _lexer: ILexer) { }

    /**
     * Formats a document unless that would format text with syntax errors or, when verifying, change its content.
     * @param input The document text.
     * @param lexingResult The tokens of the document. For a template, its placeholder tokens.
     * @param verify Whether the formatted text must read to the same content and keep every comment.
     * @param format Formats the document.
     * @returns The formatted document, or the input unchanged with a warning.
     */
    format(input: string, lexingResult: LexingResult, verify: boolean, format: () => SerializationResult): SerializationResult {
        const before = this._read(lexingResult.tokens, verify);

        if (before.hasSyntaxErrors) {
            return { output: input, warnings: [SYNTAX_ERRORS_WARNING] };
        }

        const result = format();

        if (!verify) {
            return result;
        }

        const warning = this._verify(input, lexingResult, before.quads, result.output);

        return warning ? { output: input, warnings: [warning] } : result;
    }

    /**
     * Checks that the formatted text reads to the same content as the document and keeps every comment.
     * @param input The document text.
     * @param lexingResult The tokens of the document.
     * @param quads The content of the document, if it could be read.
     * @param output The formatted text.
     * @returns The reason the formatted text must not be applied, or `undefined` if it may be.
     */
    private _verify(input: string, lexingResult: LexingResult, quads: Quad[] | undefined, output: string): string | undefined {
        const formatted = this._lexer.tokenize(output);

        if (formatted.errors.length > 0 || this._countComments(formatted) !== this._countComments(lexingResult)) {
            return CONTENT_CHANGED_WARNING;
        }

        let expected = quads;
        let actual = this._read(formatted.tokens, true).quads;

        if (!expected || !actual) {
            // A reader cannot resolve a prefix the document does not declare, so both sides get the same declarations.
            const declarations = this._declarePrefixes(lexingResult.tokens);

            expected = this._readText(declarations + input);
            actual = this._readText(declarations + output);
        }

        if (!expected) {
            return UNREADABLE_WARNING;
        }

        if (!actual || !this._haveSameContent(expected, actual)) {
            return CONTENT_CHANGED_WARNING;
        }

        return undefined;
    }

    /**
     * Declares a placeholder namespace for every prefix the tokens use, so that a reader can resolve names
     * whose prefix the document does not declare. A declaration in the document overrides its placeholder.
     * @param tokens The tokens of the document.
     * @returns The prefix declarations, one per line.
     */
    private _declarePrefixes(tokens: Tokens): string {
        const prefixes = new Set<string>();

        for (const token of tokens) {
            if (token.tokenType === RdfToken.PNAME_LN || token.tokenType === RdfToken.PNAME_NS) {
                prefixes.add(token.image.substring(0, token.image.indexOf(':')));
            }
        }

        return [...prefixes].map(prefix => `PREFIX ${prefix}: <${PLACEHOLDER_NAMESPACE}${prefix}#>\n`).join('');
    }

    /**
     * Reads the content of a text.
     * @param text The text to read.
     * @returns The quads of the text, or `undefined` if it does not read without errors.
     */
    private _readText(text: string): Quad[] | undefined {
        const lexingResult = this._lexer.tokenize(text);

        if (lexingResult.errors.length > 0) {
            return undefined;
        }

        return this._read(lexingResult.tokens, true).quads;
    }

    /**
     * Compares two contents quad by quad.
     * @param expected The content of the document.
     * @param actual The content of the formatted text.
     */
    private _haveSameContent(expected: Quad[], actual: Quad[]): boolean {
        if (expected.length !== actual.length) {
            return false;
        }

        const expectedKeys = this._getContentKeys(expected);
        const actualKeys = this._getContentKeys(actual);

        return expectedKeys.every((key, index) => key === actualKeys[index]);
    }

    /**
     * Counts the comments of a document, in its token stream and in the comment group of the lexer.
     * @param lexingResult The tokens of the document.
     */
    private _countComments(lexingResult: LexingResult): number {
        const inline = lexingResult.tokens.filter(token => token.tokenType === RdfToken.COMMENT).length;

        return inline + (lexingResult.groups?.comments?.length ?? 0);
    }

    /**
     * Reads the tokens of a document with the grammar of the syntax.
     * @param tokens The tokens of the document.
     * @param readQuads Whether to read the quads, or only check for syntax errors.
     */
    private _read(tokens: Tokens, readQuads: boolean): ReadResult {
        if (this._syntax === RdfSyntax.Turtle) {
            try {
                return { hasSyntaxErrors: false, quads: new TurtleQuadReader().read(tokens) };
            } catch {
                // A syntax error or an undefined prefix: the grammar parser tells them apart.
            }
        }

        const parser = this._getParser();
        const cst = parser.parse(tokens, false);

        if (parser.errors.length > 0) {
            return { hasSyntaxErrors: true };
        }

        if (!readQuads) {
            return { hasSyntaxErrors: false };
        }

        try {
            return { hasSyntaxErrors: false, quads: this._createReader().visit(cst) as Quad[] };
        } catch {
            // A semantic error, such as an undefined prefix, leaves the content unknown.
            return { hasSyntaxErrors: false };
        }
    }

    /**
     * Returns the grammar parser of the syntax, creating it on first use.
     */
    private _getParser(): IParser {
        this._parser ??= this._createParser();

        return this._parser;
    }

    /**
     * Creates the grammar parser of the syntax.
     */
    private _createParser(): IParser {
        switch (this._syntax) {
            case RdfSyntax.Turtle: {
                return new TurtleParser();
            }
            case RdfSyntax.TriG: {
                return new TrigParser();
            }
            case RdfSyntax.N3: {
                return new N3Parser();
            }
            case RdfSyntax.NTriples: {
                return new NTriplesParser();
            }
            case RdfSyntax.NQuads: {
                return new NQuadsParser();
            }
            case RdfSyntax.Sparql: {
                return new SparqlParser();
            }
            default: {
                throw new Error(`No parser for syntax: ${this._syntax}`);
            }
        }
    }

    /**
     * Creates a reader for the syntax. Readers keep the prefixes they have read, so each document gets its own.
     */
    private _createReader(): { visit(cst: SyntaxTree): unknown } {
        switch (this._syntax) {
            case RdfSyntax.Turtle: {
                return new TurtleReader();
            }
            case RdfSyntax.TriG: {
                return new TrigReader();
            }
            case RdfSyntax.N3: {
                return new N3Reader();
            }
            case RdfSyntax.NTriples: {
                return new NTriplesReader();
            }
            case RdfSyntax.NQuads: {
                return new NQuadsReader();
            }
            case RdfSyntax.Sparql: {
                return new SparqlReader();
            }
            default: {
                throw new Error(`No reader for syntax: ${this._syntax}`);
            }
        }
    }

    /**
     * Returns a comparable key for each quad, in order. Blank nodes are numbered by their first appearance,
     * because readers may label them differently on each read, as the SPARQL reader does.
     * @param quads The quads to describe.
     */
    private _getContentKeys(quads: Quad[]): string[] {
        const blankNodes = new Map<string, number>();

        const getKey = (term: Term): string => {
            if (term.termType === 'BlankNode') {
                if (!blankNodes.has(term.value)) {
                    blankNodes.set(term.value, blankNodes.size);
                }

                return `_:${blankNodes.get(term.value)}`;
            }

            if (term.termType === 'Quad') {
                return `<<${getKey(term.subject)} ${getKey(term.predicate)} ${getKey(term.object)} ${getKey(term.graph)}>>`;
            }

            return termToString(term);
        };

        return quads.map(quad => getKey(quad));
    }
}
