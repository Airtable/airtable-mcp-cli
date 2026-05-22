# Airtable MCP CLI

Manage your Airtable bases from the terminal.

This CLI discovers commands from the Airtable MCP server at runtime. `airtable-mcp tools` shows whatever the server exposes at that moment. If the server adds, removes, or renames a tool, the CLI reflects that without a client release. See [DESIGN.md](DESIGN.md) for the design rationale.

## Install

```sh
npm install -g @airtable/mcp-cli
```

Or download a standalone binary:

```sh
curl -fsSL https://raw.githubusercontent.com/Airtable/airtable-mcp-cli/main/install.sh | sh
```

## Quick start

Set up your [personal access token](https://airtable.com/create/tokens). Credentials are stored in a default profile. Use `--profile <name>` to create additional profiles.

```sh
airtable-mcp configure
```

Discover what you have access to:

```sh
airtable-mcp tools
airtable-mcp list-bases
```

Then act on it:

```sh
airtable-mcp list-records --baseId appXXX --tableIdOrName Tasks
```

The first time you run a tool, the CLI fetches the tool list from the server and caches it for 60 seconds. After that, subsequent commands are fast. Use `--refresh` on any tool command to bypass the cache.

> **This CLI is experimental and tool names, arguments, and output formats may change without notice.** The tools you see today may be renamed, removed, or have their arguments changed in a future server update. If you're scripting against specific tools, check for tool existence before calling and handle missing or unexpected fields in output.

## Commands

```
airtable-mcp configure               Set up personal access token
airtable-mcp whoami                   Show current auth status
airtable-mcp logout                   Remove saved credentials
airtable-mcp tools                    List available tools
airtable-mcp <tool> [--flags]         Run a tool
airtable-mcp <tool> --help, -h        Show help and flags for a tool
airtable-mcp completions <shell>      Generate shell completions (bash, zsh, fish)
airtable-mcp --help, -h               Show help
airtable-mcp --version, -v            Print version
```

Most commands accept `--profile <name>` to switch between accounts.

## Flags

Tool output defaults to formatted JSON. The `tools` command defaults to a human-readable list.

| Flag | Applies to | Description |
|---|---|---|
| `--profile <name>` | all | Use a named profile |
| `--json` | `tools` | Output tool list as JSON |
| `--refresh` | `tools`, `<tool>` | Bypass the tool cache |
| `--output raw` | `<tool>` | Raw text output instead of JSON |
| `--input -` | `<tool>` | Read arguments as JSON from stdin |
| `-q`, `--quiet` | `<tool>` | Suppress status messages on stderr |

## Profiles

Manage multiple accounts:

```sh
airtable-mcp configure --profile work
airtable-mcp configure --profile personal
airtable-mcp tools --profile work
```

## Skills

Install pre-built skills for common workflows:

```sh
npx skills add airtable/skills
```

Other installation methods can be found in the [Airtable Skills repo](https://github.com/Airtable/skills).

## Automation and agents

This CLI is meant to be driven by scripts and agents. Flags, output behavior, and exit codes are the stable part. Tool names and schemas are not; they come from the server at runtime.

Useful pieces:

- **`AIRTABLE_TOKEN`**: skip `configure`, useful in CI
- **`tools --json`**: discover tools programmatically
- **`--input -`**: pass arguments as JSON on stdin
- **`-q`**: keep stdout clean
- **`--output raw`**: return the server response without JSON formatting

Example:

```sh
export AIRTABLE_TOKEN=pat_xxx
airtable-mcp tools --json
echo '{"baseId":"appXXX","tableIdOrName":"Tasks"}' | airtable-mcp list-records --input - -q
```

## Environment variables

| Variable | Description |
|---|---|
| `AIRTABLE_TOKEN` | Personal access token. Overrides `airtable-mcp configure`. |
| `AIRTABLE_MCP_ENDPOINT` | MCP server URL (default: `https://mcp.airtable.com/mcp`). |

Endpoints are restricted to HTTPS on `*.airtable.com` to prevent token exfiltration to arbitrary servers.

## Configuration

Config is stored in `~/.airtable/cli.json` with restricted file permissions (`0600`). The config directory is created with `0700` permissions. Tool definitions are cached in `~/.airtable/cache-{profile}.json` with a 60-second TTL. The cache is integrity-checked on read.

## Development

```sh
npm install
npm run build
npm run typecheck
npm test
```

Install locally as the `airtable-mcp` command:

```sh
npm run build
npm link
```

After `npm link`, only re-run `npm run build` to pick up changes — no need to re-link.

Unlink when done:

```sh
npm unlink -g @airtable/mcp-cli
```

## License

MIT
