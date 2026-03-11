/**
 * @testcase MCP-05-RC-001 through MCP-05-RC-016
 * @task MCP-05
 * @frd FR-CORE-MCP-003
 *
 * Tests response caching:
 * - Deterministic cache key normalization
 * - In-memory cache store with TTL
 * - Redis cache store with fail-open behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeCacheKey } from '../src/cache/cache-store.js';
import { InMemoryCacheStore } from '../src/cache/in-memory-cache-store.js';
import { RedisCacheStore } from '../src/cache/redis-cache-store.js';
import type { CacheRedisClient } from '../src/cache/cache-store.js';

describe('MCP-05: Response Caching', () => {
  // -----------------------------------------------------------------------
  // normalizeCacheKey
  // -----------------------------------------------------------------------

  describe('normalizeCacheKey', () => {
    it('generates deterministic key for same input', () => {
      const key1 = normalizeCacheKey('s1', 'tool-a', { x: 1, y: 2 });
      const key2 = normalizeCacheKey('s1', 'tool-a', { x: 1, y: 2 });
      expect(key1).toBe(key2);
    });

    it('generates different keys for different inputs', () => {
      const key1 = normalizeCacheKey('s1', 'tool-a', { x: 1 });
      const key2 = normalizeCacheKey('s1', 'tool-a', { x: 2 });
      expect(key1).not.toBe(key2);
    });

    it('is order-independent for object keys', () => {
      const key1 = normalizeCacheKey('s1', 'tool-a', { b: 2, a: 1 });
      const key2 = normalizeCacheKey('s1', 'tool-a', { a: 1, b: 2 });
      expect(key1).toBe(key2);
    });

    it('handles nested objects with order independence', () => {
      const key1 = normalizeCacheKey('s1', 'tool-a', { outer: { z: 3, a: 1 } });
      const key2 = normalizeCacheKey('s1', 'tool-a', { outer: { a: 1, z: 3 } });
      expect(key1).toBe(key2);
    });

    it('includes serverId and toolName in key prefix', () => {
      const key = normalizeCacheKey('my-server', 'my-tool', {});
      expect(key).toMatch(/^mcp:my-server:my-tool:/);
    });

    it('uses sha256 hex hash format', () => {
      const key = normalizeCacheKey('s1', 't1', { a: 1 });
      // format: mcp:<server>:<tool>:<64-char-hex>
      const parts = key.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[3]).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // -----------------------------------------------------------------------
  // InMemoryCacheStore
  // -----------------------------------------------------------------------

  describe('InMemoryCacheStore', () => {
    let store: InMemoryCacheStore;

    beforeEach(() => {
      store = new InMemoryCacheStore();
    });

    it('returns null for missing key', async () => {
      expect(await store.get('nonexistent')).toBeNull();
    });

    it('returns value after set', async () => {
      await store.set('key1', '{"data":true}', 60);
      expect(await store.get('key1')).toBe('{"data":true}');
    });

    it('deletes entry', async () => {
      await store.set('key1', 'value', 60);
      await store.del('key1');
      expect(await store.get('key1')).toBeNull();
    });

    it('expires entries after TTL', async () => {
      vi.useFakeTimers();
      try {
        await store.set('key1', 'value', 5); // 5 second TTL

        // still valid
        expect(await store.get('key1')).toBe('value');

        // advance past TTL
        vi.advanceTimersByTime(6_000);
        expect(await store.get('key1')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns null for expired entries without error', async () => {
      vi.useFakeTimers();
      try {
        await store.set('key1', 'value', 1);
        vi.advanceTimersByTime(2_000);

        const result = await store.get('key1');
        expect(result).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('overwrites existing entries', async () => {
      await store.set('key1', 'old', 60);
      await store.set('key1', 'new', 60);
      expect(await store.get('key1')).toBe('new');
    });
  });

  // -----------------------------------------------------------------------
  // RedisCacheStore (fail-open)
  // -----------------------------------------------------------------------

  describe('RedisCacheStore', () => {
    it('delegates get to redis client', async () => {
      const client: CacheRedisClient = {
        get: vi.fn(async () => '{"cached":true}'),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => 1),
      };
      const store = new RedisCacheStore(client);

      const result = await store.get('key1');
      expect(result).toBe('{"cached":true}');
      expect(client.get).toHaveBeenCalledWith('key1');
    });

    it('delegates set with EX option', async () => {
      const client: CacheRedisClient = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => 1),
      };
      const store = new RedisCacheStore(client);

      await store.set('key1', 'value', 300);
      expect(client.set).toHaveBeenCalledWith('key1', 'value', { EX: 300 });
    });

    it('delegates del to redis client', async () => {
      const client: CacheRedisClient = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => 1),
      };
      const store = new RedisCacheStore(client);

      await store.del('key1');
      expect(client.del).toHaveBeenCalledWith('key1');
    });

    it('fail-open: returns null on get error', async () => {
      const onError = vi.fn();
      const client: CacheRedisClient = {
        get: vi.fn(async () => { throw new Error('Redis down'); }),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => 1),
      };
      const store = new RedisCacheStore(client, { onError });

      const result = await store.get('key1');
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith('get', expect.any(Error));
    });

    it('fail-open: swallows set error', async () => {
      const onError = vi.fn();
      const client: CacheRedisClient = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => { throw new Error('Redis down'); }),
        del: vi.fn(async () => 1),
      };
      const store = new RedisCacheStore(client, { onError });

      // should not throw
      await store.set('key1', 'value', 60);
      expect(onError).toHaveBeenCalledWith('set', expect.any(Error));
    });

    it('fail-open: swallows del error', async () => {
      const onError = vi.fn();
      const client: CacheRedisClient = {
        get: vi.fn(async () => null),
        set: vi.fn(async () => 'OK'),
        del: vi.fn(async () => { throw new Error('Redis down'); }),
      };
      const store = new RedisCacheStore(client, { onError });

      // should not throw
      await store.del('key1');
      expect(onError).toHaveBeenCalledWith('del', expect.any(Error));
    });
  });
});
