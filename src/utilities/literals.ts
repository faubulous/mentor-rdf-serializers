/**
 * Checks if a literal needs long string quoting (contains newlines or quotes).
 */
export function needsLongString(value: string): boolean {
    return value.includes('\n') ||
        (value.includes('\r')) ||
        (value.includes('"""')) ||
        (value.includes('"') && value.length > 60);
}

/**
 * Checks if a number can be serialized as an integer literal.
 */
export function isInteger(value: string): boolean {
    return /^[+-]?\d+$/.test(value);
}

/**
 * Checks if a number can be serialized as a decimal literal.
 */
export function isDecimal(value: string): boolean {
    return /^[+-]?\d*\.\d+$/.test(value);
}

/**
 * Checks if a number can be serialized as a double literal.
 */
export function isDouble(value: string): boolean {
    return /^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(value);
}
