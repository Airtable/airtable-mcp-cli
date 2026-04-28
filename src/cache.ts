import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';

import type {Tool} from '@modelcontextprotocol/sdk/types.js';

import {cachePath, ensureConfigDir} from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Cache = {tools: Tool[]; hash: string; fetchedAt: number};

// ---------------------------------------------------------------------------
// TTL
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 1000;

export function isFresh(cache: Cache): boolean {
    return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function hashTools(tools: Tool[]): string {
    return createHash('sha256').update(JSON.stringify(tools)).digest('hex');
}

export function loadCache(profile: string): Cache | null {
    let cache: Cache;
    try {
        cache = JSON.parse(readFileSync(cachePath(profile), 'utf-8')) as Cache;
    } catch {
        return null;
    }
    // Validate integrity — reject tampered or corrupted cache
    if (hashTools(cache.tools) !== cache.hash) return null;
    return cache;
}

export function saveCache(profile: string, tools: Tool[]): Cache {
    const cache: Cache = {
        tools,
        hash: hashTools(tools),
        fetchedAt: Date.now(),
    };
    ensureConfigDir();
    writeFileSync(cachePath(profile), JSON.stringify(cache), {mode: 0o600});
    return cache;
}
