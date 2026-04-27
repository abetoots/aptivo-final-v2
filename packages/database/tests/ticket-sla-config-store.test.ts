/**
 * S17-CT-2: ticket SLA config store adapter tests
 * @task S17-CT-2
 *
 * Verifies the chained-mock CRUD shape; numeric column coercion;
 * ON CONFLICT upsert path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleTicketSlaConfigStore } from '../src/adapters/ticket-sla-config-store-drizzle.js';

describe('S17-CT-2: createDrizzleTicketSlaConfigStore', () => {
  let returningRows: Array<Record<string, unknown>>;
  let selectRows: Array<Record<string, unknown>>;
  let valuesSpy: ReturnType<typeof vi.fn>;
  let onConflictSpy: ReturnType<typeof vi.fn>;
  let mockDb: Parameters<typeof createDrizzleTicketSlaConfigStore>[0];

  beforeEach(() => {
    returningRows = [];
    selectRows = [];

    const returningFn = vi.fn().mockImplementation(() => Promise.resolve(returningRows));
    onConflictSpy = vi.fn().mockReturnValue({ returning: returningFn });
    valuesSpy = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictSpy });

    const limitFn = vi.fn().mockImplementation(() => Promise.resolve(selectRows));
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(selectRows), { where: whereFn }),
    );

    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
      select: vi.fn().mockReturnValue({ from: fromFn }),
    } as unknown as Parameters<typeof createDrizzleTicketSlaConfigStore>[0];
  });

  it('list() coerces numeric columns to JS numbers', async () => {
    selectRows = [
      { priority: 'high', resolveMinutes: 60, warningThresholdPct: '0.800', updatedAt: new Date() },
      { priority: 'medium', resolveMinutes: 240, warningThresholdPct: '0.750', updatedAt: new Date() },
    ];
    const store = createDrizzleTicketSlaConfigStore(mockDb);
    const out = await store.list();
    expect(out).toHaveLength(2);
    expect(out[0]!.warningThresholdPct).toBe(0.8);
    expect(out[1]!.warningThresholdPct).toBe(0.75);
  });

  it('get() returns null when no row matches', async () => {
    selectRows = [];
    const store = createDrizzleTicketSlaConfigStore(mockDb);
    const out = await store.get('critical');
    expect(out).toBeNull();
  });

  it('upsert() inserts with ON CONFLICT DO UPDATE on (priority)', async () => {
    returningRows = [{
      priority: 'high',
      resolveMinutes: 30,
      warningThresholdPct: '0.900',
      updatedAt: new Date(),
    }];
    const store = createDrizzleTicketSlaConfigStore(mockDb);
    const out = await store.upsert({
      priority: 'high',
      resolveMinutes: 30,
      warningThresholdPct: 0.9,
    });

    expect(valuesSpy).toHaveBeenCalledWith({
      priority: 'high',
      resolveMinutes: 30,
      warningThresholdPct: '0.9',
    });
    expect(onConflictSpy).toHaveBeenCalledOnce();
    expect(out.warningThresholdPct).toBe(0.9);
    expect(out.resolveMinutes).toBe(30);
  });

  it('upsert() defaults warningThresholdPct to 0.8 when omitted', async () => {
    returningRows = [{
      priority: 'low',
      resolveMinutes: 1440,
      warningThresholdPct: '0.800',
      updatedAt: new Date(),
    }];
    const store = createDrizzleTicketSlaConfigStore(mockDb);
    await store.upsert({ priority: 'low', resolveMinutes: 1440 });
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ warningThresholdPct: '0.8' }),
    );
  });

  it('upsert() throws when .returning() yields no rows', async () => {
    returningRows = [];
    const store = createDrizzleTicketSlaConfigStore(mockDb);
    await expect(
      store.upsert({ priority: 'medium', resolveMinutes: 60 }),
    ).rejects.toThrow(/upsert returned no rows/);
  });
});
