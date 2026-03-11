/**
 * @testcase CF-03-RS-001 through CF-03-RS-012
 * @task CF-03
 * @condition C1 (Go/No-Go)
 * @see docs/06-sprints/sprint-2-plan.md §CF-03
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryReplayStore } from '../../src/replay/in-memory-replay-store.js';
import { RedisReplayStore } from '../../src/replay/redis-replay-store.js';
import type { RedisClient } from '../../src/replay/redis-replay-store.js';
import type { ReplayStore } from '../../src/replay/replay-store.js';

// ---------------------------------------------------------------------------
// InMemoryReplayStore
// ---------------------------------------------------------------------------

describe('CF-03: InMemoryReplayStore', () => {
  let store: InMemoryReplayStore;

  beforeEach(() => {
    store = new InMemoryReplayStore();
  });

  afterEach(() => {
    store.clear();
  });

  it('returns ok:true on first claim', async () => {
    const result = await store.claimOnce('jti-001', 60);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok:false with reason duplicate on second claim', async () => {
    await store.claimOnce('jti-001', 60);
    const result = await store.claimOnce('jti-001', 60);
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('accepts different keys independently', async () => {
    const r1 = await store.claimOnce('jti-001', 60);
    const r2 = await store.claimOnce('jti-002', 60);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(store.size).toBe(2);
  });

  it('sync claim works identically to async', () => {
    const r1 = store.claim('jti-001', 60);
    expect(r1).toEqual({ ok: true });

    const r2 = store.claim('jti-001', 60);
    expect(r2).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('auto-cleans keys after TTL expires', async () => {
    vi.useFakeTimers();

    store.claim('jti-short', 2); // 2 second TTL
    expect(store.size).toBe(1);

    // advance 3 seconds — key should be cleaned up
    vi.advanceTimersByTime(3_000);
    expect(store.size).toBe(0);

    // re-claiming should succeed
    const result = store.claim('jti-short', 60);
    expect(result).toEqual({ ok: true });

    vi.useRealTimers();
  });

  it('clear() removes all claimed keys', async () => {
    await store.claimOnce('a', 60);
    await store.claimOnce('b', 60);
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);

    // re-claiming should succeed
    const result = await store.claimOnce('a', 60);
    expect(result).toEqual({ ok: true });
  });

  it('10 concurrent claims — exactly 1 succeeds', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.claimOnce('race-key', 60)),
    );

    const successes = results.filter((r) => r.ok);
    const duplicates = results.filter((r) => !r.ok && r.reason === 'duplicate');

    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// RedisReplayStore
// ---------------------------------------------------------------------------

describe('CF-03: RedisReplayStore', () => {
  let mockRedis: RedisClient;
  let store: RedisReplayStore;

  beforeEach(() => {
    mockRedis = {
      set: vi.fn<RedisClient['set']>(),
    };
    store = new RedisReplayStore(mockRedis);
  });

  it('returns ok:true when SET NX EX returns OK', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    const result = await store.claimOnce('jti-001', 60);
    expect(result).toEqual({ ok: true });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'replay:jti-001', '1', 'NX', 'EX', '60',
    );
  });

  it('returns ok:false with reason duplicate when SET NX returns null', async () => {
    vi.mocked(mockRedis.set).mockResolvedValue(null);

    const result = await store.claimOnce('jti-001', 60);
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('returns ok:false with reason store-error on Redis failure', async () => {
    vi.mocked(mockRedis.set).mockRejectedValue(new Error('connection refused'));

    const result = await store.claimOnce('jti-001', 60);
    expect(result).toEqual({ ok: false, reason: 'store-error' });
  });

  it('uses custom key prefix', async () => {
    const customStore = new RedisReplayStore(mockRedis, 'hitl:jti:');
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    await customStore.claimOnce('abc', 30);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'hitl:jti:abc', '1', 'NX', 'EX', '30',
    );
  });

  it('10 concurrent claims — exactly 1 succeeds', async () => {
    // first call returns OK, rest return null (simulates Redis NX semantics)
    let firstCall = true;
    vi.mocked(mockRedis.set).mockImplementation(async () => {
      if (firstCall) {
        firstCall = false;
        return 'OK';
      }
      return null;
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.claimOnce('race-key', 60)),
    );

    const successes = results.filter((r) => r.ok);
    const duplicates = results.filter((r) => !r.ok && r.reason === 'duplicate');

    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(9);
  });

  it('fail-closed: partial Redis failures result in rejection', async () => {
    // first call succeeds, then Redis goes down
    vi.mocked(mockRedis.set)
      .mockResolvedValueOnce('OK')
      .mockRejectedValueOnce(new Error('Redis timeout'));

    const r1 = await store.claimOnce('key-1', 60);
    const r2 = await store.claimOnce('key-2', 60);

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: false, reason: 'store-error' });
  });
});

// ---------------------------------------------------------------------------
// ReplayStore contract tests (both implementations)
// ---------------------------------------------------------------------------

describe('CF-03: ReplayStore contract', () => {
  const stores: { name: string; create: () => ReplayStore }[] = [
    {
      name: 'InMemoryReplayStore',
      create: () => new InMemoryReplayStore(),
    },
    {
      name: 'RedisReplayStore (mocked)',
      create: () => {
        let claimed = false;
        const redis: RedisClient = {
          set: vi.fn(async () => {
            if (!claimed) {
              claimed = true;
              return 'OK';
            }
            return null;
          }),
        };
        return new RedisReplayStore(redis);
      },
    },
  ];

  for (const { name, create } of stores) {
    describe(name, () => {
      it('first claim succeeds', async () => {
        const store = create();
        const result = await store.claimOnce('contract-key', 60);
        expect(result.ok).toBe(true);
      });

      it('second claim on same key fails', async () => {
        const store = create();
        await store.claimOnce('contract-key', 60);
        const result = await store.claimOnce('contract-key', 60);
        expect(result.ok).toBe(false);
      });
    });
  }
});
