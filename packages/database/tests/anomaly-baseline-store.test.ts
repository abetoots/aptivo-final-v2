/**
 * S17-B3: anomaly baseline store adapter tests
 * @task S17-B3
 *
 * Verifies the Drizzle adapter's CRUD shape against a chained-mock
 * client. The actual Postgres `ON CONFLICT … DO UPDATE` semantics
 * are covered by the integration tests in this package's `int-w1`
 * suite (which run against pglite when available).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleAnomalyBaselineStore } from '../src/adapters/anomaly-baseline-store-drizzle.js';

describe('S17-B3: createDrizzleAnomalyBaselineStore', () => {
  let selectRows: Array<Record<string, unknown>>;
  let onConflictDoUpdateSpy: ReturnType<typeof vi.fn>;
  let valuesSpy: ReturnType<typeof vi.fn>;
  let mockDb: Parameters<typeof createDrizzleAnomalyBaselineStore>[0];

  beforeEach(() => {
    selectRows = [];
    onConflictDoUpdateSpy = vi.fn().mockResolvedValue(undefined);
    valuesSpy = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateSpy });

    // chained drizzle builder mock: select.from.where.limit returns selectRows
    const limitFn = vi.fn().mockImplementation(() => Promise.resolve(selectRows));
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockImplementation((cols?: unknown) => {
      // when called with a column projection (latestComputedAt path), return a thenable
      if (cols !== undefined) {
        return { from: vi.fn().mockReturnValue(Promise.resolve(selectRows)) };
      }
      return { from: fromFn };
    });

    mockDb = {
      select: selectFn,
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    } as unknown as Parameters<typeof createDrizzleAnomalyBaselineStore>[0];
  });

  it('findBaseline returns null when no row matches', async () => {
    selectRows = [];
    const store = createDrizzleAnomalyBaselineStore(mockDb);
    const result = await store.findBaseline('user-1', 'candidate,employee');
    expect(result).toBeNull();
  });

  it('findBaseline coerces numeric columns from string back to number', async () => {
    // drizzle's pg adapter returns numeric columns as strings; the store coerces
    selectRows = [{
      actorId: 'user-1',
      resourceType: 'candidate,employee',
      mean: '4.2500',
      stdDev: '1.3000',
      sampleSize: 100,
      computedAt: new Date('2026-04-23T00:00:00Z'),
    }];
    const store = createDrizzleAnomalyBaselineStore(mockDb);

    const result = await store.findBaseline('user-1', 'candidate,employee');
    expect(result).toEqual({
      actorId: 'user-1',
      resourceType: 'candidate,employee',
      mean: 4.25,
      stdDev: 1.3,
      sampleSize: 100,
      computedAt: new Date('2026-04-23T00:00:00Z'),
    });
  });

  it('upsertBaseline inserts with ON CONFLICT DO UPDATE on (actor_id, resource_type)', async () => {
    const store = createDrizzleAnomalyBaselineStore(mockDb);
    await store.upsertBaseline({
      actorId: 'user-7',
      resourceType: 'trade-signal,trade-execution',
      mean: 6.1,
      stdDev: 2.4,
      sampleSize: 200,
    });

    expect(valuesSpy).toHaveBeenCalledWith({
      actorId: 'user-7',
      resourceType: 'trade-signal,trade-execution',
      mean: '6.1',
      stdDev: '2.4',
      sampleSize: 200,
    });
    expect(onConflictDoUpdateSpy).toHaveBeenCalledOnce();
    const [arg] = onConflictDoUpdateSpy.mock.calls[0];
    expect(arg.target).toHaveLength(2); // [anomalyBaselines.actorId, anomalyBaselines.resourceType]
    expect(arg.set).toMatchObject({
      mean: '6.1',
      stdDev: '2.4',
      sampleSize: 200,
    });
  });

  it('latestComputedAt returns the most recent timestamp or null', async () => {
    selectRows = [{ latest: new Date('2026-04-23T06:00:00Z') }];
    const store = createDrizzleAnomalyBaselineStore(mockDb);
    const result = await store.latestComputedAt();
    expect(result).toEqual(new Date('2026-04-23T06:00:00Z'));
  });
});
