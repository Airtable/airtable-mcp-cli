import {describe, expect, it} from 'vitest';

import {mcpConnect} from './mcp.js';

const PROFILE = {
    endpoint: 'https://mcp.airtable.com/mcp',
    token: 'test-token',
};

describe('mcpConnect', () => {
    it.each([
        'https://airtable.com//example.invalid/mcp',
        'https://airtable.com/\\\\example.invalid/mcp',
        'https://example.invalid/mcp',
        'https://attacker.hyperbasedev.com/mcp',
    ])('rejects an endpoint that resolves outside the Airtable allowlist: %s', async (endpoint) => {
        await expect(mcpConnect(endpoint, PROFILE)).rejects.toThrow('Unsafe endpoint');
    });
});
