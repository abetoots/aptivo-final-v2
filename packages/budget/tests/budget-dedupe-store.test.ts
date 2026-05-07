/**
 * S18-B3: BudgetDedupeStore tests.
 *
 * Pin the AD-S18-6 contract: SET budget:dedupe:<deptId>:<period>:<threshold>
 * 1 NX EX <ttl>; first writer wins; fail-OPEN on Redis errors. Same
 * primitive that S18-C1c (ticket escalation) will replicate, so this
 * test surface is load-bearing for both.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createBudgetDedupeStore,
  currentMonthPeriod,
  secondsUntilNextMonth,
  type BudgetDedupeRedis,
  type BudgetThreshold,
} from '../src/budget-dedupe-store.js';

// ---------------------------------------------------------------------------
// in-memory Redis stub matching the BudgetDedupeRedis surface
// ---------------------------------------------------------------------------

interface InMemoryRedis extends BudgetDedupeRedis {
  _calls: { key: string; value: string; expirySeconds: number }[];
}

function createMemoryRedis(opts: { now?: () => number } = {}): InMemoryRedis {
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, { value: string; expiresAt: number }>();
  const calls: InMemoryRedis['_calls'] = [];

  return {
    _calls: calls,
    async set(key, value, options) {
      calls.push({ key, value, expirySeconds: options.expirySeconds });
      const existing = store.get(key);
      if (existing && existing.expiresAt > now()) return false;
      store.set(key, { value, expiresAt: now() + options.expirySeconds * 1000 });
      return true;
    },
    async del(key) {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
  };
}

describe('S18-B3: createBudgetDedupeStore', () => {
  it('first observation returns true; duplicate returns false', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    const first = await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    const second = await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('different (deptId, period, threshold) tuples dedupe independently', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' })).toBe(true);
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'exceeded' })).toBe(true);
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'escalation' })).toBe(true);
    expect(await store.shouldFire({ deptId: 'd2', period: '2026-05', threshold: 'warning' })).toBe(true);
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-06', threshold: 'warning' })).toBe(true);
    // ALL the above are first-observations; subsequent calls return false
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' })).toBe(false);
  });

  it('uses the budget:dedupe: prefix and (deptId, period, threshold) key shape', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    expect(redis._calls).toHaveLength(1);
    expect(redis._calls[0]!.key).toBe('budget:dedupe:d1:2026-05:warning');
    expect(redis._calls[0]!.value).toBe('1');
  });

  it('exceeded and escalation thresholds DO NOT collide (independent pipelines per AD-S18-6)', async () => {
    // The notification service writes 'exceeded'; the HITL escalation
    // service writes 'escalation'. Both fire on the same crossing
    // event but produce different side-effects, so each gets its own
    // dedupe slot.
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'exceeded' })).toBe(true);
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'escalation' })).toBe(true);
    // each pipeline's second observation collapses
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'exceeded' })).toBe(false);
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'escalation' })).toBe(false);
  });

  it('passes the resolveTtlSeconds output to the SET call', async () => {
    const redis = createMemoryRedis();
    const resolveTtlSeconds = vi.fn<
      (input: { deptId: string; period: string; threshold: BudgetThreshold }) => number
    >().mockReturnValue(12345);
    const store = createBudgetDedupeStore(redis, { resolveTtlSeconds });

    await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    expect(redis._calls[0]!.expirySeconds).toBe(12345);
    expect(resolveTtlSeconds).toHaveBeenCalledWith({
      deptId: 'd1',
      period: '2026-05',
      threshold: 'warning',
    });
  });

  it('default TTL is 24h (86400s) when no resolver is configured', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    expect(redis._calls[0]!.expirySeconds).toBe(24 * 60 * 60);
  });

  it('releaseSlot lets a subsequent shouldFire win the same key (Codex R1: dedupe failure recovery)', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);

    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' })).toBe(true);
    // simulate a downstream send-failure → release the slot
    await store.releaseSlot({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    // next observer can claim the slot and retry the side-effect
    expect(await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' })).toBe(true);
  });

  it('releaseSlot is idempotent — releasing a never-claimed key is a no-op', async () => {
    const redis = createMemoryRedis();
    const store = createBudgetDedupeStore(redis);
    await expect(
      store.releaseSlot({ deptId: 'd-ghost', period: '2026-05', threshold: 'warning' }),
    ).resolves.toBeUndefined();
  });

  it('releaseSlot failure is logged but not propagated', async () => {
    // worst-case-degradation: if release itself fails we already
    // failed once; suppressing the next retry is acceptable.
    const failingRedis: BudgetDedupeRedis = {
      set: vi.fn().mockResolvedValue(true),
      del: vi.fn().mockRejectedValue(new Error('redis del lost')),
    };
    const warn = vi.fn();
    const store = createBudgetDedupeStore(failingRedis, { logger: { warn } });

    await expect(
      store.releaseSlot({ deptId: 'd1', period: '2026-05', threshold: 'warning' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'budget_dedupe_release_failed',
      expect.objectContaining({ deptId: 'd1' }),
    );
  });

  it('fails OPEN on Redis SET error: returns true with warn (notification > silence)', async () => {
    const failingRedis: BudgetDedupeRedis = {
      set: vi.fn().mockRejectedValue(new Error('redis connection lost')),
      del: vi.fn().mockResolvedValue(0),
    };
    const warn = vi.fn();
    const store = createBudgetDedupeStore(failingRedis, { logger: { warn } });

    const result = await store.shouldFire({ deptId: 'd1', period: '2026-05', threshold: 'warning' });
    expect(result).toBe(true); // FAIL-OPEN
    expect(warn).toHaveBeenCalledWith(
      'budget_dedupe_store_failed',
      expect.objectContaining({ deptId: 'd1', period: '2026-05', threshold: 'warning' }),
    );
  });
});

describe('S18-B3: currentMonthPeriod / secondsUntilNextMonth', () => {
  it('formats UTC year-month as YYYY-MM', () => {
    const date = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    expect(currentMonthPeriod(date)).toBe('2026-05');
  });

  it('zero-pads single-digit months', () => {
    const date = new Date(Date.UTC(2026, 0, 15));
    expect(currentMonthPeriod(date)).toBe('2026-01');
  });

  it('secondsUntilNextMonth returns positive seconds to next 1st-UTC', () => {
    // May 15 00:00 UTC → June 1 00:00 UTC = exactly 17 days
    const date = new Date(Date.UTC(2026, 4, 15, 0, 0, 0));
    const seconds = secondsUntilNextMonth(date);
    expect(seconds).toBe(17 * 86400);
  });

  it('secondsUntilNextMonth clamps to >= 60 even at end of month (defensive)', () => {
    // last second of the month
    const date = new Date(Date.UTC(2026, 4, 31, 23, 59, 59));
    expect(secondsUntilNextMonth(date)).toBeGreaterThanOrEqual(60);
  });
});
