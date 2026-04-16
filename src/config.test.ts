import {describe, expect, it} from 'vitest';

import {createSafeUrl, maskToken, resolveAccessToken, validateProfileName} from './config.js';

describe('createSafeUrl', () => {
    it('accepts valid airtable.com HTTPS URLs', () => {
        const url = createSafeUrl('https://mcp.airtable.com/mcp');
        expect(url.hostname).toBe('mcp.airtable.com');
        expect(url.pathname).toBe('/mcp');
    });

    it('accepts bare airtable.com', () => {
        const url = createSafeUrl('https://airtable.com/some/path');
        expect(url.hostname).toBe('airtable.com');
    });

    it('rejects HTTP URLs', () => {
        expect(() => createSafeUrl('http://mcp.airtable.com/mcp')).toThrow('only HTTPS');
    });

    it('rejects non-airtable domains', () => {
        expect(() => createSafeUrl('https://evil.com/mcp')).toThrow('only airtable.com domains');
    });

    it('rejects subdomain tricks like notatirtable.com', () => {
        expect(() => createSafeUrl('https://notatirtable.com/mcp')).toThrow('only airtable.com domains');
    });

    it('normalizes hostname to lowercase', () => {
        const url = createSafeUrl('https://MCP.AIRTABLE.COM/mcp');
        expect(url.hostname).toBe('mcp.airtable.com');
    });
});

describe('resolveAccessToken', () => {
    it('returns the token when present', () => {
        expect(resolveAccessToken({endpoint: 'https://x.airtable.com', token: 'pat_abc'})).toBe('pat_abc');
    });

    it('throws when token is missing', () => {
        expect(() => resolveAccessToken({endpoint: 'https://x.airtable.com'})).toThrow('Run `airtable-mcp configure`');
    });
});

describe('validateProfileName', () => {
    it('accepts alphanumeric names', () => {
        expect(() => validateProfileName('default')).not.toThrow();
        expect(() => validateProfileName('work-2')).not.toThrow();
        expect(() => validateProfileName('my_profile')).not.toThrow();
    });

    it('rejects path traversal', () => {
        expect(() => validateProfileName('../../../etc/passwd')).toThrow('Invalid profile name');
    });

    it('rejects dots', () => {
        expect(() => validateProfileName('a.b')).toThrow('Invalid profile name');
    });

    it('rejects spaces', () => {
        expect(() => validateProfileName('my profile')).toThrow('Invalid profile name');
    });

    it('rejects empty string', () => {
        expect(() => validateProfileName('')).toThrow('Invalid profile name');
    });
});

describe('maskToken', () => {
    it('shows only last 4 characters', () => {
        expect(maskToken('pat_abcdef123456')).toBe('****3456');
    });

    it('hides short tokens entirely', () => {
        expect(maskToken('short')).toBe('****');
    });
});
