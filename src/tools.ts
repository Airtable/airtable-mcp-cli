import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPError} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {Profile} from './config.js';
import {isFresh, loadCache, saveCache} from './cache.js';
import {mcpConnect, mcpListTools} from './mcp.js';

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export function visibleTools(tools: Array<Tool>): Array<Tool> {
    return tools.filter((t) => {
        const meta = t._meta as Record<string, unknown> | undefined;
        return !meta?.hideFromCli;
    });
}

// ---------------------------------------------------------------------------
// Resolution (cache → network → stale cache)
// ---------------------------------------------------------------------------

export type Result<T> =
    | {error: null; value: T}
    | {error: ResponseError; value?: never};

export enum ErrorType {
    AUTH_FAILED = 'auth_failed',
    FORBIDDEN = 'forbidden',
    UNPARSABLE_VALUE = 'unparsable_value',
}

export type ResponseError =
    | {type: ErrorType.AUTH_FAILED}
    | {type: ErrorType.FORBIDDEN}
    | {type: ErrorType.UNPARSABLE_VALUE; argName: string; value: string};

type ResolveToolsValue = {tools: Array<Tool>; client: Client | null; stale: boolean};

export async function resolveTools(
    profile: Profile,
    profileName: string,
    forceRefresh: boolean,
): Promise<Result<ResolveToolsValue>> {
    if (!forceRefresh) {
        const cache = loadCache(profileName);
        if (cache !== null && isFresh(cache)) return {error: null, value: {tools: cache.tools, client: null, stale: false}};
    }

    try {
        const client = await mcpConnect(profile.endpoint, profile);
        const tools = await mcpListTools(client);
        saveCache(profileName, tools);
        return {error: null, value: {tools, client, stale: false}};
    } catch (err) {
        if (err instanceof StreamableHTTPError && err.code === 401) {
            return {error: {type: ErrorType.AUTH_FAILED}};
        }
        if (err instanceof StreamableHTTPError && err.code === 403) {
            return {error: {type: ErrorType.FORBIDDEN}};
        }
        const cache = loadCache(profileName);
        if (cache !== null) {
            return {error: null, value: {tools: cache.tools, client: null, stale: true}};
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

export function extractData(result: {content: Array<{type: string; text?: string}>; structuredContent?: unknown}): unknown {
    if (result.structuredContent !== null && result.structuredContent !== undefined) return result.structuredContent;
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
): Result<{parsed: Record<string, unknown>; unknownFlags: Array<string>}> {
    const props = (schema as any)?.properties ?? {};
    const result: Record<string, unknown> = {};
    const unknownFlags: Array<string> = [];
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
            const next = args[i + 1];
            if (next === 'true' || next === 'false') {
                result[key] = next === 'true';
                i += 2;
            } else {
                result[key] = true;
                i++;
            }
            continue;
        }

        const value = args[i + 1];
        if (value === undefined) {
            i++;
            continue;
        }
        if (propType === 'number' || propType === 'integer') {
            const num = Number(value);
            if (isNaN(num)) {
                return {error: {type: ErrorType.UNPARSABLE_VALUE, argName: arg, value}};
            }
            result[key] = num;
        } else if (propType === 'array' || propType === 'object') {
            try {
                result[key] = JSON.parse(value);
            } catch {
                return {error: {type: ErrorType.UNPARSABLE_VALUE, argName: arg, value}};
            }
        } else {
            result[key] = value;
        }
        i += 2;
    }
    return {error: null, value: {parsed: result, unknownFlags}};
}

export function extractFlag(args: string[], flag: string): string | null {
    const i = args.indexOf(flag);
    if (i === -1) return null;
    const val = args[i + 1] ?? null;
    args.splice(i, 2);
    return val;
}

// Split raw args at the first `--` separator. Everything before it is subject
// to CLI-global flag handling (--profile, --output, --refresh, --quiet);
// everything after is forwarded to the tool verbatim, so a tool input can share
// a name with a reserved CLI flag without being consumed by CLI option parsing.
export function splitAtSeparator(args: string[]): {cliArgs: string[]; passthrough: string[]} {
    const i = args.indexOf('--');
    if (i === -1) return {cliArgs: [...args], passthrough: []};
    return {cliArgs: args.slice(0, i), passthrough: args.slice(i + 1)};
}

// Tool metadata (title, description, property descriptions) originates from the
// MCP server and the on-disk cache, neither of which is a trusted authoring
// boundary. Strip C0/C1 control bytes and ANSI/OSC escape sequences before
// writing any of it to a terminal so a poisoned string cannot spoof output,
// rewrite lines, or smuggle hidden instructions.
// Keep \t (\x09) and \n (\x0A); strip the rest of C0, DEL (\x7F), and C1
// (\x80-\x9F). Removing the ESC and C1 introducer bytes neutralizes ANSI/OSC
// sequences, leaving any residue as harmless literal text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

export function stripControlChars(text: string): string {
    return text.replace(CONTROL_CHARS, '');
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
    if (tool.title) stdout.write(` — ${stripControlChars(tool.title)}`);
    stdout.write('\n');
    if (tool.description) stdout.write(`\n${indentBlock(stripControlChars(tool.description), '  ')}\n`);

    const props = (tool.inputSchema as any)?.properties;
    const required = new Set((tool.inputSchema as any)?.required ?? []);
    if (props && Object.keys(props).length > 0) {
        stdout.write('\nFlags:\n');
        for (const [key, val] of Object.entries(props)) {
            const req = required.has(key) ? ' (required)' : '';
            const desc = (val as any)?.description;
            stdout.write(`  --${key}${req}\n`);
            if (desc) stdout.write(`${indentBlock(stripControlChars(desc), '      ')}\n`);
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
