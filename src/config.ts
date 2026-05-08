import {mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Profile = {
    endpoint: string;
    token?: string;
};

export type Config = {
    profiles: Record<string, Profile>;
    defaultProfile: string;
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const CONFIG_DIR = join(homedir(), '.airtable');
export const CONFIG_PATH = join(CONFIG_DIR, 'cli.json');

// ---------------------------------------------------------------------------
// Config operations
// ---------------------------------------------------------------------------

export function loadConfig(): Config | null {
    let raw: string;
    try {
        raw = readFileSync(CONFIG_PATH, 'utf-8');
    } catch (err: any) {
        if (err?.code === 'ENOENT') return null;
        throw new Error(`Cannot read config file (${CONFIG_PATH}): ${err?.message ?? err}`);
    }
    try {
        return JSON.parse(raw) as Config;
    } catch {
        throw new Error(
            `Config file is corrupted (${CONFIG_PATH}). Remove it and run \`airtable-mcp configure\` again.`,
        );
    }
}

function ensureConfigDir(): void {
    mkdirSync(CONFIG_DIR, {recursive: true, mode: 0o700});
}

export function saveConfig(config: Config): void {
    ensureConfigDir();
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {mode: 0o600});
}

export function getProfile(config: Config, name?: string): Profile | null {
    return config.profiles[name ?? config.defaultProfile] ?? null;
}

export {ensureConfigDir};

// ---------------------------------------------------------------------------
// Profile name validation
// ---------------------------------------------------------------------------

const VALID_PROFILE_NAME = /^[a-zA-Z0-9_-]+$/;

export function validateProfileName(name: string): void {
    if (!VALID_PROFILE_NAME.test(name)) {
        throw new Error(`Invalid profile name "${name}". Use only letters, numbers, dashes, and underscores.`);
    }
}

export function cachePath(profile: string): string {
    validateProfileName(profile);
    return join(CONFIG_DIR, `cache-${profile}.json`);
}

export function deleteConfigFile(): void {
    try {
        unlinkSync(CONFIG_PATH);
    } catch {}
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT = 'https://mcp.airtable.com/mcp';

export {DEFAULT_ENDPOINT};

export function createSafeUrl(raw: string): URL {
    const u = new URL(raw);
    if (u.protocol !== 'https:') {
        throw new Error(`Unsafe endpoint: only HTTPS is allowed (got "${u.protocol}").`);
    }
    const hostname = u.hostname.toLowerCase();
    if (hostname !== 'airtable.com' && !hostname.endsWith('.airtable.com')) {
        throw new Error(`Unsafe endpoint: only airtable.com domains are allowed (got "${hostname}").`);
    }
    return new URL(u.pathname + u.search, `https://${hostname}`);
}

export function getEnvEndpoint(): string {
    return createSafeUrl(process.env.AIRTABLE_MCP_ENDPOINT ?? DEFAULT_ENDPOINT).toString();
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

/**
 * Load config for use in commands. Prints a helpful message on
 * missing or corrupt config and returns null.
 */
export function loadConfigSafe(stderr: NodeJS.WritableStream): Config | null {
    let config: Config | null;
    try {
        config = loadConfig();
    } catch (e) {
        stderr.write(`${e instanceof Error ? e.message : e}\n`);
        return null;
    }
    if (!config) {
        stderr.write('Not configured. Run `airtable-mcp configure`.\n');
    }
    return config;
}

export function requireProfile(
    config: Config | null,
    profileName: string | undefined,
    stderr: NodeJS.WritableStream,
): {profile: Profile; profileName: string} | null {
    const envToken = process.env.AIRTABLE_TOKEN;
    if (envToken && !profileName) {
        const endpoint = getEnvEndpoint();
        return {profile: {endpoint, token: envToken}, profileName: '_env'};
    }
    if (!config) {
        stderr.write('Not configured. Run `airtable-mcp configure` to get started.\n');
        stderr.write('Or set the AIRTABLE_TOKEN environment variable.\n');
        return null;
    }
    const name = profileName ?? config.defaultProfile;
    try {
        validateProfileName(name);
    } catch {
        stderr.write(`Invalid profile name "${name}". Use only letters, numbers, dashes, and underscores.\n`);
        return null;
    }
    const profile = getProfile(config, name);
    if (!profile) {
        stderr.write(`Profile "${name}" not found. Run \`airtable-mcp configure --profile ${name}\`.\n`);
        return null;
    }
    return {profile, profileName: name};
}

export function resolveAccessToken(profile: Profile): string {
    if (profile.token) return profile.token;
    throw new Error('Not authenticated. Run `airtable-mcp configure`.');
}

// ---------------------------------------------------------------------------
// Token display
// ---------------------------------------------------------------------------

export function maskToken(token: string): string {
    if (token.startsWith('pat')) {
        const dot = token.indexOf('.');
        if (dot !== -1) return token.slice(0, dot) + '.****';
    }
    if (token.length <= 4) return '****';
    return token.slice(0, 4) + '****';
}
