/**
 * ID2-05: concurrent session limits tests
 * @task ID2-05
 *
 * verifies the session limit service: eviction logic, listing,
 * removal, counting, custom config, and redis failure handling
 * using an in-memory mock redis client.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionLimitService,
  DEFAULT_SESSION_LIMITS,
  type SessionLimitService,
  type SessionLimitConfig,
} from '../src/lib/auth/session-limit-service';
import type { RedisClient } from '../src/lib/auth/token-blacklist';

// ---------------------------------------------------------------------------
// mock redis
// ---------------------------------------------------------------------------

function createMockRedis(): RedisClient & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async set(key: string, value: string, _options?: { ex?: number }) {
      store.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async exists(...keys: string[]) {
      return keys.filter((k) => store.has(k)).length;
    },
    async del(...keys: string[]) {
      let c = 0;
      for (const k of keys) {
        if (store.delete(k)) c++;
      }
      return c;
    },
    async dbsize() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createService(
  redis: RedisClient,
  config?: SessionLimitConfig,
  keyPrefix?: string,
): SessionLimitService {
  return createSessionLimitService({ redis, config, keyPrefix });
}

// ---------------------------------------------------------------------------
// tests: checkAndEvict
// ---------------------------------------------------------------------------

describe('createSessionLimitService', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let service: SessionLimitService;

  beforeEach(() => {
    redis = createMockRedis();
    service = createService(redis);
  });

  describe('checkAndEvict', () => {
    it('allows a session under the limit with no evictions', async () => {
      const result = await service.checkAndEvict('user-1', 'user', 'sess-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('allows up to the limit without eviction (user role, limit=3)', async () => {
      await service.checkAndEvict('user-1', 'user', 'sess-1');
      await service.checkAndEvict('user-1', 'user', 'sess-2');
      const result = await service.checkAndEvict('user-1', 'user', 'sess-3');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }

      // verify count is 3
      const count = await service.getSessionCount('user-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(3);
      }
    });

    it('evicts oldest session when user exceeds limit (user role, 4th session)', async () => {
      // add 3 sessions with staggered timestamps
      await service.checkAndEvict('user-1', 'user', 'sess-1', 'device-a');
      await service.checkAndEvict('user-1', 'user', 'sess-2', 'device-b');
      await service.checkAndEvict('user-1', 'user', 'sess-3', 'device-c');

      // 4th session should evict the oldest (sess-1)
      const result = await service.checkAndEvict('user-1', 'user', 'sess-4', 'device-d');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.sessionId).toBe('sess-1');
      }

      // verify only 3 sessions remain
      const count = await service.getSessionCount('user-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(3);
      }
    });

    it('evicts existing session when admin exceeds limit (admin role, limit=1)', async () => {
      await service.checkAndEvict('admin-1', 'admin', 'sess-1');

      // 2nd session should evict the first
      const result = await service.checkAndEvict('admin-1', 'admin', 'sess-2');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.sessionId).toBe('sess-1');
      }

      // verify count is 1
      const count = await service.getSessionCount('admin-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(1);
      }
    });

    it('evicts multiple sessions when over limit by more than 1', async () => {
      // create a custom config with limit=1 for 'user'
      const strictService = createService(redis, {
        limits: { user: 1 },
        defaultLimit: 1,
      });

      await strictService.checkAndEvict('user-1', 'user', 'sess-1');

      // manually inject extra sessions into the index to simulate drift
      const prefix = 'sess:';
      redis.store.set(`${prefix}user-1:sess-extra-1`, JSON.stringify({ createdAt: 1000 }));
      redis.store.set(`${prefix}user-1:sess-extra-2`, JSON.stringify({ createdAt: 2000 }));

      // update the index to include all sessions
      const indexKeyStr = `${prefix}user-1:_index`;
      redis.store.set(indexKeyStr, JSON.stringify(['sess-extra-1', 'sess-extra-2', 'sess-1']));

      // add a new session — should evict the 3 oldest, keeping only the new one
      const result = await strictService.checkAndEvict('user-1', 'user', 'sess-new');
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 4 sessions total, limit 1, so 3 should be evicted
        expect(result.value).toHaveLength(3);
        const evictedIds = result.value.map((e) => e.sessionId);
        expect(evictedIds).toContain('sess-extra-1');
        expect(evictedIds).toContain('sess-extra-2');
      }

      const count = await strictService.getSessionCount('user-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(1);
      }
    });

    it('uses default limit for unknown roles', async () => {
      // default limit is 3
      await service.checkAndEvict('user-1', 'editor', 'sess-1');
      await service.checkAndEvict('user-1', 'editor', 'sess-2');
      await service.checkAndEvict('user-1', 'editor', 'sess-3');

      // 4th session should trigger eviction
      const result = await service.checkAndEvict('user-1', 'editor', 'sess-4');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.sessionId).toBe('sess-1');
      }
    });

    it('respects custom limits config', async () => {
      const customService = createService(redis, {
        limits: { vip: 5 },
        defaultLimit: 2,
      });

      // add 5 sessions — no eviction for vip
      for (let i = 1; i <= 5; i++) {
        const result = await customService.checkAndEvict('vip-user', 'vip', `sess-${i}`);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual([]);
        }
      }

      // 6th session should evict the oldest
      const result = await customService.checkAndEvict('vip-user', 'vip', 'sess-6');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.sessionId).toBe('sess-1');
      }
    });

    it('returns SessionError when redis throws', async () => {
      const failRedis = createMockRedis();
      failRedis.get = async () => {
        throw new Error('connection refused');
      };
      const failService = createService(failRedis);

      const result = await failService.checkAndEvict('user-1', 'user', 'sess-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionError');
        expect(result.error.operation).toBe('checkAndEvict');
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // tests: listSessions
  // ---------------------------------------------------------------------------

  describe('listSessions', () => {
    it('returns all active sessions for a user', async () => {
      await service.checkAndEvict('user-1', 'user', 'sess-a', 'Chrome');
      await service.checkAndEvict('user-1', 'user', 'sess-b', 'Firefox');

      const result = await service.listSessions('user-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const ids = result.value.map((s) => s.sessionId);
        expect(ids).toContain('sess-a');
        expect(ids).toContain('sess-b');

        // check device info is preserved
        const chrome = result.value.find((s) => s.sessionId === 'sess-a');
        expect(chrome?.deviceInfo).toBe('Chrome');
      }
    });

    it('returns empty array when user has no sessions', async () => {
      const result = await service.listSessions('no-sessions-user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns SessionError when redis throws', async () => {
      const failRedis = createMockRedis();
      failRedis.get = async () => {
        throw new Error('timeout');
      };
      const failService = createService(failRedis);

      const result = await failService.listSessions('user-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionError');
        expect(result.error.operation).toBe('listSessions');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // tests: removeSession
  // ---------------------------------------------------------------------------

  describe('removeSession', () => {
    it('removes a specific session', async () => {
      await service.checkAndEvict('user-1', 'user', 'sess-1');
      await service.checkAndEvict('user-1', 'user', 'sess-2');

      const removeResult = await service.removeSession('user-1', 'sess-1');
      expect(removeResult.ok).toBe(true);

      const count = await service.getSessionCount('user-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(1);
      }

      // remaining session should be sess-2
      const sessions = await service.listSessions('user-1');
      expect(sessions.ok).toBe(true);
      if (sessions.ok) {
        expect(sessions.value).toHaveLength(1);
        expect(sessions.value[0]!.sessionId).toBe('sess-2');
      }
    });

    it('handles removing a non-existent session gracefully', async () => {
      await service.checkAndEvict('user-1', 'user', 'sess-1');

      // removing a session that does not exist should not error
      const result = await service.removeSession('user-1', 'non-existent');
      expect(result.ok).toBe(true);

      // original session still exists
      const count = await service.getSessionCount('user-1');
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(1);
      }
    });

    it('returns SessionError when redis throws', async () => {
      const failRedis = createMockRedis();
      failRedis.get = async () => {
        throw new Error('connection lost');
      };
      const failService = createService(failRedis);

      const result = await failService.removeSession('user-1', 'sess-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionError');
        expect(result.error.operation).toBe('removeSession');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // tests: getSessionCount
  // ---------------------------------------------------------------------------

  describe('getSessionCount', () => {
    it('returns correct count', async () => {
      await service.checkAndEvict('user-1', 'user', 'sess-1');
      await service.checkAndEvict('user-1', 'user', 'sess-2');

      const result = await service.getSessionCount('user-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });

    it('returns 0 for a user with no sessions', async () => {
      const result = await service.getSessionCount('empty-user');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it('returns SessionError when redis throws', async () => {
      const failRedis = createMockRedis();
      failRedis.get = async () => {
        throw new Error('network error');
      };
      const failService = createService(failRedis);

      const result = await failService.getSessionCount('user-1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionError');
        expect(result.error.operation).toBe('getSessionCount');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // tests: custom key prefix
  // ---------------------------------------------------------------------------

  describe('custom key prefix', () => {
    it('uses the provided key prefix for all operations', async () => {
      const customService = createService(redis, undefined, 'mysess:');

      await customService.checkAndEvict('user-1', 'user', 'sess-1', 'Chrome');

      // verify the keys use the custom prefix
      const keys = [...redis.store.keys()];
      expect(keys.some((k) => k.startsWith('mysess:'))).toBe(true);
      expect(keys.some((k) => k.startsWith('sess:'))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // tests: default config
  // ---------------------------------------------------------------------------

  describe('DEFAULT_SESSION_LIMITS', () => {
    it('has admin limit of 1', () => {
      expect(DEFAULT_SESSION_LIMITS.limits.admin).toBe(1);
    });

    it('has user limit of 3', () => {
      expect(DEFAULT_SESSION_LIMITS.limits.user).toBe(3);
    });

    it('has default limit of 3', () => {
      expect(DEFAULT_SESSION_LIMITS.defaultLimit).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // tests: isolation between users
  // ---------------------------------------------------------------------------

  describe('user isolation', () => {
    it('sessions from different users do not interfere', async () => {
      await service.checkAndEvict('user-a', 'user', 'sess-1');
      await service.checkAndEvict('user-b', 'user', 'sess-1');

      const countA = await service.getSessionCount('user-a');
      const countB = await service.getSessionCount('user-b');

      expect(countA.ok).toBe(true);
      expect(countB.ok).toBe(true);
      if (countA.ok) expect(countA.value).toBe(1);
      if (countB.ok) expect(countB.value).toBe(1);

      // removing user-a's session does not affect user-b
      await service.removeSession('user-a', 'sess-1');

      const countA2 = await service.getSessionCount('user-a');
      const countB2 = await service.getSessionCount('user-b');
      expect(countA2.ok).toBe(true);
      expect(countB2.ok).toBe(true);
      if (countA2.ok) expect(countA2.value).toBe(0);
      if (countB2.ok) expect(countB2.value).toBe(1);
    });
  });
});
