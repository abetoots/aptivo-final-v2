/**
 * MCP-05: In-Memory Cache Store (for tests)
 * @task MCP-05
 *
 * TTL-aware Map-based cache. Expiry checked lazily on get().
 */

import type { McpCacheStore } from './cache-store.js';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class InMemoryCacheStore implements McpCacheStore {
  private readonly store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** test helper: number of entries (including expired) */
  get size(): number {
    return this.store.size;
  }
}
