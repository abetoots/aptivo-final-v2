/**
 * S17-CT-1: ticket store adapter tests
 * @task S17-CT-1
 *
 * Verifies the Drizzle adapter against a chained-mock client. The
 * actual Postgres semantics are covered by the integration suite
 * (int-w1) — this file checks the .returning() / .where() composition.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleTicketStore } from '../src/adapters/ticket-store-drizzle.js';

describe('S17-CT-1: createDrizzleTicketStore', () => {
  let returningRows: Array<Record<string, unknown>>;
  let selectRows: Array<Record<string, unknown>>;
  let countRows: Array<{ value: number }>;

  let mockDb: Parameters<typeof createDrizzleTicketStore>[0];

  beforeEach(() => {
    returningRows = [];
    selectRows = [];
    countRows = [{ value: 0 }];

    const returningFn = vi.fn().mockImplementation(() => Promise.resolve(returningRows));
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setWhereReturning = vi.fn().mockImplementation(() => Promise.resolve(returningRows));
    const setWhere = vi.fn().mockReturnValue({ returning: setWhereReturning });
    const setFn = vi.fn().mockReturnValue({ where: setWhere });

    const offsetFn = vi.fn().mockImplementation(() => Promise.resolve(selectRows));
    const limitFn = vi.fn().mockImplementation(() => {
      const result = Promise.resolve(selectRows) as Promise<unknown> & { offset?: typeof offsetFn };
      result.offset = offsetFn;
      return result;
    });
    const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
    const whereFn = vi.fn().mockImplementation(() => ({
      limit: limitFn,
      orderBy: orderByFn,
    }));
    const fromFn = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(countRows), {
        where: whereFn,
        orderBy: orderByFn,
      }),
    );
    const selectFn = vi.fn().mockImplementation((projection?: unknown) => {
      if (projection !== undefined) {
        return {
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => Promise.resolve(countRows)),
          })),
        };
      }
      return { from: fromFn };
    });

    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesFn }),
      update: vi.fn().mockReturnValue({ set: setFn }),
      select: selectFn,
    } as unknown as Parameters<typeof createDrizzleTicketStore>[0];
  });

  it('create() inserts and returns the persisted row', async () => {
    returningRows = [{
      id: 'tkt-1',
      workflowDefinitionId: null,
      status: 'open',
      priority: 'medium',
      title: 't',
      body: 'b',
      ownerUserId: 'u-1',
      departmentId: null,
      createdAt: new Date('2026-04-26T10:00:00Z'),
      updatedAt: new Date('2026-04-26T10:00:00Z'),
      closedAt: null,
    }];
    const store = createDrizzleTicketStore(mockDb);
    const result = await store.create({
      title: 't',
      body: 'b',
      ownerUserId: 'u-1',
    });
    expect(result.id).toBe('tkt-1');
    expect(result.status).toBe('open');
    expect(result.priority).toBe('medium');
  });

  it('create() throws when .returning() yields no rows', async () => {
    returningRows = [];
    const store = createDrizzleTicketStore(mockDb);
    await expect(
      store.create({ title: 't', body: 'b', ownerUserId: 'u-1' }),
    ).rejects.toThrow(/insert returned no rows/);
  });

  it('findById() returns null on empty result', async () => {
    selectRows = [];
    const store = createDrizzleTicketStore(mockDb);
    const result = await store.findById('missing');
    expect(result).toBeNull();
  });

  it('softClose() returns null when the row does not exist', async () => {
    returningRows = [];
    const store = createDrizzleTicketStore(mockDb);
    const result = await store.softClose('missing');
    expect(result).toBeNull();
  });

  it('softClose() returns the closed record on hit', async () => {
    returningRows = [{
      id: 'tkt-1',
      workflowDefinitionId: null,
      status: 'closed',
      priority: 'medium',
      title: 't',
      body: 'b',
      ownerUserId: 'u-1',
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: new Date('2026-04-26T11:00:00Z'),
    }];
    const store = createDrizzleTicketStore(mockDb);
    const result = await store.softClose('tkt-1');
    expect(result?.status).toBe('closed');
    expect(result?.closedAt).toBeInstanceOf(Date);
  });

  it('update() returns the existing record (no-op) when patch is empty', async () => {
    selectRows = [{
      id: 'tkt-1',
      workflowDefinitionId: null,
      status: 'open',
      priority: 'medium',
      title: 't',
      body: 'b',
      ownerUserId: 'u-1',
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    }];
    const store = createDrizzleTicketStore(mockDb);
    const result = await store.update('tkt-1', {});
    expect(result?.id).toBe('tkt-1');
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
