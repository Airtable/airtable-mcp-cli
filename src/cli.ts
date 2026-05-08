import {unlinkSync} from 'node:fs';

import {Cli, Command, Option} from 'clipanion';

import {
    type Config,
    type Profile,
    DEFAULT_ENDPOINT,
    cachePath,
    deleteConfigFile,
    getProfile,
    loadConfig,
    loadConfigSafe,
    maskToken,
    requireProfile,
    saveConfig,
    validateProfileName,
} from './config.js';
import {readSecret} from './input.js';
import {mcpCallTool, mcpConnect} from './mcp.js';
import {
    ErrorType,
    type ResponseError,
    extractData,
    extractFlag,
    parseToolFlags,
    printToolHelp,
    readStdin,
    resolveTools,
    visibleTools,
} from './tools.js';

declare const __VERSION__: string;

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';
const USER_AGENT = `airtable-mcp-cli/${VERSION}`;

// ---------------------------------------------------------------------------
// Cache cleanup (used by logout)
// ---------------------------------------------------------------------------

function deleteCacheFile(profile: string): void {
    try {
        unlinkSync(cachePath(profile));
    } catch {
        // Ignore: file missing or invalid profile name
    }
}

function bashCompletions(): string {
    return `# bash completion for airtable-mcp
_airtable_mcp() {
    local cur prev words cword
    _init_completion || return

    local commands="configure whoami logout tools completions help"

    if [[ $cword -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
        return
    fi

    if [[ $cword -eq 2 && "\${words[1]}" == "completions" ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
        return
    fi
}

complete -F _airtable_mcp airtable-mcp
`;
}

function zshCompletions(): string {
    return `#compdef airtable-mcp

_airtable_mcp() {
  local -a commands
  commands=(
    'configure:Set up endpoint and personal access token'
    'whoami:Show current authentication status'
    'logout:Remove saved credentials'
    'tools:List available tools'
    'completions:Generate shell completions'
    'help:Show help'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  if [[ "$words[2]" == "completions" ]]; then
    _values 'shell' bash zsh fish
  fi
}

_airtable_mcp "$@"
`;
}

function fishCompletions(): string {
    return `complete -c airtable-mcp -f
complete -c airtable-mcp -n '__fish_use_subcommand' -a configure -d 'Set up endpoint and personal access token'
complete -c airtable-mcp -n '__fish_use_subcommand' -a whoami -d 'Show current authentication status'
complete -c airtable-mcp -n '__fish_use_subcommand' -a logout -d 'Remove saved credentials'
complete -c airtable-mcp -n '__fish_use_subcommand' -a tools -d 'List available tools'
complete -c airtable-mcp -n '__fish_use_subcommand' -a completions -d 'Generate shell completions'
complete -c airtable-mcp -n '__fish_use_subcommand' -a help -d 'Show help'
complete -c airtable-mcp -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'
`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

class HelpCommand extends Command {
    static override paths = [['help'], ['-h'], ['--help']];

    async execute(): Promise<void> {
        this.context.stdout.write(
            `airtable-mcp v${VERSION} — Airtable MCP CLI\n` +
            '\n' +
            'Usage:\n' +
            '  airtable-mcp configure          Set up endpoint and personal access token\n' +
            '  airtable-mcp whoami             Show current authentication status\n' +
            '  airtable-mcp logout             Remove saved credentials\n' +
            '  airtable-mcp tools              List available tools\n' +
            '  airtable-mcp completions <shell> Generate shell completions (bash, zsh, fish)\n' +
            '  airtable-mcp <tool> [--flags]   Run a tool (via MCP)\n' +
            '  airtable-mcp <tool> --help      Show help for a tool\n' +
            '  airtable-mcp <tool> --input -   Pass arguments as JSON via stdin\n' +
            '  airtable-mcp <tool> -q          Suppress status messages\n' +
            '  airtable-mcp --version          Print version\n' +
            '\n' +
            'Environment variables:\n' +
            '  AIRTABLE_TOKEN              Personal access token (skips login/configure)\n' +
            '  AIRTABLE_MCP_ENDPOINT       MCP server URL (default: https://mcp.airtable.com/mcp)\n',
        );
    }
}

class VersionCommand extends Command {
    static override paths = [['--version']];

    async execute(): Promise<void> {
        this.context.stdout.write(`${VERSION}\n`);
    }
}

class ConfigureCommand extends Command {
    static override paths = [['configure']];
    static override usage = Command.Usage({
        description: 'Set up endpoint and personal access token',
    });

    profile = Option.String('--profile', {required: false});
    endpoint = Option.String('--endpoint', {required: false});

    async execute(): Promise<number> {
        const profileName = this.profile ?? 'default';
        try {
            validateProfileName(profileName);
        } catch (e) {
            this.context.stderr.write(`${e instanceof Error ? e.message : e}\n`);
            return 2;
        }
        const endpoint = this.endpoint ?? DEFAULT_ENDPOINT;

        try {
            const token = await readSecret('Personal access token (create at https://airtable.com/create/tokens): ');
            if (!token) {
                this.context.stderr.write('Token is required.\n');
                return 1;
            }

            this.context.stderr.write(`Token:    ${maskToken(token)}\n`);

            const profile: Profile = {endpoint, token};
            const existingConfig = loadConfig();
            const config = existingConfig ?? {profiles: {}, defaultProfile: profileName};
            config.profiles[profileName] = profile;
            saveConfig(config);
            this.context.stderr.write(`Profile "${profileName}" saved.\n`);
            return 0;
        } catch (e) {
            this.context.stderr.write(`Error: ${e instanceof Error ? e.message : e}\n`);
            return 1;
        }
    }
}

class WhoamiCommand extends Command {
    static override paths = [['whoami']];
    static override usage = Command.Usage({description: 'Show current authentication status'});

    profile = Option.String('--profile', {required: false});

    async execute(): Promise<number> {
        const envToken = process.env.AIRTABLE_TOKEN;
        if (envToken && !this.profile) {
            this.context.stdout.write(`Source:   AIRTABLE_TOKEN environment variable\n`);
            this.context.stdout.write(`Token:    ${maskToken(envToken)}\n`);
            this.context.stdout.write(`Endpoint: ${process.env.AIRTABLE_MCP_ENDPOINT ?? DEFAULT_ENDPOINT}\n`);
            return 0;
        }
        const config = loadConfigSafe(this.context.stderr);
        if (!config) {
            return 1;
        }
        const profileName = this.profile ?? config.defaultProfile;
        const profile = getProfile(config, profileName);
        if (!profile) {
            this.context.stderr.write(`Profile "${profileName}" not found.\n`);
            return 1;
        }
        this.context.stdout.write(`Profile:  ${profileName}\n`);
        this.context.stdout.write(`Endpoint: ${profile.endpoint}\n`);
        if (profile.token) {
            this.context.stdout.write(`Auth:     Personal access token (${maskToken(profile.token)})\n`);
        } else {
            this.context.stdout.write(`Auth:     None\n`);
        }

        const profiles = Object.keys(config.profiles);
        if (profiles.length > 1) {
            const labeled = profiles.map((p) => p === config!.defaultProfile ? `${p} (default)` : p);
            this.context.stdout.write(`Profiles: ${labeled.join(', ')}\n`);
        }
        return 0;
    }
}

class LogoutCommand extends Command {
    static override paths = [['logout']];
    static override usage = Command.Usage({description: 'Remove saved credentials'});

    profile = Option.String('--profile', {required: false});
    all = Option.Boolean('--all', false);

    async execute(): Promise<number> {
        let config: Config | null;
        try {
            config = loadConfig();
        } catch {
            // Config is corrupted — logout should still work
            deleteConfigFile();
            this.context.stderr.write('Config file was corrupted. Removed.\n');
            return 0;
        }
        if (!config) {
            this.context.stderr.write('No configuration found. Already logged out.\n');
            return 0;
        }

        if (this.all) {
            for (const name of Object.keys(config.profiles)) {
                deleteCacheFile(name);
            }
            deleteConfigFile();
            this.context.stderr.write('All profiles removed.\n');
            return 0;
        }

        const profileName = this.profile ?? config.defaultProfile;
        if (!config.profiles[profileName]) {
            this.context.stderr.write(`Profile "${profileName}" not found.\n`);
            return 1;
        }

        delete config.profiles[profileName];
        deleteCacheFile(profileName);

        if (Object.keys(config.profiles).length === 0) {
            deleteConfigFile();
            this.context.stderr.write(`Profile "${profileName}" removed. No profiles remaining.\n`);
        } else {
            if (config.defaultProfile === profileName) {
                config.defaultProfile = Object.keys(config.profiles)[0]!;
            }
            saveConfig(config);
            this.context.stderr.write(`Profile "${profileName}" removed.\n`);
        }
        return 0;
    }
}

// ---------------------------------------------------------------------------
// Tools command
// ---------------------------------------------------------------------------

class ToolsCommand extends Command {
    static override paths = [['tools']];
    static override usage = Command.Usage({description: 'List available tools'});

    profile = Option.String('--profile', {required: false});
    refresh = Option.Boolean('--refresh', false);
    json = Option.Boolean('--json', false);

    async execute(): Promise<number> {
        const resolved = requireProfile(loadConfig(), this.profile, this.context.stderr);
        if (resolved === null) return 1;

        const result = await resolveTools(resolved.profile, resolved.profileName, this.refresh);
        if (result.error !== null) {
            return handleError(result.error, this.context.stderr);
        }
        const {tools, client, stale} = result.value;
        if (stale) {
            this.context.stderr.write('Warning: server unreachable, using cached tools.\n');
        }
        if (client !== null) await client.close();

        const visible = visibleTools(tools);
        if (visible.length === 0) {
            this.context.stdout.write('No tools available.\n');
            return 0;
        }

        const rows = visible.map((tool) => ({
            name: tool.name.replace(/_/g, '-'),
            title: tool.title ?? '',
            access: tool.annotations?.readOnlyHint
                ? 'read-only'
                : (tool.annotations as any)?.destructiveHint
                  ? 'destructive'
                  : 'write',
        }));

        if (this.json) {
            this.context.stdout.write(JSON.stringify(rows, null, 2) + '\n');
            return 0;
        }

        const nameWidth = Math.max('NAME'.length, ...rows.map((r) => r.name.length));
        const titleWidth = Math.max('TITLE'.length, ...rows.map((r) => r.title.length));

        const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
        this.context.stdout.write(`${pad('NAME', nameWidth)}  ${pad('TITLE', titleWidth)}  ACCESS\n`);
        for (const r of rows) {
            this.context.stdout.write(`${pad(r.name, nameWidth)}  ${pad(r.title, titleWidth)}  ${r.access}\n`);
        }
        return 0;
    }
}

class CompletionsCommand extends Command {
    static override paths = [['completions']];
    static override usage = Command.Usage({
        description: 'Generate shell completions',
    });

    args = Option.Proxy();

    async execute(): Promise<number> {
        const shell = this.args[0];

        switch (shell) {
            case 'bash':
                this.context.stdout.write(bashCompletions());
                return 0;
            case 'zsh':
                this.context.stdout.write(zshCompletions());
                return 0;
            case 'fish':
                this.context.stdout.write(fishCompletions());
                return 0;
            default:
                this.context.stderr.write('Supported shells: bash, zsh, fish\n');
                return 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Run command (default / catch-all)
// ---------------------------------------------------------------------------

class RunCommand extends Command {
    static override paths = [Command.Default];
    args = Option.Proxy();

    async execute(): Promise<number> {
        const args = this.args;
        if (args.length === 0) {
            this.context.stderr.write(
                'Usage: airtable-mcp <tool-name> [flags]\n\n' +
                    'Run `airtable-mcp tools` to see available tools.\n' +
                    'Run `airtable-mcp --help` for help.\n',
            );
            return 2;
        }

        const profileFlag = extractFlag(args, '--profile');
        const outputFlag = extractFlag(args, '--output');
        if (outputFlag !== null && outputFlag !== 'raw') {
            this.context.stderr.write(`Unknown output format: "${outputFlag}". Supported: raw\n`);
            return 2;
        }
        const refreshIdx = args.indexOf('--refresh');
        const forceRefresh = refreshIdx !== -1;
        if (forceRefresh) args.splice(refreshIdx, 1);
        const quiet = args.includes('--quiet') || args.includes('-q');
        if (quiet) {
            const qi = args.indexOf('--quiet');
            if (qi !== -1) args.splice(qi, 1);
            const qsi = args.indexOf('-q');
            if (qsi !== -1) args.splice(qsi, 1);
        }

        const resolved = requireProfile(loadConfig(), profileFlag ?? undefined, this.context.stderr);
        if (resolved === null) return 1;

        const toolName = args[0]!.replace(/-/g, '_');
        const rest = args.slice(1);

        const result = await resolveTools(resolved.profile, resolved.profileName, forceRefresh);
        if (result.error !== null) {
            return handleError(result.error, this.context.stderr);
        }
        const {tools, client: cachedClient, stale} = result.value;
        if (stale && !quiet) {
            this.context.stderr.write('Warning: server unreachable, using cached tools.\n');
        }

        const tool = visibleTools(tools).find((t) => t.name === toolName);
        if (tool === undefined) {
            if (cachedClient !== null) await cachedClient.close();
            this.context.stderr.write(
                `Unknown tool: ${args[0]}. Run \`airtable-mcp tools\` to see available tools.\n`,
            );
            return 1;
        }

        if (rest.includes('--help')) {
            if (cachedClient !== null) await cachedClient.close();
            printToolHelp(tool, this.context.stdout);
            return 0;
        }

        let toolArgs: Record<string, unknown>;
        const inputIdx = rest.indexOf('--input');
        if (inputIdx !== -1 && rest[inputIdx + 1] === '-') {
            try {
                toolArgs = JSON.parse(await readStdin()) as Record<string, unknown>;
            } catch {
                this.context.stderr.write('Invalid JSON on stdin.\n');
                return 1;
            }
        } else {
            const parseResult = parseToolFlags(rest, tool.inputSchema);
            if (parseResult.error !== null) {
                if (cachedClient !== null) await cachedClient.close();
                return handleError(parseResult.error, this.context.stderr);
            }
            const {parsed, unknownFlags} = parseResult.value;
            if (unknownFlags.length > 0) {
                if (cachedClient !== null) await cachedClient.close();
                this.context.stderr.write(
                    `Unknown flag${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.join(', ')}\n` +
                    `Run \`airtable-mcp ${args[0]} --help\` to see available flags.\n`,
                );
                return 2;
            }
            toolArgs = parsed;
        }

        const client = cachedClient ?? (await mcpConnect(resolved.profile.endpoint, resolved.profile));
        try {
            const result = await mcpCallTool(client, tool.name, toolArgs);
            if (result.isError) {
                const text = result.content.map((c) => c.text).filter(Boolean).join('\n');
                this.context.stderr.write(`Error: ${text}\n`);
                this.context.stderr.write(`Run \`airtable-mcp ${args[0]} --help\` for usage.\n`);
                return 1;
            }
            const data = extractData(result);
            const formatted =
                outputFlag === 'raw'
                    ? result.content.map((c) => c.text).filter(Boolean).join('\n')
                    : JSON.stringify(data, null, 2);
            this.context.stdout.write(formatted + '\n');
            return 0;
        } finally {
            await client.close();
        }
    }
}

// ---------------------------------------------------------------------------
// Shared error handling
// ---------------------------------------------------------------------------

function handleError(error: ResponseError, stderr: NodeJS.WritableStream): number {
    switch (error.type) {
        case ErrorType.AUTH_FAILED:
            stderr.write('Authentication failed. Check your token or run `airtable-mcp configure`.\n');
            return 1;
        case ErrorType.FORBIDDEN:
            stderr.write('Access denied. Your token may be missing required scopes. Check your token at https://airtable.com/create/tokens.\n');
            return 1;
        case ErrorType.UNPARSABLE_VALUE:
            stderr.write(`Invalid value for ${error.argName}: "${error.value}"\n`);
            return 2;
        default:
            throw new Error(`Unhandled error type: ${(error as any).type}`);
    }
}

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------

export {VERSION, USER_AGENT};

export function createCli(): Cli {
    const cli = new Cli({binaryLabel: 'airtable-mcp', binaryName: 'airtable-mcp'});
    cli.register(HelpCommand);
    cli.register(VersionCommand);
    cli.register(ConfigureCommand);
    cli.register(WhoamiCommand);
    cli.register(LogoutCommand);
    cli.register(ToolsCommand);
    cli.register(CompletionsCommand);
    cli.register(RunCommand);
    return cli;
}

