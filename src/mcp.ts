import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';

import {type Profile, resolveAccessToken} from './config.js';
import {USER_AGENT, VERSION} from './cli.js';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const CONNECT_TIMEOUT_MS = 10_000;

export async function mcpConnect(endpoint: string, profile: Profile): Promise<Client> {
    const token = resolveAccessToken(profile);
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: {
            headers: {
                authorization: `Bearer ${token}`,
                'user-agent': `${USER_AGENT} node/${process.versions.node}`,
            },
        },
    });
    const client = new Client({name: 'airtable-mcp-cli', version: VERSION});

    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connection timed out. Check your network and endpoint.')), CONNECT_TIMEOUT_MS);
    });
    try {
        await Promise.race([client.connect(transport), timeout]);
    } finally {
        clearTimeout(timer!);
    }

    return client;
}

// ---------------------------------------------------------------------------
// Tool operations
// ---------------------------------------------------------------------------

export async function mcpListTools(client: Client): Promise<Tool[]> {
    return (await client.listTools()).tools;
}

export async function mcpCallTool(
    client: Client,
    name: string,
    args: Record<string, unknown>,
): Promise<{content: Array<{type: string; text?: string}>; structuredContent?: unknown; isError?: boolean}> {
    return await client.callTool({name, arguments: args}) as any;
}
