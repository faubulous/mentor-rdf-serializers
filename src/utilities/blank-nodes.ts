/**
 * Counter for generating unique blank node IDs.
 */
let blankNodeCounter = 0;

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
