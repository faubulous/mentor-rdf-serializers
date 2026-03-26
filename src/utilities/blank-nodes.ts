/**
 * Counter for generating unique blank node IDs.
 */
let blankNodeCounter = 0;

const BLANK_NODE_ID_START = /^[A-Za-z0-9_]/;
const BLANK_NODE_ID_BODY = /[A-Za-z0-9_.-]/;
const BLANK_NODE_ID_FULL = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/;

/**
 * Resets the blank node counter (useful for testing).
 */
export function resetBlankNodeCounter(): void {
    blankNodeCounter = 0;
}

/**
 * Generates a unique blank node ID.
 */
export function generateBlankNodeId(generator?: (counter: number) => string): string {
    const g = generator || ((n: number) => `b${n}`);

    return g(blankNodeCounter++);
}

/**
 * Normalizes a blank node ID to a valid serialized label body.
 *
 * This strips leading "_:" prefixes from parser/data-model inputs and
 * repairs invalid characters while preserving uniqueness as much as possible.
 */
export function normalizeBlankNodeId(value: string): string {
    let id = value;

    while (id.startsWith('_:')) {
        id = id.slice(2);
    }

    if (!id) {
        return 'b';
    }

    if (BLANK_NODE_ID_FULL.test(id)) {
        return id;
    }

    let normalized = '';

    for (const char of id) {
        if (BLANK_NODE_ID_BODY.test(char)) {
            normalized += char;
        } else {
            normalized += `_u${char.codePointAt(0)!.toString(16)}_`;
        }
    }

    if (!normalized) {
        normalized = 'b';
    }

    if (!BLANK_NODE_ID_START.test(normalized[0])) {
        normalized = `b_${normalized}`;
    }

    if (normalized.endsWith('.')) {
        normalized += '_';
    }

    return normalized;
}
