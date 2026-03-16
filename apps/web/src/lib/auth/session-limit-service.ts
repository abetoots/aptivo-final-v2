/**
 * ID2-05: concurrent session limits
 * @task ID2-05
 *
 * tracks active sessions per user using redis and enforces
 * configurable per-role concurrency limits. when a new login
 * exceeds the limit the oldest sessions are evicted.
 */

import { Result } from '@aptivo/types';
import type { RedisClient, RedisMulti } from './token-blacklist.js';

// -- types --

export type SessionError = {
  readonly _tag: 'SessionError';
  readonly operation: string;
  readonly cause: unknown;
};

export interface SessionInfo {
  sessionId: string;
  createdAt: number; // unix timestamp
  deviceInfo?: string;
}

export interface SessionLimitConfig {
  /** max concurrent sessions per role, default: { admin: 1, user: 3 } */
  limits: Record<string, number>;
  /** default limit for roles not in the config */
  defaultLimit: number;
}

export const DEFAULT_SESSION_LIMITS: SessionLimitConfig = {
  limits: { admin: 1, user: 3 },
  defaultLimit: 3,
};

export interface SessionLimitDeps {
  redis: RedisClient;
  config?: SessionLimitConfig;
  keyPrefix?: string; // default: 'sess:'
}

export interface EvictedSession {
  sessionId: string;
}

export interface SessionLimitService {
  /** track a new session and evict oldest if over limit. returns evicted session IDs */
  checkAndEvict(
    userId: string,
    role: string,
    newSessionId: string,
    deviceInfo?: string,
  ): Promise<Result<EvictedSession[], SessionError>>;
  /** list active sessions for a user */
  listSessions(userId: string): Promise<Result<SessionInfo[], SessionError>>;
  /** remove a specific session */
  removeSession(userId: string, sessionId: string): Promise<Result<void, SessionError>>;
  /** get session count for a user */
  getSessionCount(userId: string): Promise<Result<number, SessionError>>;
}

// -- factory --

export function createSessionLimitService(deps: SessionLimitDeps): SessionLimitService {
  const { redis, config = DEFAULT_SESSION_LIMITS, keyPrefix = 'sess:' } = deps;

  // key helpers
  const sessionKey = (userId: string, sessionId: string) =>
    `${keyPrefix}${userId}:${sessionId}`;
  const indexKey = (userId: string) => `${keyPrefix}${userId}:_index`;

  // resolve the max sessions allowed for a role
  const limitForRole = (role: string): number =>
    config.limits[role] ?? config.defaultLimit;

  // read the session index (list of session ids)
  const readIndex = async (userId: string): Promise<string[]> => {
    const raw = await redis.get(indexKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  };

  // write the session index
  const writeIndex = async (userId: string, ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      await redis.del(indexKey(userId));
    } else {
      await redis.set(indexKey(userId), JSON.stringify(ids));
    }
  };

  // read a single session's metadata
  const readSession = async (userId: string, sessionId: string): Promise<SessionInfo | null> => {
    const raw = await redis.get(sessionKey(userId, sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { createdAt: number; deviceInfo?: string };
    return { sessionId, createdAt: parsed.createdAt, deviceInfo: parsed.deviceInfo };
  };

  // max retries for atomic WATCH/MULTI/EXEC conflicts
  const MAX_ATOMIC_RETRIES = 3;

  // non-atomic eviction logic (original path, also used as fallback)
  const checkAndEvictNonAtomic = async (
    userId: string,
    role: string,
    newSessionId: string,
    deviceInfo?: string,
  ): Promise<Result<EvictedSession[], SessionError>> => {
    const limit = limitForRole(role);
    const ids = await readIndex(userId);

    // store the new session metadata
    const now = Math.floor(Date.now() / 1000);
    await redis.set(
      sessionKey(userId, newSessionId),
      JSON.stringify({ createdAt: now, deviceInfo }),
    );

    // add new id to the index (deduplicate to prevent inflation)
    const updatedIds = ids.includes(newSessionId) ? [...ids] : [...ids, newSessionId];

    // check if over limit
    if (updatedIds.length <= limit) {
      await writeIndex(userId, updatedIds);
      return Result.ok([]);
    }

    // load all sessions to sort by createdAt
    const sessions: SessionInfo[] = [];
    for (const id of updatedIds) {
      const info = await readSession(userId, id);
      if (info) {
        sessions.push(info);
      }
    }

    // sort ascending by createdAt (oldest first)
    sessions.sort((a, b) => a.createdAt - b.createdAt);

    // determine how many to evict
    const evictCount = sessions.length - limit;
    const toEvict = sessions.slice(0, evictCount);
    const toKeep = sessions.slice(evictCount);

    // delete evicted session keys
    for (const s of toEvict) {
      await redis.del(sessionKey(userId, s.sessionId));
    }

    // update the index with remaining session ids
    await writeIndex(userId, toKeep.map((s) => s.sessionId));

    return Result.ok(toEvict.map((s) => ({ sessionId: s.sessionId })));
  };

  // atomic eviction using WATCH/MULTI/EXEC with retry
  const checkAndEvictAtomic = async (
    userId: string,
    role: string,
    newSessionId: string,
    deviceInfo?: string,
  ): Promise<Result<EvictedSession[], SessionError>> => {
    const limit = limitForRole(role);
    const iKey = indexKey(userId);

    for (let attempt = 0; attempt < MAX_ATOMIC_RETRIES; attempt++) {
      // watch the session index key for concurrent modifications
      await redis.watch!(iKey);

      // read the current index
      const ids = await readIndex(userId);

      // store the new session metadata (idempotent write, safe outside transaction)
      const now = Math.floor(Date.now() / 1000);
      await redis.set(
        sessionKey(userId, newSessionId),
        JSON.stringify({ createdAt: now, deviceInfo }),
      );

      // add new id to the index (deduplicate to prevent inflation)
      const updatedIds = ids.includes(newSessionId) ? [...ids] : [...ids, newSessionId];

      // check if over limit
      if (updatedIds.length <= limit) {
        // use multi/exec to atomically update the index
        const tx = redis.multi!();
        tx.set(iKey, JSON.stringify(updatedIds));
        const result = await tx.exec();
        if (result === null) {
          // watch conflict — retry
          continue;
        }
        return Result.ok([]);
      }

      // load all sessions to sort by createdAt
      const sessions: SessionInfo[] = [];
      for (const id of updatedIds) {
        const info = await readSession(userId, id);
        if (info) {
          sessions.push(info);
        }
      }

      // sort ascending by createdAt (oldest first)
      sessions.sort((a, b) => a.createdAt - b.createdAt);

      // determine how many to evict
      const evictCount = sessions.length - limit;
      const toEvict = sessions.slice(0, evictCount);
      const toKeep = sessions.slice(evictCount);

      // build the atomic transaction: set new index + del evicted session keys
      const tx = redis.multi!();
      if (toKeep.length === 0) {
        tx.del(iKey);
      } else {
        tx.set(iKey, JSON.stringify(toKeep.map((s) => s.sessionId)));
      }
      for (const s of toEvict) {
        tx.del(sessionKey(userId, s.sessionId));
      }

      const execResult = await tx.exec();
      if (execResult === null) {
        // watch conflict — retry
        continue;
      }

      return Result.ok(toEvict.map((s) => ({ sessionId: s.sessionId })));
    }

    // exhausted retries — clean up orphaned session key
    await redis.del(sessionKey(userId, newSessionId)).catch(() => {});
    return Result.err({
      _tag: 'SessionError' as const,
      operation: 'checkAndEvict',
      cause: new Error(`atomic eviction failed after ${MAX_ATOMIC_RETRIES} retries (WATCH conflict)`),
    });
  };

  return {
    async checkAndEvict(userId, role, newSessionId, deviceInfo) {
      try {
        // use atomic path when redis supports watch/multi, otherwise fall back
        if (redis.watch && redis.multi) {
          return await checkAndEvictAtomic(userId, role, newSessionId, deviceInfo);
        }
        return await checkAndEvictNonAtomic(userId, role, newSessionId, deviceInfo);
      } catch (cause) {
        return Result.err({ _tag: 'SessionError' as const, operation: 'checkAndEvict', cause });
      }
    },

    async listSessions(userId) {
      try {
        const ids = await readIndex(userId);
        const sessions: SessionInfo[] = [];
        for (const id of ids) {
          const info = await readSession(userId, id);
          if (info) sessions.push(info);
        }
        return Result.ok(sessions);
      } catch (cause) {
        return Result.err({ _tag: 'SessionError' as const, operation: 'listSessions', cause });
      }
    },

    async removeSession(userId, sessionId) {
      try {
        const ids = await readIndex(userId);
        const filtered = ids.filter((id) => id !== sessionId);
        await writeIndex(userId, filtered);
        await redis.del(sessionKey(userId, sessionId));
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'SessionError' as const, operation: 'removeSession', cause });
      }
    },

    async getSessionCount(userId) {
      try {
        const ids = await readIndex(userId);
        return Result.ok(ids.length);
      } catch (cause) {
        return Result.err({ _tag: 'SessionError' as const, operation: 'getSessionCount', cause });
      }
    },
  };
}
