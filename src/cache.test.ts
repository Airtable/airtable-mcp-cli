import {describe, expect, it} from 'vitest';

import {isFresh} from './cache.js';

describe('isFresh', () => {
    it('returns true for recently fetched cache', () => {
        expect(isFresh({tools: [], hash: '', fetchedAt: Date.now()})).toBe(true);
    });

    it('returns false for stale cache', () => {
        const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
        expect(isFresh({tools: [], hash: '', fetchedAt: twoMinutesAgo})).toBe(false);
    });
});
