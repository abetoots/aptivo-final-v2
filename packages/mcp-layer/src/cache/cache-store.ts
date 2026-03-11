/**
 * MCP-05: Cache store interfaces and key normalization
 * @task MCP-05
 * @frd FR-CORE-MCP-003
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface McpCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// redis client interface (compatible with ioredis / node-redis)
// ---------------------------------------------------------------------------

export interface CacheRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// key normalization
// ---------------------------------------------------------------------------

/** recursively sort object keys for deterministic serialization */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(record[k]))
      .join(',') +
    '}'
  );
}

/**
 * Generate a deterministic cache key from server, tool, and input.
 * Key format: `mcp:<serverId>:<toolName>:<sha256(sortedInput)>`
 */
export function normalizeCacheKey(
  serverId: string,
  toolName: string,
  input: Record<string, unknown>,
): string {
  const serialized = stableStringify(input);
  const hash = createHash('sha256').update(serialized).digest('hex');
  return `mcp:${serverId}:${toolName}:${hash}`;
}
