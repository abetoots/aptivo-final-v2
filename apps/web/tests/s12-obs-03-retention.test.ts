/**
 * S12-OBS-03: Retention Policy Service
 * @task OBS-03
 *
 * verifies default retention policies, domain-specific cutoff dates,
 * batch loop behavior, per-domain count reporting, and custom policy overrides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRetentionService } from '@aptivo/audit/retention';
import { DEFAULT_RETENTION_POLICIES } from '@aptivo/audit/retention';
import type { RetentionStore, RetentionPolicy } from '@aptivo/audit/retention';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockStore(purgeResults: Record<string, number[]> = {}): RetentionStore {
  // purgeResults maps domain -> array of numbers returned per call
  const callCounts: Record<string, number> = {};
  return {
    purgeExpired: vi.fn(async (domain: string, _cutoffDate: Date, _batchSize: number): Promise<number> => {
      const results = purgeResults[domain] ?? [0];
      const callIndex = callCounts[domain] ?? 0;
      callCounts[domain] = callIndex + 1;
      return results[callIndex] ?? 0;
    }),
  };
}

// ---------------------------------------------------------------------------
// default policy configuration
// ---------------------------------------------------------------------------

describe('OBS-03: retention — default policies', () => {
  it('core domain has 90-day retention', () => {
    const core = DEFAULT_RETENTION_POLICIES.find((p) => p.domain === 'core');
    expect(core).toBeDefined();
    expect(core!.retentionDays).toBe(90);
  });

  it('hr domain has 7-year (2555-day) retention', () => {
    const hr = DEFAULT_RETENTION_POLICIES.find((p) => p.domain === 'hr');
    expect(hr).toBeDefined();
    expect(hr!.retentionDays).toBe(2555);
  });

  it('crypto domain has 5-year (1825-day) retention', () => {
    const crypto = DEFAULT_RETENTION_POLICIES.find((p) => p.domain === 'crypto');
    expect(crypto).toBeDefined();
    expect(crypto!.retentionDays).toBe(1825);
  });

  it('all policies have batch size of 1000', () => {
    for (const policy of DEFAULT_RETENTION_POLICIES) {
      expect(policy.purgeBatchSize).toBe(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// purge execution
// ---------------------------------------------------------------------------

describe('OBS-03: retention — purge execution', () => {
  it('purges records for all configured domains', async () => {
    const store = createMockStore({
      core: [500],
      hr: [200],
      crypto: [100],
    });
    const service = createRetentionService({ store });

    const result = await service.purgeExpired();
    expect(result.purgedCount).toBe(800);
    expect(result.domains.core).toBe(500);
    expect(result.domains.hr).toBe(200);
    expect(result.domains.crypto).toBe(100);
  });

  it('loops batch purge until a batch returns fewer than batchSize', async () => {
    // simulate 2500 records for core: 1000 + 1000 + 500
    const store = createMockStore({
      core: [1000, 1000, 500],
      hr: [0],
      crypto: [0],
    });
    const service = createRetentionService({ store });

    const result = await service.purgeExpired();
    expect(result.purgedCount).toBe(2500);
    expect(result.domains.core).toBe(2500);
    // verify purgeExpired was called 3 times for core
    expect(store.purgeExpired).toHaveBeenCalledTimes(5); // 3 core + 1 hr + 1 crypto
  });

  it('omits domains with 0 purged records from result', async () => {
    const store = createMockStore({
      core: [100],
      hr: [0],
      crypto: [0],
    });
    const service = createRetentionService({ store });

    const result = await service.purgeExpired();
    expect(result.purgedCount).toBe(100);
    expect(result.domains).toEqual({ core: 100 });
    expect(result.domains.hr).toBeUndefined();
    expect(result.domains.crypto).toBeUndefined();
  });

  it('handles all domains returning 0 records', async () => {
    const store = createMockStore({
      core: [0],
      hr: [0],
      crypto: [0],
    });
    const service = createRetentionService({ store });

    const result = await service.purgeExpired();
    expect(result.purgedCount).toBe(0);
    expect(result.domains).toEqual({});
  });

  it('passes correct cutoff date for core (90 days ago)', async () => {
    const store = createMockStore({ core: [0], hr: [0], crypto: [0] });
    const service = createRetentionService({ store });

    const now = Date.now();
    await service.purgeExpired();

    const coreCall = vi.mocked(store.purgeExpired).mock.calls.find((c) => c[0] === 'core');
    expect(coreCall).toBeDefined();

    const cutoffDate = coreCall![1] as Date;
    const expectedApprox = new Date(now);
    expectedApprox.setDate(expectedApprox.getDate() - 90);

    // allow 5-second tolerance for test execution time
    expect(Math.abs(cutoffDate.getTime() - expectedApprox.getTime())).toBeLessThan(5000);
  });

  it('hr records at 6 years are NOT purged (within 7-year retention)', async () => {
    // mock store that returns 0 — the cutoff date should be ~7 years ago
    const store = createMockStore({ core: [0], hr: [0], crypto: [0] });
    const service = createRetentionService({ store });

    await service.purgeExpired();

    const hrCall = vi.mocked(store.purgeExpired).mock.calls.find((c) => c[0] === 'hr');
    expect(hrCall).toBeDefined();

    const cutoffDate = hrCall![1] as Date;
    const now = new Date();
    const sixYearsAgo = new Date(now);
    sixYearsAgo.setDate(sixYearsAgo.getDate() - (365 * 6));

    // cutoff should be ~7 years ago, which is older than 6 years ago
    // meaning records from 6 years ago would NOT be purged
    expect(cutoffDate.getTime()).toBeLessThan(sixYearsAgo.getTime());
  });
});

// ---------------------------------------------------------------------------
// custom policies
// ---------------------------------------------------------------------------

describe('OBS-03: retention — custom policies', () => {
  it('uses custom policies when provided', async () => {
    const customPolicies: RetentionPolicy[] = [
      { domain: 'custom', retentionDays: 30, purgeBatchSize: 500 },
    ];
    const store = createMockStore({ custom: [250] });
    const service = createRetentionService({ store, policies: customPolicies });

    const result = await service.purgeExpired();
    expect(result.purgedCount).toBe(250);
    expect(result.domains.custom).toBe(250);

    // verify the correct batch size was used
    const call = vi.mocked(store.purgeExpired).mock.calls[0]!;
    expect(call[2]).toBe(500);
  });

  it('custom policies completely replace defaults', async () => {
    const customPolicies: RetentionPolicy[] = [
      { domain: 'only-this', retentionDays: 7, purgeBatchSize: 100 },
    ];
    const store = createMockStore({ 'only-this': [50] });
    const service = createRetentionService({ store, policies: customPolicies });

    const result = await service.purgeExpired();
    expect(store.purgeExpired).toHaveBeenCalledTimes(1);
    expect(result.domains).toEqual({ 'only-this': 50 });
  });
});
