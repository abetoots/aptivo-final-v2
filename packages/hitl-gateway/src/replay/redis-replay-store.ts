/**
 * CF-03: Redis-Backed Replay Store
 * @task CF-03
 * @condition C1 (Go/No-Go)
 *
 * Uses SET key "1" NX EX ttl for atomic claim-once semantics.
 * Multi-instance safe — Redis serializes concurrent claims.
 * Fail-closed: any Redis error results in rejection.
 */

import type { ClaimResult, ReplayStore } from './replay-store.js';

/**
 * Minimal Redis interface — compatible with ioredis and node-redis.
 * Consumers inject their own Redis client; we don't own the connection.
 */
export interface RedisClient {
  set(
    key: string,
    value: string,
    ...args: string[]
  ): Promise<string | null>;
}

export class RedisReplayStore implements ReplayStore {
  private readonly redis: RedisClient;
  private readonly keyPrefix: string;

  constructor(redis: RedisClient, keyPrefix = 'replay:') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  async claimOnce(key: string, ttlSeconds: number): Promise<ClaimResult> {
    const fullKey = `${this.keyPrefix}${key}`;
    try {
      // SET key "1" NX EX ttl — returns "OK" on first set, null on duplicate
      const result = await this.redis.set(
        fullKey,
        '1',
        'NX',
        'EX',
        String(ttlSeconds),
      );
      if (result === 'OK') {
        return { ok: true };
      }
      return { ok: false, reason: 'duplicate' };
    } catch {
      // fail-closed: store errors → rejection
      return { ok: false, reason: 'store-error' };
    }
  }
}
