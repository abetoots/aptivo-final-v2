/**
 * INT-W2: Notification Drizzle adapter tests
 * @task INT-W2
 *
 * tests:
 * - isOptedOut returns false for unknown user (empty query result)
 * - setOptOut(userId, channel, true) then isOptedOut returns true
 * - findBySlug('slug') returns latest active version (version omitted)
 * - findBySlug('slug', 2) returns exact version
 * - findBySlug returns null for non-existent slug
 * - record() persists delivery log with correct field mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzlePreferenceStore } from '../src/adapters/notification-preference-drizzle.js';
import { createDrizzleDeliveryLogStore } from '../src/adapters/delivery-log-drizzle.js';
import { createDrizzleTemplateStore } from '../src/adapters/template-store-drizzle.js';
import type { DrizzleClient } from '../src/adapters/types.js';
import type { DeliveryLogEntry } from '@aptivo/notifications';

// ---------------------------------------------------------------------------
// helpers — chainable mock db builders
// ---------------------------------------------------------------------------

function createMockPreferenceDb(rows: Record<string, unknown>[] = []): DrizzleClient & { _insertedValues: Record<string, unknown>[]; _upsertSets: Record<string, unknown>[] } {
  const insertedValues: Record<string, unknown>[] = [];
  const upsertSets: Record<string, unknown>[] = [];

  const db = {
    _insertedValues: insertedValues,
    _upsertSets: upsertSets,
    select() {
      return {
        from(_table: unknown) {
          return {
            where(_condition: unknown) {
              return Promise.resolve(rows);
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          insertedValues.push(row);
          return {
            onConflictDoUpdate(opts: { target: unknown[]; set: Record<string, unknown> }) {
              upsertSets.push(opts.set);
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };

  return db as DrizzleClient & { _insertedValues: Record<string, unknown>[]; _upsertSets: Record<string, unknown>[] };
}

function createMockDeliveryLogDb(): DrizzleClient & { _insertedValues: Record<string, unknown>[] } {
  const insertedValues: Record<string, unknown>[] = [];

  return {
    _insertedValues: insertedValues,
    insert(_table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          insertedValues.push(row);
          return Promise.resolve(undefined);
        },
      };
    },
  };
}

function createMockTemplateDb(rows: Record<string, unknown>[] = []): DrizzleClient {
  return {
    select() {
      return {
        from(_table: unknown) {
          return {
            where(_condition: unknown) {
              return {
                orderBy(_expr: unknown) {
                  return {
                    limit(_n: number) {
                      return Promise.resolve(rows);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// sample template row (as returned by drizzle from DB)
// ---------------------------------------------------------------------------

function sampleTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl-001',
    slug: 'welcome',
    name: 'Welcome Email',
    domain: 'onboarding',
    version: 3,
    isActive: true,
    emailTemplate: { subject: 'Hello {{name}}', body: 'Welcome!' },
    telegramTemplate: null,
    pushTemplate: null,
    variableSchema: { name: { type: 'string' } },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// preference store tests
// ---------------------------------------------------------------------------

describe('createDrizzlePreferenceStore', () => {
  it('isOptedOut returns false for unknown user (empty query result)', async () => {
    const db = createMockPreferenceDb([]);
    const store = createDrizzlePreferenceStore(db);

    const result = await store.isOptedOut('user-unknown', 'email');

    expect(result).toBe(false);
  });

  it('isOptedOut returns true when user has opted out', async () => {
    const db = createMockPreferenceDb([
      { id: 'pref-1', userId: 'user-1', channel: 'email', optedOut: true, updatedAt: new Date() },
    ]);
    const store = createDrizzlePreferenceStore(db);

    const result = await store.isOptedOut('user-1', 'email');

    expect(result).toBe(true);
  });

  it('isOptedOut returns false when user has not opted out', async () => {
    const db = createMockPreferenceDb([
      { id: 'pref-1', userId: 'user-1', channel: 'email', optedOut: false, updatedAt: new Date() },
    ]);
    const store = createDrizzlePreferenceStore(db);

    const result = await store.isOptedOut('user-1', 'email');

    expect(result).toBe(false);
  });

  it('setOptOut inserts with correct values for upsert', async () => {
    const db = createMockPreferenceDb([]);
    const store = createDrizzlePreferenceStore(db);

    await store.setOptOut('user-1', 'telegram', true);

    expect(db._insertedValues).toHaveLength(1);
    expect(db._insertedValues[0]).toEqual({
      userId: 'user-1',
      channel: 'telegram',
      optedOut: true,
    });

    // conflict update set includes optedOut and updatedAt
    expect(db._upsertSets).toHaveLength(1);
    expect(db._upsertSets[0]!.optedOut).toBe(true);
    expect(db._upsertSets[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it('setOptOut with false clears opt-out', async () => {
    const db = createMockPreferenceDb([]);
    const store = createDrizzlePreferenceStore(db);

    await store.setOptOut('user-1', 'email', false);

    expect(db._insertedValues[0]).toEqual({
      userId: 'user-1',
      channel: 'email',
      optedOut: false,
    });
    expect(db._upsertSets[0]!.optedOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// template store tests
// ---------------------------------------------------------------------------

describe('createDrizzleTemplateStore', () => {
  it('findBySlug returns latest active version when version omitted', async () => {
    const row = sampleTemplateRow({ version: 3 });
    const db = createMockTemplateDb([row]);
    const store = createDrizzleTemplateStore(db);

    const result = await store.findBySlug('welcome');

    expect(result).not.toBeNull();
    expect(result!.slug).toBe('welcome');
    expect(result!.version).toBe(3);
    expect(result!.name).toBe('Welcome Email');
    expect(result!.domain).toBe('onboarding');
    expect(result!.isActive).toBe(true);
    expect(result!.emailTemplate).toEqual({ subject: 'Hello {{name}}', body: 'Welcome!' });
    expect(result!.variableSchema).toEqual({ name: { type: 'string' } });
  });

  it('findBySlug returns exact version when version provided', async () => {
    const row = sampleTemplateRow({ version: 2 });
    const db = createMockTemplateDb([row]);
    const store = createDrizzleTemplateStore(db);

    const result = await store.findBySlug('welcome', 2);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
  });

  it('findBySlug returns null for non-existent slug', async () => {
    const db = createMockTemplateDb([]);
    const store = createDrizzleTemplateStore(db);

    const result = await store.findBySlug('non-existent');

    expect(result).toBeNull();
  });

  it('findBySlug strips id, createdAt, updatedAt from result', async () => {
    const row = sampleTemplateRow();
    const db = createMockTemplateDb([row]);
    const store = createDrizzleTemplateStore(db);

    const result = await store.findBySlug('welcome');

    expect(result).not.toBeNull();
    // these db-only fields should not be in the result
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
  });

  it('findBySlug maps null domain to undefined', async () => {
    const row = sampleTemplateRow({ domain: null });
    const db = createMockTemplateDb([row]);
    const store = createDrizzleTemplateStore(db);

    const result = await store.findBySlug('welcome');

    expect(result).not.toBeNull();
    expect(result!.domain).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// delivery log store tests
// ---------------------------------------------------------------------------

describe('createDrizzleDeliveryLogStore', () => {
  it('record() persists delivery log with correct field mapping', async () => {
    const db = createMockDeliveryLogDb();
    const store = createDrizzleDeliveryLogStore(db);

    const entry: DeliveryLogEntry = {
      recipientId: 'user-1',
      channel: 'email',
      templateSlug: 'welcome',
      transactionId: 'tx-123',
      status: 'delivered',
      attempt: 3,
      error: 'timeout on attempt 2',
      deliveredAt: new Date('2026-03-10T12:00:00Z'),
    };

    await store.record(entry);

    expect(db._insertedValues).toHaveLength(1);
    const inserted = db._insertedValues[0]!;

    // critical mapping: attempt (singular) -> attempts (plural)
    expect(inserted.attempts).toBe(3);
    expect(inserted).not.toHaveProperty('attempt');

    // critical mapping: error -> lastError
    expect(inserted.lastError).toBe('timeout on attempt 2');
    expect(inserted).not.toHaveProperty('error');

    // standard fields
    expect(inserted.recipientId).toBe('user-1');
    expect(inserted.channel).toBe('email');
    expect(inserted.templateSlug).toBe('welcome');
    expect(inserted.transactionId).toBe('tx-123');
    expect(inserted.status).toBe('delivered');
    expect(inserted.deliveredAt).toEqual(new Date('2026-03-10T12:00:00Z'));
  });

  it('record() maps missing optional fields to null', async () => {
    const db = createMockDeliveryLogDb();
    const store = createDrizzleDeliveryLogStore(db);

    const entry: DeliveryLogEntry = {
      recipientId: 'user-2',
      channel: 'telegram',
      templateSlug: 'alert',
      status: 'failed',
      attempt: 1,
    };

    await store.record(entry);

    const inserted = db._insertedValues[0]!;
    expect(inserted.transactionId).toBeNull();
    expect(inserted.lastError).toBeNull();
    expect(inserted.deliveredAt).toBeNull();
  });

  it('record() maps opted_out status correctly', async () => {
    const db = createMockDeliveryLogDb();
    const store = createDrizzleDeliveryLogStore(db);

    await store.record({
      recipientId: 'user-3',
      channel: 'push',
      templateSlug: 'promo',
      status: 'opted_out',
      attempt: 0,
    });

    expect(db._insertedValues[0]!.status).toBe('opted_out');
  });
});
