import type {
    ISparqlFormatter,
    SerializationResult,
    SerializerOptions,
    TokenSerializerOptions
} from '../types.js';
import { mergeOptions } from '../utils.js';

/**
 * SPARQL-specific formatting options.
 * 
 * Inherits Turtle-style formatting options from SerializerOptions:
 * - `maxLineWidth`: Maximum line width before wrapping (0 = no wrapping)
 * - `alignPredicates`: Align predicates in columns within triple patterns
 * - `alignObjects`: Align objects in columns (requires alignPredicates)
 * - `objectListStyle`: How to format object lists ('single-line', 'multi-line', 'auto')
 * - `predicateListStyle`: How to format predicate lists ('single-line', 'multi-line', 'first-same-line')
 * - `blankLinesBetweenSubjects`: Insert blank lines between subject blocks in WHERE clause
 */
export interface SparqlFormatterOptions extends SerializerOptions {
    /**
     * Whether to uppercase SPARQL keywords (SELECT, WHERE, etc.).
     * Default: true
     */
    uppercaseKeywords?: boolean;

    /**
     * Whether to lowercase SPARQL keywords.
     * Default: false (takes precedence if both are true)
     */
    lowercaseKeywords?: boolean;

    /**
     * Whether to align WHERE clause patterns.
     * When true, triple patterns within blocks are aligned.
     * Default: true
     */
    alignPatterns?: boolean;

    /**
     * Whether to put opening braces on the same line as keywords.
     * Default: true
     */
    sameBraceLine?: boolean;

    /**
     * Whether to insert blank lines between major clauses.
     * Default: true
     */
    separateClauses?: boolean;

    /**
     * Whether to add a space before punctuation (. and ;).
     * Default: false
     */
    spaceBeforePunctuation?: boolean;
}

/**
 * SPARQL keywords that should be formatted.
 */
const SPARQL_KEYWORDS = new Set([
    'BASE', 'PREFIX', 'SELECT', 'DISTINCT', 'REDUCED', 'AS', 'CONSTRUCT',
    'DESCRIBE', 'ASK', 'FROM', 'NAMED', 'WHERE', 'ORDER', 'BY', 'ASC',
    'DESC', 'LIMIT', 'OFFSET', 'VALUES', 'LOAD', 'SILENT', 'INTO', 'CLEAR',
    'DROP', 'CREATE', 'ADD', 'MOVE', 'COPY', 'INSERT', 'DATA', 'DELETE',
    'WITH', 'USING', 'DEFAULT', 'GRAPH', 'ALL', 'OPTIONAL', 'SERVICE',
    'BIND', 'UNDEF', 'MINUS', 'UNION', 'FILTER', 'GROUP', 'HAVING',
    'COUNT', 'SUM', 'MIN', 'MAX', 'AVG', 'SAMPLE', 'GROUP_CONCAT',
    'SEPARATOR', 'COALESCE', 'IF', 'STRLANG', 'STRDT', 'sameTerm',
    'isIRI', 'isURI', 'isBLANK', 'isLITERAL', 'isNUMERIC', 'REGEX', 'SUBSTR',
    'REPLACE', 'STRLEN', 'UCASE', 'LCASE', 'ENCODE_FOR_URI', 'CONTAINS',
    'STRSTARTS', 'STRENDS', 'STRBEFORE', 'STRAFTER', 'YEAR', 'MONTH',
    'DAY', 'HOURS', 'MINUTES', 'SECONDS', 'TIMEZONE', 'TZ', 'NOW', 'UUID',
    'STRUUID', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512', 'ABS', 'ROUND',
    'CEIL', 'FLOOR', 'RAND', 'BOUND', 'BNODE', 'IRI', 'URI', 'STR', 'LANG',
    'LANGMATCHES', 'DATATYPE', 'EXISTS', 'NOT', 'IN', 'A', 'TRUE', 'FALSE',
    'AND', 'OR'
]);

/**
 * Literal constants that should always be lowercase (not affected by uppercaseKeywords).
 * These are case-sensitive in SPARQL and must remain lowercase.
 * 'A' is the rdf:type shorthand and by convention is always lowercase.
 */
const LITERAL_CONSTANTS = new Set(['TRUE', 'FALSE', 'A']);

/**
 * Keywords that start a new major clause and should have a blank line before them.
 */
const MAJOR_CLAUSE_KEYWORDS = new Set([
    'SELECT', 'CONSTRUCT', 'DESCRIBE', 'ASK', 'ORDER', 'GROUP',
    'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'INSERT', 'DELETE', 'LOAD',
    'CLEAR', 'DROP', 'CREATE', 'ADD', 'MOVE', 'COPY', 'WITH', 'OPTIONAL'
]);

/**
 * Keywords that should be on a new line but without a blank line before them.
 */
const NEWLINE_KEYWORDS = new Set(['FROM', 'NAMED', 'WHERE']);

/**
 * Function keywords that should have no space before opening parenthesis.
 */
const FUNCTION_KEYWORDS = new Set([
    'COUNT', 'SUM', 'MIN', 'MAX', 'AVG', 'SAMPLE', 'GROUP_CONCAT',
    'COALESCE', 'IF', 'STRLANG', 'STRDT', 'sameTerm',
    'isIRI', 'isURI', 'isBLANK', 'isLITERAL', 'isNUMERIC', 'REGEX', 'SUBSTR',
    'REPLACE', 'STRLEN', 'UCASE', 'LCASE', 'ENCODE_FOR_URI', 'CONTAINS',
    'STRSTARTS', 'STRENDS', 'STRBEFORE', 'STRAFTER', 'YEAR', 'MONTH',
    'DAY', 'HOURS', 'MINUTES', 'SECONDS', 'TIMEZONE', 'TZ', 'NOW', 'UUID',
    'STRUUID', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512', 'ABS', 'ROUND',
    'CEIL', 'FLOOR', 'RAND', 'BOUND', 'BNODE', 'IRI', 'URI', 'STR', 'LANG',
    'LANGMATCHES', 'DATATYPE', 'EXISTS', 'FILTER', 'BIND'
]);

/**
 * Token types for SPARQL formatting.
 */
interface SparqlToken {
    type: string;
    value: string;
    /** Number of newlines in this whitespace token (for WS tokens only) */
    newlines?: number;
    line?: number;
    column?: number;
}

/**
 * Formatter for SPARQL queries and updates.
 * 
 * This formatter can:
 * - Format SPARQL 1.1/1.2 queries and updates
 * - Normalize keyword casing
 * - Apply consistent indentation
 * - Align triple patterns
 * - Preserve comments
 * 
 * @see https://www.w3.org/TR/sparql12-query/
 */
export class SparqlFormatter implements ISparqlFormatter {
    /**
     * Formats a SPARQL query string.
     */
    formatQuery(query: string, options?: SparqlFormatterOptions): SerializationResult {
        return this.formatSparql(query, options);
    }

    /**
     * Formats a SPARQL update string.
     */
    formatUpdate(update: string, options?: SparqlFormatterOptions): SerializationResult {
        return this.formatSparql(update, options);
    }

    /**
     * Formats SPARQL from parsed tokens.
     */
    formatFromTokens(tokens: unknown[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options as SparqlFormatterOptions);
        return this.formatTokens(tokens as SparqlToken[], opts);
    }

    /**
     * Main formatting method for SPARQL strings.
     */
    private formatSparql(input: string, options?: SparqlFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const tokens = this.tokenize(input);
        return this.formatTokens(tokens, opts);
    }

    /**
     * Simple SPARQL tokenizer for formatting purposes.
     */
    private tokenize(input: string): SparqlToken[] {
        const tokens: SparqlToken[] = [];
        let pos = 0;
        let line = 1;
        let column = 1;

        while (pos < input.length) {
            const startLine = line;
            const startColumn = column;

            // Skip whitespace (but track newlines)
            if (/\s/.test(input[pos])) {
                let newlineCount = 0;
                while (pos < input.length && /\s/.test(input[pos])) {
                    if (input[pos] === '\n') {
                        newlineCount++;
                        line++;
                        column = 1;
                    } else {
                        column++;
                    }
                    pos++;
                }
                tokens.push({ type: 'WS', value: ' ', line: startLine, column: startColumn, newlines: newlineCount });
                continue;
            }

            // Comments
            if (input[pos] === '#') {
                let comment = '';
                while (pos < input.length && input[pos] !== '\n') {
                    comment += input[pos++];
                    column++;
                }
                tokens.push({ type: 'COMMENT', value: comment, line: startLine, column: startColumn });
                continue;
            }

            // IRIs
            if (input[pos] === '<') {
                let iri = '<';
                pos++;
                column++;
                while (pos < input.length && input[pos] !== '>') {
                    iri += input[pos++];
                    column++;
                }
                if (pos < input.length) {
                    iri += input[pos++];
                    column++;
                }
                tokens.push({ type: 'IRI', value: iri, line: startLine, column: startColumn });
                continue;
            }

            // String literals
            if (input[pos] === '"' || input[pos] === "'") {
                const quote = input[pos];
                let str = quote;
                pos++;
                column++;

                // Check for long string
                const isLong = input.slice(pos, pos + 2) === quote + quote;
                if (isLong) {
                    str += input[pos++] + input[pos++];
                    column += 2;
                }

                const endQuote = isLong ? quote + quote + quote : quote;
                while (pos < input.length) {
                    if (input.slice(pos, pos + endQuote.length) === endQuote) {
                        str += endQuote;
                        pos += endQuote.length;
                        column += endQuote.length;
                        break;
                    }
                    if (input[pos] === '\\' && pos + 1 < input.length) {
                        str += input[pos++] + input[pos++];
                        column += 2;
                    } else {
                        if (input[pos] === '\n') {
                            line++;
                            column = 1;
                        } else {
                            column++;
                        }
                        str += input[pos++];
                    }
                }
                tokens.push({ type: 'STRING', value: str, line: startLine, column: startColumn });
                continue;
            }

            // Variables
            if (input[pos] === '?' || input[pos] === '$') {
                let variable = input[pos++];
                column++;
                while (pos < input.length && /[A-Za-z0-9_]/.test(input[pos])) {
                    variable += input[pos++];
                    column++;
                }
                tokens.push({ type: 'VAR', value: variable, line: startLine, column: startColumn });
                continue;
            }

            // Punctuation
            if ('{}()[].,;^'.includes(input[pos])) {
                const char = input[pos++];
                column++;
                // Check for ^^ (datatype marker)
                if (char === '^' && input[pos] === '^') {
                    tokens.push({ type: 'PUNCT', value: '^^', line: startLine, column: startColumn });
                    pos++;
                    column++;
                } else {
                    tokens.push({ type: 'PUNCT', value: char, line: startLine, column: startColumn });
                }
                continue;
            }

            // Operators
            if ('!=<>|&+-*/'.includes(input[pos])) {
                let op = input[pos++];
                column++;
                // Multi-character operators
                while (pos < input.length && '!=<>|&'.includes(input[pos])) {
                    op += input[pos++];
                    column++;
                }
                tokens.push({ type: 'OP', value: op, line: startLine, column: startColumn });
                continue;
            }

            // Prefixed names and keywords
            if (/[A-Za-z_:]/.test(input[pos]) || input[pos] === '_') {
                let word = '';
                while (pos < input.length && /[A-Za-z0-9_:\-.]/.test(input[pos])) {
                    word += input[pos++];
                    column++;
                }

                // Check if it's a keyword
                const upper = word.toUpperCase();
                if (SPARQL_KEYWORDS.has(upper) && !word.includes(':')) {
                    tokens.push({ type: 'KEYWORD', value: word, line: startLine, column: startColumn });
                } else {
                    tokens.push({ type: 'PNAME', value: word, line: startLine, column: startColumn });
                }
                continue;
            }

            // Numbers
            if (/[0-9]/.test(input[pos]) || (input[pos] === '.' && pos + 1 < input.length && /[0-9]/.test(input[pos + 1]))) {
                let num = '';
                if (input[pos] === '+' || input[pos] === '-') {
                    num += input[pos++];
                    column++;
                }
                while (pos < input.length && /[0-9]/.test(input[pos])) {
                    num += input[pos++];
                    column++;
                }
                if (input[pos] === '.') {
                    num += input[pos++];
                    column++;
                    while (pos < input.length && /[0-9]/.test(input[pos])) {
                        num += input[pos++];
                        column++;
                    }
                }
                if (input[pos] === 'e' || input[pos] === 'E') {
                    num += input[pos++];
                    column++;
                    if (input[pos] === '+' || input[pos] === '-') {
                        num += input[pos++];
                        column++;
                    }
                    while (pos < input.length && /[0-9]/.test(input[pos])) {
                        num += input[pos++];
                        column++;
                    }
                }
                tokens.push({ type: 'NUMBER', value: num, line: startLine, column: startColumn });
                continue;
            }

            // Blank node labels
            if (input[pos] === '_' && input[pos + 1] === ':') {
                let bn = '_:';
                pos += 2;
                column += 2;
                while (pos < input.length && /[A-Za-z0-9_.\-]/.test(input[pos])) {
                    bn += input[pos++];
                    column++;
                }
                tokens.push({ type: 'BNODE', value: bn, line: startLine, column: startColumn });
                continue;
            }

            // Language tag
            if (input[pos] === '@') {
                let lang = '@';
                pos++;
                column++;
                while (pos < input.length && /[A-Za-z0-9\-]/.test(input[pos])) {
                    lang += input[pos++];
                    column++;
                }
                tokens.push({ type: 'LANGTAG', value: lang, line: startLine, column: startColumn });
                continue;
            }

            // Unknown character - consume and continue
            tokens.push({ type: 'UNKNOWN', value: input[pos++], line: startLine, column: startColumn });
            column++;
        }

        return tokens;
    }

    /**
     * Formats tokens into a string.
     */
    private formatTokens(tokens: SparqlToken[], opts: Required<SparqlFormatterOptions>): SerializationResult {
        const parts: string[] = [];
        let indentLevel = 0;
        let needsNewline = false;
        let needsBlankLine = false; // Track if we need to preserve a blank line from source
        let needsSpace = false;
        let lastToken: SparqlToken | null = null;
        let inPrefix = false;
        let justEndedPrefix = false; // Track if we just finished a PREFIX block
        let inWhereBlock = false;
        let currentLineLength = 0;
        let lastSubject: string | null = null;
        let triplePosition = 0; // 0=subject, 1=predicate, 2=object
        let parenDepth = 0; // Track parentheses depth to keep expressions on single line
        let inFunctionCall = false; // Track if we're inside FILTER/BIND/etc.
        let hasFromClause = false; // Track if query has FROM clause (for ASK WHERE formatting)
        let isAskQuery = false; // Track if this is an ASK query

        const indent = opts.indent;
        const lineEnd = opts.lineEnd;

        // Helper to add content and track line length
        const addPart = (text: string, forceNewline = false) => {
            if (forceNewline || (text === lineEnd) || text.includes(lineEnd)) {
                parts.push(text);
                const lines = text.split(lineEnd);
                currentLineLength = lines[lines.length - 1].length;
            } else {
                parts.push(text);
                currentLineLength += text.length;
            }
        };

        // Check if we should wrap based on maxLineWidth
        const shouldWrap = (nextLength: number) => {
            return opts.maxLineWidth > 0 && 
                   currentLineLength + nextLength > opts.maxLineWidth;
        };

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const nextToken = tokens[i + 1];

            // Handle whitespace tokens - preserve existing newlines from source
            if (token.type === 'WS') {
                if (token.newlines && token.newlines > 0) {
                    // Preserve newlines from the original source
                    needsNewline = true;
                    // If there were 2+ newlines, that means there was a blank line
                    if (token.newlines >= 2) {
                        needsBlankLine = true;
                    }
                } else {
                    needsSpace = true;
                }
                continue;
            }

            // Handle comments
            if (token.type === 'COMMENT') {
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0) {
                    addPart(' ');
                }
                addPart(token.value);
                needsNewline = true;
                needsSpace = false;
                lastToken = token;
                continue;
            }

            // Format keywords
            let value = token.value;
            if (token.type === 'KEYWORD') {
                // Literal constants (true, false) must stay lowercase - they are case-sensitive in SPARQL
                const isLiteralConstant = LITERAL_CONSTANTS.has(value.toUpperCase());
                if (isLiteralConstant) {
                    value = value.toLowerCase();
                } else if (opts.lowercaseKeywords) {
                    value = value.toLowerCase();
                } else if (opts.uppercaseKeywords) {
                    value = value.toUpperCase();
                }

                // Track PREFIX declarations
                if (value.toUpperCase() === 'PREFIX' || value.toUpperCase() === 'BASE') {
                    inPrefix = true;
                }

                // Track WHERE blocks for pattern formatting
                if (value.toUpperCase() === 'WHERE') {
                    inWhereBlock = true;
                }

                // Track ASK queries
                if (value.toUpperCase() === 'ASK') {
                    isAskQuery = true;
                }

                // Track FROM clause
                if (value.toUpperCase() === 'FROM') {
                    hasFromClause = true;
                }

                // Track function calls (FILTER, BIND, etc.) for single-line formatting
                if (FUNCTION_KEYWORDS.has(value.toUpperCase())) {
                    inFunctionCall = true;
                }

                // Add blank line before major clauses (but not for first clause or after PREFIX)
                if (opts.separateClauses && 
                    MAJOR_CLAUSE_KEYWORDS.has(value.toUpperCase()) && 
                    parts.length > 0 &&
                    !inPrefix &&
                    !justEndedPrefix) {
                    addPart(lineEnd, true);
                    needsNewline = true;
                }

                // Keywords that just need a newline (not blank line): FROM, NAMED, WHERE
                // Exception: ASK WHERE should stay on same line when no FROM clause
                if (opts.separateClauses &&
                    NEWLINE_KEYWORDS.has(value.toUpperCase()) &&
                    parts.length > 0 &&
                    !inPrefix) {
                    // For WHERE after ASK with no FROM, keep on same line
                    if (value.toUpperCase() === 'WHERE' && isAskQuery && !hasFromClause) {
                        needsNewline = false;
                        needsSpace = true;
                    } else {
                        needsNewline = true;
                    }
                }

                // Reset justEndedPrefix after processing a non-PREFIX keyword
                if (value.toUpperCase() !== 'PREFIX' && value.toUpperCase() !== 'BASE') {
                    justEndedPrefix = false;
                }
            }

            // Handle opening braces
            if (token.value === '{') {
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0 && opts.sameBraceLine) {
                    addPart(' ');
                } else if (!opts.sameBraceLine) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                }
                addPart('{');
                indentLevel++;
                needsNewline = opts.prettyPrint;
                needsSpace = false;
                lastToken = token;
                inPrefix = false;
                triplePosition = 0;
                lastSubject = null;
                continue;
            }

            // Handle closing braces
            if (token.value === '}') {
                indentLevel = Math.max(0, indentLevel - 1);
                if (opts.prettyPrint) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                }
                addPart('}');
                needsNewline = opts.prettyPrint;
                needsSpace = false;
                lastToken = token;
                inWhereBlock = false;
                continue;
            }

            // Handle period (end of triple/prefix)
            if (token.value === '.') {
                // Add space before period if option is enabled
                if (opts.spaceBeforePunctuation && !inPrefix && parts.length > 0) {
                    addPart(' ');
                }
                addPart('.');
                if (inPrefix) {
                    // Always add newline after prefix declarations
                    needsNewline = opts.prettyPrint;
                    // Check if next is another PREFIX/BASE - don't add blank line between them
                    const nextIsPrefix = nextToken?.type === 'KEYWORD' && 
                        (nextToken.value.toUpperCase() === 'PREFIX' || nextToken.value.toUpperCase() === 'BASE');
                    if (!nextIsPrefix && nextToken) {
                        // Add extra newline to separate prefixes from rest of query
                        needsNewline = opts.prettyPrint;
                    }
                } else if (indentLevel > 0) {
                    needsNewline = opts.prettyPrint;
                }
                needsSpace = true;
                lastToken = token;
                inPrefix = false;
                triplePosition = 0;
                continue;
            }

            // Handle semicolon (predicate-object list)
            if (token.value === ';') {
                // Add space before semicolon if option is enabled
                if (opts.spaceBeforePunctuation && parts.length > 0) {
                    addPart(' ');
                }
                addPart(';');
                
                // Apply predicateListStyle
                if (opts.predicateListStyle === 'single-line') {
                    needsNewline = false;
                    needsSpace = true;
                } else if (opts.predicateListStyle === 'multi-line' || 
                          (opts.predicateListStyle === 'first-same-line' && indentLevel > 0)) {
                    needsNewline = opts.prettyPrint && indentLevel > 0;
                    needsSpace = !needsNewline;
                } else {
                    needsNewline = opts.prettyPrint && indentLevel > 0;
                    needsSpace = true;
                }
                
                triplePosition = 1; // Next token should be predicate
                lastToken = token;
                continue;
            }

            // Handle comma (object list)
            if (token.value === ',') {
                addPart(',');
                
                // Apply objectListStyle
                if (opts.objectListStyle === 'multi-line') {
                    needsNewline = opts.prettyPrint && indentLevel > 0;
                    needsSpace = !needsNewline;
                } else if (opts.objectListStyle === 'auto' && opts.maxLineWidth > 0) {
                    // Check if next object would exceed line width
                    const nextObjLen = nextToken ? nextToken.value.length + 1 : 0;
                    if (shouldWrap(nextObjLen)) {
                        needsNewline = opts.prettyPrint;
                        needsSpace = !needsNewline;
                    } else {
                        needsSpace = true;
                    }
                } else {
                    needsSpace = true;
                }
                
                lastToken = token;
                continue;
            }

            // Handle other punctuation
            if (token.type === 'PUNCT' && '()[]'.includes(token.value)) {
                if (token.value === '(' || token.value === '[') {
                    // Track parentheses depth
                    if (token.value === '(') {
                        parenDepth++;
                    }
                    // Don't add newline when inside a function call expression
                    if (needsNewline && !inFunctionCall) {
                        addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                        needsNewline = false;
                    } else if (needsSpace && parts.length > 0) {
                        // Don't add space before ( if last token was a function keyword
                        const lastWasFunction = lastToken?.type === 'KEYWORD' && 
                            FUNCTION_KEYWORDS.has(lastToken.value.toUpperCase());
                        if (token.value !== '(' || !lastWasFunction) {
                            addPart(' ');
                        }
                    }
                    needsNewline = false;
                }
                if (token.value === ')') {
                    parenDepth--;
                    // Reset function call tracking when we close the last paren
                    if (parenDepth === 0) {
                        inFunctionCall = false;
                    }
                }
                addPart(token.value);
                needsSpace = token.value === ')' || token.value === ']';
                needsNewline = false;
                lastToken = token;
                continue;
            }

            // Track triple position for alignment within WHERE blocks
            if (inWhereBlock && indentLevel > 0) {
                const isTermToken = ['VAR', 'PNAME', 'IRI', 'BNODE', 'STRING', 'NUMBER'].includes(token.type);
                
                if (isTermToken) {
                    // Check for subject change (blank line between subjects)
                    if (triplePosition === 0) {
                        if (opts.blankLinesBetweenSubjects && lastSubject !== null && token.value !== lastSubject) {
                            // Add blank line between different subjects
                            if (!needsNewline) {
                                addPart(lineEnd, true);
                            }
                            addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                            needsNewline = false;
                            needsSpace = false;
                        }
                        lastSubject = token.value;
                    }
                    
                    triplePosition++;
                    if (triplePosition > 2) triplePosition = 2; // Stay at object position
                }
            }

            // Handle end of PREFIX/BASE declarations
            // PREFIX prefix: <iri> - after the IRI, the declaration is complete
            if (inPrefix && token.type === 'IRI') {
                // Add the IRI first
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0) {
                    if (lastToken && !['(', '['].includes(lastToken.value)) {
                        addPart(' ');
                    }
                }
                addPart(value);
                needsSpace = false;
                needsNewline = opts.prettyPrint;
                inPrefix = false;
                justEndedPrefix = true; // Mark that we just finished a PREFIX block
                lastToken = token;
                continue;
            }

            // Check for line width wrapping
            if (opts.maxLineWidth > 0 && !needsNewline && needsSpace) {
                const spaceNeeded = parts.length > 0 && lastToken && !['(', '['].includes(lastToken.value) ? 1 : 0;
                if (shouldWrap(spaceNeeded + value.length)) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    needsNewline = false;
                    needsSpace = false;
                }
            }

            // Add newline or space as needed
            // Never add newline before ^^ or right after ^^ (datatype marker must stay with literal)
            // Never add newline when inside a function call (FILTER, BIND, etc.)
            const isDatatypeContext = token.value === '^^' || lastToken?.value === '^^';
            const shouldAvoidNewline = isDatatypeContext || inFunctionCall;
            if (needsNewline && !shouldAvoidNewline) {
                // Add blank line if there was one in source (but limit to one blank line)
                if (needsBlankLine) {
                    // Check if we just added a newline to avoid duplicate blank lines
                    const lastPart = parts[parts.length - 1];
                    if (!lastPart || !lastPart.endsWith(lineEnd + lineEnd)) {
                        addPart(lineEnd, true);
                    }
                    needsBlankLine = false;
                }
                addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                needsNewline = false;
            } else if (needsSpace && parts.length > 0) {
                // Don't add space after opening parens/brackets
                if (lastToken && !['(', '['].includes(lastToken.value)) {
                    // Don't add space before ( if last token was a function keyword
                    const isOpenParen = token.value === '(' || (token.type === 'PUNCT' && token.value === '(');
                    const lastWasFunction = lastToken?.type === 'KEYWORD' && 
                        FUNCTION_KEYWORDS.has(lastToken.value.toUpperCase());
                    // Don't add space before or after ^^ (datatype marker)
                    if (!(isOpenParen && lastWasFunction) && !isDatatypeContext) {
                        addPart(' ');
                    }
                }
            }
            // Reset newline flag if we skipped it due to datatype context or function call
            if (shouldAvoidNewline) {
                needsNewline = false;
                needsBlankLine = false;
            }

            addPart(value);
            needsSpace = true;
            lastToken = token;
        }

        return {
            output: parts.join('').trim()
        };
    }

    /**
     * Gets the indentation string for a given level.
     */
    private getIndent(level: number, indent: string): string {
        return indent.repeat(level);
    }

    /**
     * Gets merged options with defaults.
     */
    private getOptions(options?: SparqlFormatterOptions): Required<SparqlFormatterOptions> {
        const base = mergeOptions(options);
        return {
            ...base,
            uppercaseKeywords: options?.uppercaseKeywords ?? true,
            lowercaseKeywords: options?.lowercaseKeywords ?? false,
            alignPatterns: options?.alignPatterns ?? true,
            sameBraceLine: options?.sameBraceLine ?? true,
            separateClauses: options?.separateClauses ?? true,
            spaceBeforePunctuation: options?.spaceBeforePunctuation ?? false,
            // Use inherited options with sensible SPARQL defaults
            maxLineWidth: options?.maxLineWidth ?? base.maxLineWidth,
            alignPredicates: options?.alignPredicates ?? base.alignPredicates,
            alignObjects: options?.alignObjects ?? base.alignObjects,
            objectListStyle: options?.objectListStyle ?? base.objectListStyle,
            predicateListStyle: options?.predicateListStyle ?? base.predicateListStyle,
            blankLinesBetweenSubjects: options?.blankLinesBetweenSubjects ?? base.blankLinesBetweenSubjects
        };
    }
}
