// Characters that need escaping in local names: _~.-!$&'()*+,;=/?#@%
const escapeChars = new Set(['_', '~', '.', '-', '!', '$', '&', "'", '(', ')', '*', '+', ',', ';', '=', '/', '?', '#', '@', '%']);

/**
 * Escapes special characters in an IRI for N-Triples/N-Quads format.
 * @param iri The IRI string to escape.
 * @returns The escaped IRI string.
 */
export function escapeIri(iri: string): string {
    let result = '';

    for (let i = 0; i < iri.length; i++) {
        const char = iri[i];
        const code = char.charCodeAt(0);

        // Characters that must be escaped in IRIs
        if (code < 0x20 || char === '<' || char === '>' || char === '"' ||
            char === '{' || char === '}' || char === '|' || char === '^' ||
            char === '`' || char === '\\') {
            if (code <= 0xFFFF) {
                result += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
            } else {
                result += '\\U' + code.toString(16).toUpperCase().padStart(8, '0');
            }
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Escapes special characters in a string literal.
 * @param str The string to escape.
 * @param longString Whether this is a long string (triple-quoted).
 * @returns The escaped string.
 */
export function escapeString(str: string, longString: boolean = false): string {
    let result = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);

        switch (char) {
            case '\\':
                result += '\\\\';
                break;
            case '\t':
                result += '\\t';
                break;
            case '\n':
                if (longString) {
                    result += char; // Preserve newlines in long strings
                } else {
                    result += '\\n';
                }
                break;
            case '\r':
                if (longString) {
                    result += char; // Preserve carriage returns in long strings
                } else {
                    result += '\\r';
                }
                break;
            case '\b':
                result += '\\b';
                break;
            case '\f':
                result += '\\f';
                break;
            case '"':
                if (longString) {
                    // In long strings, only escape if followed by two more quotes
                    if (i + 2 < str.length && str[i + 1] === '"' && str[i + 2] === '"') {
                        result += '\\"';
                    } else {
                        result += char;
                    }
                } else {
                    result += '\\"';
                }
                break;
            case "'":
                // Single quotes don't need escaping in double-quoted strings
                result += char;
                break;
            default:
                // Escape control characters
                if (code < 0x20) {
                    result += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
                } else {
                    result += char;
                }
        }
    }

    return result;
}

/**
 * Escapes a local name for use in prefixed names.
 * @param localName The local name to escape.
 * @returns The escaped local name.
 */
export function escapeLocalName(localName: string): string {
    let result = '';

    for (let i = 0; i < localName.length; i++) {
        const char = localName[i];

        if (escapeChars.has(char)) {
            result += '\\' + char;
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Checks if a string is a valid local name for prefixed names.
 * @param localName The string to check.
 * @returns True if valid, false otherwise.
 */
export function isValidLocalName(localName: string): boolean {
    if (localName.length === 0) {
        return true; // Empty local name is valid (e.g., ex:)
    }

    // First character must be PN_CHARS_U or digit or certain escaped chars
    const firstChar = localName[0];

    if (!isValidLocalNameStart(firstChar)) {
        return false;
    }

    // Rest of characters must be PN_CHARS or . or : or escaped chars
    for (let i = 1; i < localName.length; i++) {
        const char = localName[i];

        if (!isValidLocalNameChar(char)) {
            return false;
        }
    }

    // Cannot end with a dot
    if (localName.endsWith('.')) {
        return false;
    }

    return true;
}

/**
 * Checks if a character is valid at the start of a local name.
 */
function isValidLocalNameStart(char: string): boolean {
    const code = char.charCodeAt(0);

    return (
        (code >= 0x41 && code <= 0x5A) || // A-Z
        (code >= 0x61 && code <= 0x7A) || // a-z
        (code === 0x5F) || // _
        (code >= 0x30 && code <= 0x39) || // 0-9
        (code >= 0x00C0 && code <= 0x00D6) ||
        (code >= 0x00D8 && code <= 0x00F6) ||
        (code >= 0x00F8 && code <= 0x02FF) ||
        (code >= 0x0370 && code <= 0x037D) ||
        (code >= 0x037F && code <= 0x1FFF) ||
        (code >= 0x200C && code <= 0x200D) ||
        (code >= 0x2070 && code <= 0x218F) ||
        (code >= 0x2C00 && code <= 0x2FEF) ||
        (code >= 0x3001 && code <= 0xD7FF) ||
        (code >= 0xF900 && code <= 0xFDCF) ||
        (code >= 0xFDF0 && code <= 0xFFFD) ||
        (char === ':')
    );
}

/**
 * Checks if a character is valid in the middle/end of a local name.
 */
function isValidLocalNameChar(char: string): boolean {
    if (isValidLocalNameStart(char)) {
        return true;
    } else {
        const code = char.charCodeAt(0);

        return (
            (code === 0x2D) || // -
            (code === 0x2E) || // .
            (code === 0xB7) || // ·
            (code >= 0x0300 && code <= 0x036F) ||
            (code >= 0x203F && code <= 0x2040)
        );
    }
}
