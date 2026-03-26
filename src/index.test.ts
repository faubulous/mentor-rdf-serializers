import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('public API exports', () => {
    it('exposes key serializer and formatter classes', () => {
        expect(api.TurtleSerializer).toBeDefined();
        expect(api.TrigSerializer).toBeDefined();
        expect(api.N3Serializer).toBeDefined();
        expect(api.NTriplesFormatter).toBeDefined();
        expect(api.NQuadsFormatter).toBeDefined();
        expect(api.QuadContextSerializer).toBeDefined();
    });
});
