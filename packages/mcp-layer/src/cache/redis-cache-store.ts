/**
 * MCP-05: Redis Cache Store
 * @task MCP-05
 *
 * Fail-open: store errors are caught and logged, returning cache miss.
 * This ensures a Redis outage degrades to "no caching" rather than
 * blocking tool execution.
 */

import type { CacheRedisClient, McpCacheStore } from './cache-store.js';

export interface RedisCacheStoreOptions {
  /** optional logger for fail-open warnings */
  onError?: (operation: string, error: unknown) => void;
}

export class RedisCacheStore implements McpCacheStore {
  private readonly client: CacheRedisClient;
  private readonly onError: (operation: string, error: unknown) => void;

  constructor(client: CacheRedisClient, options?: RedisCacheStoreOptions) {
    this.client = client;
    this.onError = options?.onError ?? (() => {});
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.onError('get', err);
      return null; // fail-open
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, { EX: ttlSeconds });
    } catch (err) {
      this.onError('set', err);
      // fail-open: swallow error
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.onError('del', err);
      // fail-open: swallow error
    }
  }
}
