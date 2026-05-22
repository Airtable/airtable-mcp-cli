import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// We test by running the built CLI as a subprocess.
// This tests the actual user-facing behavior: args in, stdout/stderr/exit code out.

const CLI = join(__dirname, '..', 'dist', 'bin.js');

function toolsHash(tools: any[]): string {
    return createHash('sha256').update(JSON.stringify(tools)).digest('hex');
}

function run(args: string[], env: Record<string, string> = {}): {stdout: string; stderr: string; exitCode: number} {
    const result = spawnSync('node', [CLI, ...args], {
        encoding: 'utf-8',
        env: {...process.env, ...env},
        timeout: 10_000,
    });
    return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.status ?? 1,
    };
}

describe('--version', () => {
    it('prints the version and exits 0', () => {
        const {stdout, exitCode} = run(['--version']);
        expect(exitCode).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('-v is an alias for --version', () => {
        const {stdout, exitCode} = run(['-v']);
        expect(exitCode).toBe(0);
        expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe('--help', () => {
    it('prints usage and exits 0', () => {
        const {stdout, exitCode} = run(['--help']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('airtable-mcp configure');
        expect(stdout).toContain('AIRTABLE_TOKEN');
    });

    it('-h is an alias for --help', () => {
        const {stdout, exitCode} = run(['-h']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('airtable-mcp configure');
        expect(stdout).toContain('AIRTABLE_TOKEN');
    });
});

describe('whoami', () => {
    it('fails with exit 1 when not configured', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        mkdirSync(tmpHome, {recursive: true});
        const {stderr, exitCode} = run(['whoami'], {HOME: tmpHome});
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Not configured');
        rmSync(tmpHome, {recursive: true});
    });

    it('shows env var source when AIRTABLE_TOKEN is set', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        mkdirSync(tmpHome, {recursive: true});
        const {stdout, exitCode} = run(['whoami'], {
            HOME: tmpHome,
            AIRTABLE_TOKEN: 'patWycuAfaaWJqD2e.secretpart',
        });
        expect(exitCode).toBe(0);
        expect(stdout).toContain('AIRTABLE_TOKEN');
        expect(stdout).toContain('patWycuAfaaWJqD2e.****');
        expect(stdout).not.toContain('secretpart');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('logout', () => {
    it('succeeds with message when already logged out', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        mkdirSync(tmpHome, {recursive: true});
        const {stderr, exitCode} = run(['logout'], {HOME: tmpHome});
        expect(exitCode).toBe(0);
        expect(stderr).toContain('Already logged out');
        rmSync(tmpHome, {recursive: true});
    });

    it('removes a profile from config', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), JSON.stringify({
            profiles: {default: {endpoint: 'https://mcp.airtable.com/mcp', token: 'pat_xxx'}},
            defaultProfile: 'default',
        }));

        const {stderr, exitCode} = run(['logout'], {HOME: tmpHome});
        expect(exitCode).toBe(0);
        expect(stderr).toContain('removed');
        expect(existsSync(join(configDir, 'cli.json'))).toBe(false);
        rmSync(tmpHome, {recursive: true});
    });
});

describe('configure', () => {
    it('rejects invalid profile names with exit code 2', () => {
        const {stderr, exitCode} = run(['configure', '--profile', '../../../etc/passwd']);
        expect(exitCode).toBe(2);
        expect(stderr).toContain('Invalid profile name');
    });
});

describe('corrupted config', () => {
    it('whoami reports corruption instead of "not configured"', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), '{invalid json!!!');

        const {stderr, exitCode} = run(['whoami'], {HOME: tmpHome});
        expect(exitCode).toBe(1);
        expect(stderr).toContain('corrupted');
        expect(stderr).not.toContain('Not configured');
        rmSync(tmpHome, {recursive: true});
    });

    it('logout removes corrupted config', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), '{invalid json!!!');

        const {stderr, exitCode} = run(['logout'], {HOME: tmpHome});
        expect(exitCode).toBe(0);
        expect(stderr).toContain('corrupted');
        expect(existsSync(join(configDir, 'cli.json'))).toBe(false);
        rmSync(tmpHome, {recursive: true});
    });
});

describe('no args', () => {
    it('prints usage to stderr and exits 2', () => {
        const {stderr, exitCode} = run([]);
        expect(exitCode).toBe(2);
        expect(stderr).toContain('airtable-mcp');
    });
});

describe('unknown tool', () => {
    it('fails with helpful message', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), JSON.stringify({
            profiles: {default: {endpoint: 'https://mcp.airtable.com/mcp', token: 'pat_xxx'}},
            defaultProfile: 'default',
        }));
        // Write a valid cache so it doesn't try to connect to the server
        const tools = [{name: 'list_bases', inputSchema: {type: 'object'}}];
        writeFileSync(join(configDir, 'cache-default.json'), JSON.stringify({
            tools,
            hash: toolsHash(tools),
            fetchedAt: Date.now(),
        }));

        const {stderr, exitCode} = run(['nonexistent-tool'], {HOME: tmpHome});
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Unknown tool');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('tool help with -h', () => {
    it('shows tool help when -h is passed', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), JSON.stringify({
            profiles: {default: {endpoint: 'https://mcp.airtable.com/mcp', token: 'pat_xxx'}},
            defaultProfile: 'default',
        }));
        const tools = [{name: 'list_bases', description: 'List all bases', inputSchema: {type: 'object', properties: {limit: {type: 'number', description: 'Max results'}}}}];
        writeFileSync(join(configDir, 'cache-default.json'), JSON.stringify({
            tools,
            hash: toolsHash(tools),
            fetchedAt: Date.now(),
        }));

        const {stdout, exitCode} = run(['list-bases', '-h'], {HOME: tmpHome});
        expect(exitCode).toBe(0);
        expect(stdout).toContain('list-bases');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('unknown flags', () => {
    it('errors on unrecognized tool flags with exit code 2', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), JSON.stringify({
            profiles: {default: {endpoint: 'https://mcp.airtable.com/mcp', token: 'pat_xxx'}},
            defaultProfile: 'default',
        }));
        const tools = [{name: 'list_bases', inputSchema: {type: 'object', properties: {limit: {type: 'number'}}}}];
        writeFileSync(join(configDir, 'cache-default.json'), JSON.stringify({
            tools,
            hash: toolsHash(tools),
            fetchedAt: Date.now(),
        }));

        const {stderr, exitCode} = run(['list-bases', '--limti', '10'], {HOME: tmpHome});
        expect(exitCode).toBe(2);
        expect(stderr).toContain('Unknown flag');
        expect(stderr).toContain('--limti');
        expect(stderr).toContain('--help');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('--output validation', () => {
    it('rejects invalid output format with exit code 2', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        const configDir = join(tmpHome, '.airtable');
        mkdirSync(configDir, {recursive: true});
        writeFileSync(join(configDir, 'cli.json'), JSON.stringify({
            profiles: {default: {endpoint: 'https://mcp.airtable.com/mcp', token: 'pat_xxx'}},
            defaultProfile: 'default',
        }));
        const tools = [{name: 'list_bases', inputSchema: {type: 'object'}}];
        writeFileSync(join(configDir, 'cache-default.json'), JSON.stringify({
            tools,
            hash: toolsHash(tools),
            fetchedAt: Date.now(),
        }));

        const {stderr, exitCode} = run(['list-bases', '--output', 'json'], {HOME: tmpHome});
        expect(exitCode).toBe(2);
        expect(stderr).toContain('Unknown output format');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('auth error', () => {
    it('prints clean message on invalid token', () => {
        const tmpHome = join(tmpdir(), `cli-test-${Date.now()}`);
        mkdirSync(tmpHome, {recursive: true});
        const {stderr, exitCode} = run(['tools'], {
            HOME: tmpHome,
            AIRTABLE_TOKEN: 'pat_invalid_token_for_testing',
        });
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Authentication failed');
        expect(stderr).not.toContain('StreamableHTTPError');
        rmSync(tmpHome, {recursive: true});
    });
});

describe('completions', () => {
    it('outputs bash completions', () => {
        const {stdout, exitCode} = run(['completions', 'bash']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('complete -F _airtable_mcp airtable-mcp');
    });

    it('outputs zsh completions', () => {
        const {stdout, exitCode} = run(['completions', 'zsh']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('#compdef airtable-mcp');
    });

    it('outputs fish completions', () => {
        const {stdout, exitCode} = run(['completions', 'fish']);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('complete -c airtable-mcp');
    });

    it('rejects unsupported shells', () => {
        const {stderr, exitCode} = run(['completions', 'powershell']);
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Supported shells');
    });
});
