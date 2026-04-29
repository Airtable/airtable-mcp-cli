import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPError} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {Profile} from './config.js';
import {isFresh, loadCache, saveCache} from './cache.js';
import {mcpConnect, mcpListTools} from './mcp.js';

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export function visibleTools(tools: Tool[]): Tool[] {
    return tools.filter((t) => {
        const meta = t._meta as Record<string, unknown> | undefined;
        return !meta?.hideFromCli;
    });
}

// ---------------------------------------------------------------------------
// Resolution (cache → network → stale cache)
// ---------------------------------------------------------------------------

export async function resolveTools(
    profile: Profile,
    profileName: string,
    forceRefresh: boolean,
    stderr: NodeJS.WritableStream,
): Promise<{tools: Tool[]; client: Client | null}> {
    if (!forceRefresh) {
        const cache = loadCache(profileName);
        if (cache && isFresh(cache)) return {tools: cache.tools, client: null};
    }

    try {
        const client = await mcpConnect(profile.endpoint, profile);
        const tools = await mcpListTools(client);
        saveCache(profileName, tools);
        return {tools, client};
    } catch (err) {
        if (err instanceof StreamableHTTPError && err.code === 401) {
            stderr.write('Authentication failed. Check your token or run `airtable-mcp configure`.\n');
            process.exit(1);
        }
        const cache = loadCache(profileName);
        if (cache) {
            const age = Math.round((Date.now() - cache.fetchedAt) / 60000);
            stderr.write(`Warning: server unreachable, using cached tools (${age}m old).\n`);
            return {tools: cache.tools, client: null};
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

export function extractData(result: {content: Array<{type: string; text?: string}>; structuredContent?: unknown}): unknown {
    if (result.structuredContent != null) return result.structuredContent;
    const text = result.content.find((c) => c.type === 'text')?.text;
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

export function parseToolFlags(
    args: string[],
    schema: Tool['inputSchema'],
): {parsed: Record<string, unknown>; unknownFlags: string[]} {
    const props = (schema as any)?.properties ?? {};
    const result: Record<string, unknown> = {};
    const unknownFlags: string[] = [];
    let i = 0;
    while (i < args.length) {
        const arg = args[i]!;
        if (!arg.startsWith('--')) {
            i++;
            continue;
        }
        const key = arg.slice(2);
        const propSchema = props[key];
        if (!propSchema) {
            unknownFlags.push(arg);
            i++;
            continue;
        }
        const propType = (propSchema as any)?.type;

        if (propType === 'boolean') {
            result[key] = true;
            i++;
            continue;
        }

        const value = args[i + 1];
        if (value === undefined) {
            i++;
            continue;
        }
        if (propType === 'number' || propType === 'integer') {
            result[key] = Number(value);
        } else if (propType === 'array' || propType === 'object') {
            result[key] = JSON.parse(value);
        } else {
            result[key] = value;
        }
        i += 2;
    }
    return {parsed: result, unknownFlags};
}

export function extractFlag(args: string[], flag: string): string | null {
    const i = args.indexOf(flag);
    if (i === -1) return null;
    const val = args[i + 1] ?? null;
    args.splice(i, 2);
    return val;
}

// ---------------------------------------------------------------------------
// Help formatting
// ---------------------------------------------------------------------------

function indentBlock(text: string, prefix: string): string {
    return text.split('\n').map((line) => prefix + line).join('\n');
}

export function printToolHelp(tool: Tool, stdout: NodeJS.WritableStream): void {
    const name = tool.name.replace(/_/g, '-');
    stdout.write(`\n  ${name}`);
    if (tool.title) stdout.write(` — ${tool.title}`);
    stdout.write('\n');
    if (tool.description) stdout.write(`\n${indentBlock(tool.description, '  ')}\n`);

    const props = (tool.inputSchema as any)?.properties;
    const required = new Set((tool.inputSchema as any)?.required ?? []);
    if (props && Object.keys(props).length > 0) {
        stdout.write('\nFlags:\n');
        for (const [key, val] of Object.entries(props)) {
            const req = required.has(key) ? ' (required)' : '';
            const desc = (val as any)?.description;
            stdout.write(`  --${key}${req}\n`);
            if (desc) stdout.write(`${indentBlock(desc, '      ')}\n`);
        }
    }
    stdout.write('\nPass --input - to provide arguments as JSON via stdin.\n\n');
}

// ---------------------------------------------------------------------------
// Stdin
// ---------------------------------------------------------------------------

export async function readStdin(): Promise<string> {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
        chunks.push(chunk as string);
    }
    return chunks.join('');
}
