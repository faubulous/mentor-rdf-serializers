import { describe, it, expect, beforeEach } from 'vitest';
import { resetBlankNodeCounter, generateBlankNodeId } from './blank-nodes';

describe('generateBlankNodeId', () => {
    beforeEach(() => {
        resetBlankNodeCounter();
    });

    it('should generate the first blank node ID as b0', () => {
        expect(generateBlankNodeId()).toBe('b0');
    });

    it('should increment the counter on each call', () => {
        expect(generateBlankNodeId()).toBe('b0');
        expect(generateBlankNodeId()).toBe('b1');
        expect(generateBlankNodeId()).toBe('b2');
    });

    it('should use a custom generator function', () => {
        expect(generateBlankNodeId((n) => `node${n}`)).toBe('node0');
        expect(generateBlankNodeId((n) => `node${n}`)).toBe('node1');
    });
});

describe('resetBlankNodeCounter', () => {
    it('should reset the counter back to zero', () => {
        generateBlankNodeId();
        generateBlankNodeId();
        resetBlankNodeCounter();
        expect(generateBlankNodeId()).toBe('b0');
    });
});
