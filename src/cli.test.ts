import {describe, expect, it} from 'vitest';

import {createCli, VERSION} from './cli.js';

describe('createCli', () => {
    it('creates a CLI instance without throwing', () => {
        const cli = createCli();
        expect(cli).toBeDefined();
    });
});

describe('VERSION', () => {
    it('is a string', () => {
        expect(typeof VERSION).toBe('string');
    });

    it('is not empty', () => {
        expect(VERSION.length).toBeGreaterThan(0);
    });
});
