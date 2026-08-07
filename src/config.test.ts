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

    it('accepts the local MCP development endpoint', () => {
        const url = createSafeUrl('https://mcp.hyperbasedev.com:3000/mcp');
        expect(url.hostname).toBe('mcp.hyperbasedev.com');
        expect(url.port).toBe('3000');
    });

    it('rejects HTTP URLs', () => {
        expect(() => createSafeUrl('http://mcp.airtable.com/mcp')).toThrow('only HTTPS');
    });

    it('rejects non-airtable domains', () => {
        expect(() => createSafeUrl('https://evil.com/mcp')).toThrow(
            'only approved Airtable HTTPS endpoints',
        );
    });

    it('rejects subdomain tricks like notatirtable.com', () => {
        expect(() => createSafeUrl('https://notatirtable.com/mcp')).toThrow(
            'only approved Airtable HTTPS endpoints',
        );
    });

    it('rejects other hyperbasedev.com subdomains', () => {
        expect(() => createSafeUrl('https://attacker.hyperbasedev.com/mcp')).toThrow(
            'Unsafe endpoint: only approved Airtable HTTPS endpoints are allowed (got "attacker.hyperbasedev.com").',
        );
    });

    it('normalizes hostname to lowercase', () => {
        const url = createSafeUrl('https://MCP.AIRTABLE.COM/mcp');
        expect(url.hostname).toBe('mcp.airtable.com');
    });

    // Regression: protocol-relative path ("//host") used to pass the hostname
    // check on the input URL while the reconstructed URL resolved to a
    // different host, leaking the bearer token to an attacker (H1 #3792589).
    it('rejects a protocol-relative path that resolves off airtable.com', () => {
        expect(() => createSafeUrl('https://airtable.com//attacker.com/mcp')).toThrow();
    });

    it('rejects protocol-relative paths on an airtable subdomain too', () => {
        expect(() => createSafeUrl('https://mcp.staging.airtable.com//attacker.example/mcp')).toThrow();
    });

    it('does not let the resolved host escape the allowlist', () => {
        // Whatever slips past parsing, the returned URL must stay on airtable.com.
        for (const raw of [
            'https://airtable.com//attacker.com/mcp',
            'https://airtable.com/\\/attacker.com/mcp',
        ]) {
            let host: string | null = null;
            try {
                host = createSafeUrl(raw).hostname;
            } catch {
                host = null;
            }
            if (host !== null) {
                expect(host === 'airtable.com' || host.endsWith('.airtable.com')).toBe(true);
            }
        }
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
    it('shows prefix before dot for PATs', () => {
        expect(maskToken('patWycuAfaaWJqD2e.abc123secret')).toBe('patWycuAfaaWJqD2e.****');
    });

    it('shows first 4 chars for non-PAT tokens', () => {
        expect(maskToken('eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe('eyJh****');
    });

    it('shows first 4 chars for tokens without dots', () => {
        expect(maskToken('some_other_token_1234')).toBe('some****');
    });

    it('hides short tokens entirely', () => {
        expect(maskToken('abcd')).toBe('****');
    });
});
