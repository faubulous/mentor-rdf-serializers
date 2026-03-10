import type { IToken } from 'chevrotain';
import { SparqlLexer, RdfToken } from '@faubulous/mentor-rdf-parsers';
import type {
    ISparqlFormatter,
    SerializationResult,
    SerializerOptions,
    TokenSerializerOptions
} from '../types.js';
import { mergeOptions } from '../utils.js';

/**
 * SPARQL-specific formatting options.
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
 * Token type names that are SPARQL keywords (should be formatted).
 */
const KEYWORD_TOKEN_NAMES = new Set([
    'A', 'SELECT', 'CONSTRUCT', 'DESCRIBE', 'ASK', 'WHERE', 'FROM', 'NAMED',
    'BASE', 'PREFIX', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
    'DISTINCT', 'REDUCED', 'OPTIONAL', 'UNION', 'FILTER', 'BIND', 'VALUES',
    'AS', 'GROUP', 'HAVING', 'SERVICE', 'SILENT', 'MINUS', 'UNDEF',
    'IN', 'NOT', 'EXISTS', 'INSERT', 'DELETE', 'DATA', 'LOAD', 'CLEAR',
    'DROP', 'CREATE', 'ADD', 'MOVE', 'COPY', 'INTO', 'TO', 'USING',
    'WITH', 'DEFAULT', 'ALL', 'GRAPH', 'COUNT', 'SUM', 'MIN', 'MAX',
    'AVG', 'SAMPLE', 'GROUP_CONCAT', 'SEPARATOR', 'STR', 'LANG', 'LANGMATCHES',
    'LANGDIR', 'DATATYPE', 'BOUND', 'IRI', 'URI', 'BNODE', 'RAND',
    'ABS', 'CEIL', 'FLOOR', 'ROUND', 'CONCAT', 'STRLEN', 'UCASE', 'LCASE',
    'ENCODE_FOR_URI', 'CONTAINS', 'STRSTARTS', 'STRENDS', 'STRBEFORE', 'STRAFTER',
    'YEAR', 'MONTH', 'DAY', 'HOURS', 'MINUTES', 'SECONDS', 'TIMEZONE', 'TZ',
    'NOW', 'UUID', 'STRUUID', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512',
    'COALESCE', 'IF', 'STRLANG', 'STRLANGDIR', 'STRDT', 'SAMETERM', 'ISIRI',
    'ISURI', 'ISBLANK', 'ISLITERAL', 'ISNUMERIC', 'REGEX', 'SUBSTR', 'REPLACE',
    'ISTRIPLE', 'TRIPLE', 'SUBJECT', 'PREDICATE', 'OBJECT', 'AND', 'OR'
]);

/**
 * Literal constants that should always be lowercase (not affected by uppercaseKeywords).
 * These are case-sensitive in SPARQL and must remain lowercase.
 * 'A' is the rdf:type shorthand and by convention is always lowercase.
 */
const LITERAL_CONSTANT_TOKEN_NAMES = new Set(['true', 'false', 'A']);

/**
 * Keywords that start a new major clause and should have a blank line before them.
 */
const MAJOR_CLAUSE_TOKEN_NAMES = new Set([
    'SELECT', 'CONSTRUCT', 'DESCRIBE', 'ASK', 'ORDER', 'GROUP',
    'HAVING', 'LIMIT', 'OFFSET', 'VALUES', 'INSERT', 'DELETE', 'LOAD',
    'CLEAR', 'DROP', 'CREATE', 'ADD', 'MOVE', 'COPY', 'WITH', 'OPTIONAL'
]);

/**
 * Keywords that should be on a new line but without a blank line before them.
 */
const NEWLINE_TOKEN_NAMES = new Set(['FROM', 'NAMED', 'WHERE']);

/**
 * Function keywords that should have no space before opening parenthesis.
 * These are keywords followed by ( that should keep the expression on a single line.
 */
const FUNCTION_TOKEN_NAMES = new Set([
    'COUNT', 'SUM', 'MIN', 'MAX', 'AVG', 'SAMPLE', 'GROUP_CONCAT',
    'COALESCE', 'IF', 'STRLANG', 'STRLANGDIR', 'STRDT', 'SAMETERM',
    'ISIRI', 'ISURI', 'ISBLANK', 'ISLITERAL', 'ISNUMERIC', 'REGEX', 'SUBSTR',
    'REPLACE', 'STRLEN', 'UCASE', 'LCASE', 'ENCODE_FOR_URI', 'CONTAINS',
    'STRSTARTS', 'STRENDS', 'STRBEFORE', 'STRAFTER', 'YEAR', 'MONTH',
    'DAY', 'HOURS', 'MINUTES', 'SECONDS', 'TIMEZONE', 'TZ', 'NOW', 'UUID',
    'STRUUID', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512', 'ABS', 'ROUND',
    'CEIL', 'FLOOR', 'RAND', 'BOUND', 'BNODE', 'IRI', 'URI', 'STR', 'LANG',
    'LANGMATCHES', 'DATATYPE', 'EXISTS', 'FILTER', 'BIND', 'CONCAT',
    'ISTRIPLE', 'TRIPLE', 'SUBJECT', 'PREDICATE', 'OBJECT'
]);

/**
 * Token names that represent term tokens (subjects, predicates, objects).
 */
const TERM_TOKEN_NAMES = new Set([
    'VAR1', 'VAR2', 'PNAME_LN', 'PNAME_NS', 'IRIREF', 'IRIREF_ABS',
    'BLANK_NODE_LABEL', 'STRING_LITERAL_QUOTE', 'STRING_LITERAL_SINGLE_QUOTE',
    'STRING_LITERAL_LONG_QUOTE', 'STRING_LITERAL_LONG_SINGLE_QUOTE',
    'INTEGER', 'DECIMAL', 'DOUBLE', 'INTEGER_POSITIVE', 'DECIMAL_POSITIVE',
    'DOUBLE_POSITIVE', 'INTEGER_NEGATIVE', 'DECIMAL_NEGATIVE', 'DOUBLE_NEGATIVE'
]);

/**
 * Formatter for SPARQL queries and updates.
 * 
 * Uses the W3C-compliant SparqlLexer from mentor-rdf-parsers for tokenization.
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
    private lexer = new SparqlLexer();

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
    formatFromTokens(tokens: IToken[], options?: TokenSerializerOptions): SerializationResult {
        const opts = this.getOptions(options as SparqlFormatterOptions);
        return this.formatTokens(tokens, opts);
    }

    /**
     * Main formatting method for SPARQL strings.
     */
    private formatSparql(input: string, options?: SparqlFormatterOptions): SerializationResult {
        const opts = this.getOptions(options);
        const result = this.lexer.tokenize(input);
        
        if (result.errors.length > 0) {
            // Return original input if there are lexing errors
            return { output: input };
        }
        
        // Get comments from lexer groups (they're not in the main token stream)
        const comments = (result.groups?.comments as IToken[] | undefined) ?? [];
        
        return this.formatTokens(result.tokens, opts, comments);
    }

    /**
     * Gets the token type name.
     */
    private getTokenTypeName(token: IToken): string {
        return token.tokenType?.name ?? '';
    }

    /**
     * Checks if a token is a keyword.
     */
    private isKeyword(token: IToken): boolean {
        return KEYWORD_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Checks if a token is a function keyword (like FILTER, BIND, COUNT, etc.).
     */
    private isFunctionKeyword(token: IToken): boolean {
        return FUNCTION_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Checks if a token is a literal constant (true, false, a).
     */
    private isLiteralConstant(token: IToken): boolean {
        return LITERAL_CONSTANT_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Checks if a token starts a major clause.
     */
    private isMajorClauseKeyword(token: IToken): boolean {
        return MAJOR_CLAUSE_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Checks if a token should be on a new line.
     */
    private isNewlineKeyword(token: IToken): boolean {
        return NEWLINE_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Checks if a token is a term token (subject/predicate/object).
     */
    private isTermToken(token: IToken): boolean {
        return TERM_TOKEN_NAMES.has(this.getTokenTypeName(token));
    }

    /**
     * Formats the token's value with appropriate casing.
     */
    private formatTokenValue(token: IToken, opts: Required<SparqlFormatterOptions>): string {
        const tokenName = this.getTokenTypeName(token);
        const image = token.image;

        // Literal constants (true, false, a) must stay lowercase
        if (this.isLiteralConstant(token)) {
            return image.toLowerCase();
        }

        // Keywords can be uppercased or lowercased based on options
        if (this.isKeyword(token)) {
            if (opts.lowercaseKeywords) {
                return image.toLowerCase();
            } else if (opts.uppercaseKeywords) {
                return image.toUpperCase();
            }
        }

        return image;
    }

    /**
     * Formats tokens into a string.
     */
    private formatTokens(tokens: IToken[], opts: Required<SparqlFormatterOptions>, comments: IToken[] = []): SerializationResult {
        const parts: string[] = [];
        
        // Sort comments by position for interleaving
        const sortedComments = [...comments].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
        let commentIndex = 0;
        let indentLevel = 0;
        let needsNewline = false;
        let needsBlankLine = false;
        let needsSpace = false;
        let lastToken: IToken | null = null;
        let lastNonWsToken: IToken | null = null;
        let inPrefix = false;
        let justEndedPrefix = false;
        let inWhereBlock = false;
        let currentLineLength = 0;
        let lastSubject: string | null = null;
        let triplePosition = 0; // 0=subject, 1=predicate, 2=object
        let functionCallDepth = 0; // Track nested function calls for single-line formatting
        let hasFromClause = false; // Track if query has FROM clause (for ASK WHERE formatting)
        let isAskQuery = false; // Track if this is an ASK query
        let lastWasNewline = false; // Track if we just added a newline

        const indent = opts.indent;
        const lineEnd = opts.lineEnd;

        // Helper to add content and track line length
        const addPart = (text: string, forceNewline = false) => {
            if (forceNewline || text === lineEnd || text.includes(lineEnd)) {
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
            const tokenName = this.getTokenTypeName(token);

            // Insert any comments that should appear before this token
            while (commentIndex < sortedComments.length) {
                const comment = sortedComments[commentIndex];
                const commentOffset = comment.startOffset ?? 0;
                const tokenOffset = token.startOffset ?? 0;
                
                if (commentOffset < tokenOffset) {
                    // This comment comes before the current token
                    if (parts.length > 0) {
                        // Check if comment is on a new line
                        if (lastNonWsToken && comment.startLine !== undefined && 
                            lastNonWsToken.endLine !== undefined &&
                            comment.startLine > lastNonWsToken.endLine) {
                            addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                            lastWasNewline = true;
                        } else {
                            addPart(' ');
                        }
                    }
                    addPart(comment.image);
                    needsNewline = true;
                    needsSpace = false;
                    commentIndex++;
                } else {
                    break;
                }
            }

            // Skip whitespace tokens (though the lexer typically doesn't emit them)
            if (tokenName === 'WS') {
                lastToken = token;
                continue;
            }

            // Detect blank lines from token position information
            // If there's a gap of more than one line between tokens, there was a blank line
            if (lastNonWsToken && token.startLine !== undefined && lastNonWsToken.endLine !== undefined) {
                const lineGap = token.startLine - lastNonWsToken.endLine;
                if (lineGap > 1) {
                    needsBlankLine = true;
                    needsNewline = true;
                }
            }

            // Handle comments
            if (tokenName === 'COMMENT') {
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0) {
                    addPart(' ');
                }
                addPart(token.image);
                needsNewline = true;
                needsSpace = false;
                lastToken = token;
                lastNonWsToken = token;
                continue;
            }

            // Format the token value
            let value = this.formatTokenValue(token, opts);

            // Track PREFIX declarations
            if (tokenName === 'PREFIX' || tokenName === 'BASE') {
                inPrefix = true;
            }

            // Track WHERE blocks for pattern formatting
            if (tokenName === 'WHERE') {
                inWhereBlock = true;
            }

            // Track ASK queries
            if (tokenName === 'ASK') {
                isAskQuery = true;
            }

            // Track FROM clause
            if (tokenName === 'FROM') {
                hasFromClause = true;
            }

            // Add blank line before major clauses (but not for first clause or after PREFIX)
            if (opts.separateClauses && 
                this.isMajorClauseKeyword(token) && 
                parts.length > 0 &&
                !inPrefix &&
                !justEndedPrefix) {
                addPart(lineEnd, true);
                needsNewline = true;
            }

            // Keywords that just need a newline (not blank line): FROM, NAMED, WHERE
            // Exception: ASK WHERE should stay on same line when no FROM clause
            if (opts.separateClauses &&
                this.isNewlineKeyword(token) &&
                parts.length > 0 &&
                !inPrefix) {
                // For WHERE after ASK with no FROM, keep on same line
                if (tokenName === 'WHERE' && isAskQuery && !hasFromClause) {
                    needsNewline = false;
                    needsSpace = true;
                } else {
                    needsNewline = true;
                }
            }

            // Reset justEndedPrefix after processing a non-PREFIX keyword
            if (tokenName !== 'PREFIX' && tokenName !== 'BASE') {
                justEndedPrefix = false;
            }

            // Handle opening braces
            if (tokenName === 'LCURLY') {
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0 && opts.sameBraceLine) {
                    addPart(' ');
                } else if (!opts.sameBraceLine) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                }
                addPart('{');
                indentLevel++;
                needsNewline = opts.prettyPrint;
                needsSpace = false;
                lastToken = token;
                lastNonWsToken = token;
                inPrefix = false;
                triplePosition = 0;
                lastSubject = null;
                continue;
            }

            // Handle closing braces
            if (tokenName === 'RCURLY') {
                indentLevel = Math.max(0, indentLevel - 1);
                if (opts.prettyPrint) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                }
                addPart('}');
                needsNewline = opts.prettyPrint;
                needsSpace = false;
                lastToken = token;
                lastNonWsToken = token;
                inWhereBlock = false;
                continue;
            }

            // Handle period (end of triple/prefix)
            if (tokenName === 'PERIOD') {
                // Add space before period if option is enabled
                if (opts.spaceBeforePunctuation && !inPrefix && parts.length > 0) {
                    addPart(' ');
                }
                addPart('.');
                if (inPrefix) {
                    // Always add newline after prefix declarations
                    needsNewline = opts.prettyPrint;
                    // Check if next is another PREFIX/BASE - don't add blank line between them
                    const nextTokenName = nextToken ? this.getTokenTypeName(nextToken) : '';
                    const nextIsPrefix = nextTokenName === 'PREFIX' || nextTokenName === 'BASE';
                    if (!nextIsPrefix && nextToken) {
                        // Add extra newline to separate prefixes from rest of query
                        needsNewline = opts.prettyPrint;
                    }
                } else if (indentLevel > 0) {
                    needsNewline = opts.prettyPrint;
                }
                needsSpace = true;
                lastToken = token;
                lastNonWsToken = token;
                inPrefix = false;
                triplePosition = 0;
                continue;
            }

            // Handle semicolon (predicate-object list)
            if (tokenName === 'SEMICOLON') {
                // Add space before semicolon if option is enabled
                if (opts.spaceBeforePunctuation && parts.length > 0) {
                    addPart(' ');
                }
                addPart(';');
                
                // Apply predicateListStyle - with indentation for predicate continuation
                if (opts.predicateListStyle === 'single-line') {
                    needsNewline = false;
                    needsSpace = true;
                } else if (opts.predicateListStyle === 'multi-line' || 
                          (opts.predicateListStyle === 'first-same-line' && indentLevel > 0)) {
                    if (opts.prettyPrint && indentLevel > 0) {
                        // Add newline with extra indentation for predicate continuation
                        addPart(lineEnd + this.getIndent(indentLevel, indent) + indent, true);
                        lastWasNewline = true;
                        needsNewline = false;
                        needsSpace = false;
                    } else {
                        needsNewline = false;
                        needsSpace = true;
                    }
                } else {
                    if (opts.prettyPrint && indentLevel > 0) {
                        // Add newline with extra indentation for predicate continuation
                        addPart(lineEnd + this.getIndent(indentLevel, indent) + indent, true);
                        lastWasNewline = true;
                        needsNewline = false;
                        needsSpace = false;
                    } else {
                        needsNewline = false;
                        needsSpace = true;
                    }
                }
                
                triplePosition = 1; // Next token should be predicate
                lastToken = token;
                lastNonWsToken = token;
                continue;
            }

            // Handle comma (object list)
            if (tokenName === 'COMMA') {
                addPart(',');
                
                // Apply objectListStyle
                if (opts.objectListStyle === 'multi-line') {
                    needsNewline = opts.prettyPrint && indentLevel > 0;
                    needsSpace = !needsNewline;
                } else if (opts.objectListStyle === 'auto' && opts.maxLineWidth > 0) {
                    // Check if next object would exceed line width
                    const nextObjLen = nextToken ? nextToken.image.length + 1 : 0;
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
                lastNonWsToken = token;
                continue;
            }

            // Handle opening parentheses and brackets
            if (tokenName === 'LPARENT' || tokenName === 'LBRACKET') {
                if (tokenName === 'LPARENT') {
                    // Track function calls for single-line formatting
                    const lastWasFunction = lastNonWsToken && this.isFunctionKeyword(lastNonWsToken);
                    if (lastWasFunction) {
                        functionCallDepth++;
                    }
                }
                
                // Check if this paren is part of a function call
                const lastWasFunction = lastNonWsToken && this.isFunctionKeyword(lastNonWsToken);
                
                // Don't add newline when opening paren is part of a function call
                // or when already inside a function call expression
                if (needsNewline && functionCallDepth === 0 && !lastWasFunction) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0) {
                    // Don't add space before ( if last token was a function keyword
                    if (tokenName !== 'LPARENT' || !lastWasFunction) {
                        addPart(' ');
                    }
                }
                needsNewline = false;
                
                addPart(token.image);
                needsSpace = false;
                lastToken = token;
                lastNonWsToken = token;
                continue;
            }

            // Handle closing parentheses and brackets
            if (tokenName === 'RPARENT' || tokenName === 'RBRACKET') {
                if (tokenName === 'RPARENT') {
                    // Decrement function call depth when closing paren
                    if (functionCallDepth > 0) {
                        functionCallDepth--;
                    }
                }
                addPart(token.image);
                needsSpace = true;
                needsNewline = false;
                lastToken = token;
                lastNonWsToken = token;
                continue;
            }

            // Track triple position for alignment within WHERE blocks
            // BUT skip this when inside a function call (FILTER, BIND, etc.)
            if (inWhereBlock && indentLevel > 0 && functionCallDepth === 0) {
                if (this.isTermToken(token)) {
                    // Check for subject change (blank line between subjects)
                    if (triplePosition === 0) {
                        if (opts.blankLinesBetweenSubjects && lastSubject !== null && token.image !== lastSubject) {
                            // Add blank line between different subjects
                            if (!needsNewline) {
                                addPart(lineEnd, true);
                            }
                            addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                            lastWasNewline = true;
                            needsNewline = false;
                            needsSpace = false;
                        }
                        lastSubject = token.image;
                    }
                    
                    triplePosition++;
                    if (triplePosition > 2) triplePosition = 2; // Stay at object position
                }
            }

            // Handle end of PREFIX/BASE declarations
            // PREFIX prefix: <iri> - after the IRI, the declaration is complete
            if (inPrefix && (tokenName === 'IRIREF' || tokenName === 'IRIREF_ABS')) {
                // Add the IRI first
                if (needsNewline) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                    needsNewline = false;
                } else if (needsSpace && parts.length > 0) {
                    if (lastNonWsToken && !['LPARENT', 'LBRACKET'].includes(this.getTokenTypeName(lastNonWsToken))) {
                        addPart(' ');
                    }
                }
                addPart(value);
                needsSpace = false;
                needsNewline = opts.prettyPrint;
                inPrefix = false;
                justEndedPrefix = true; // Mark that we just finished a PREFIX block
                lastToken = token;
                lastNonWsToken = token;
                continue;
            }

            // Check for line width wrapping
            if (opts.maxLineWidth > 0 && !needsNewline && needsSpace) {
                const spaceNeeded = parts.length > 0 && lastNonWsToken && 
                    !['LPARENT', 'LBRACKET'].includes(this.getTokenTypeName(lastNonWsToken)) ? 1 : 0;
                if (shouldWrap(spaceNeeded + value.length)) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                    lastWasNewline = true;
                    needsNewline = false;
                    needsSpace = false;
                }
            }

            // Add newline or space as needed
            // Never add newline before ^^ or right after ^^ (datatype marker must stay with literal)
            // Never add newline when inside a function call (FILTER, BIND, etc.)
            const isDatatypeContext = tokenName === 'DCARET' || 
                (lastNonWsToken && this.getTokenTypeName(lastNonWsToken) === 'DCARET');
            const inFunctionCall = functionCallDepth > 0;
            const shouldAvoidNewline = isDatatypeContext || inFunctionCall;
            
            if (needsNewline && !shouldAvoidNewline) {
                // Add blank line if there was one in source (but limit to one blank line)
                if (needsBlankLine) {
                    // Only add blank line if we haven't just added a newline
                    if (!lastWasNewline) {
                        addPart(lineEnd, true);
                    }
                    needsBlankLine = false;
                }
                addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                lastWasNewline = true;
                needsNewline = false;
            } else if (needsSpace && parts.length > 0) {
                // Don't add space after opening parens/brackets
                if (lastNonWsToken && !['LPARENT', 'LBRACKET'].includes(this.getTokenTypeName(lastNonWsToken))) {
                    // Don't add space before ( if last token was a function keyword
                    const isOpenParen = tokenName === 'LPARENT';
                    const lastWasFunction = lastNonWsToken && this.isFunctionKeyword(lastNonWsToken);
                    // Don't add space before or after ^^ (datatype marker)
                    if (!(isOpenParen && lastWasFunction) && !isDatatypeContext) {
                        addPart(' ');
                    }
                }
                lastWasNewline = false;
            } else {
                lastWasNewline = false;
            }
            
            // Reset newline flag if we skipped it due to datatype context or function call
            if (shouldAvoidNewline) {
                needsNewline = false;
                needsBlankLine = false;
            }

            addPart(value);
            needsSpace = true;
            lastToken = token;
            lastNonWsToken = token;
        }

        // Add any trailing comments
        while (commentIndex < sortedComments.length) {
            const comment = sortedComments[commentIndex];
            if (parts.length > 0) {
                // Check if comment is on a new line
                if (lastNonWsToken && comment.startLine !== undefined && 
                    lastNonWsToken.endLine !== undefined &&
                    comment.startLine > lastNonWsToken.endLine) {
                    addPart(lineEnd + this.getIndent(indentLevel, indent), true);
                } else {
                    addPart(' ');
                }
            }
            addPart(comment.image);
            commentIndex++;
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
