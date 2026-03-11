/**
 * MCP-05: Cache module barrel export
 */

export { InMemoryCacheStore } from './in-memory-cache-store.js';
export { RedisCacheStore } from './redis-cache-store.js';

export type { RedisCacheStoreOptions } from './redis-cache-store.js';

export { normalizeCacheKey } from './cache-store.js';

export type {
  McpCacheStore,
  CacheRedisClient,
} from './cache-store.js';
