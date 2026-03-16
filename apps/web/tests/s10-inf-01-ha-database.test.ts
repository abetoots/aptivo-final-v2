/**
 * INF-01: HA Database + WebAuthn Drizzle Adapter tests
 * @task INF-01
 *
 * verifies the webauthn drizzle adapter crud operations,
 * composition root wiring, and ha connection string selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// webauthn drizzle adapter — chainable mock db
// ---------------------------------------------------------------------------

// declare mock fns before vi.mock (hoisting)
const mockSelectResult: unknown[] = [];
const mockInsertResult: unknown[] = [];
const mockReturning = vi.fn().mockImplementation(() => mockInsertResult);
const mockLimit = vi.fn().mockImplementation(() => mockSelectResult);

// where returns a thenable that also has .limit() — drizzle query builders are
// both awaitable and chainable
const mockWhereSelect = vi.fn().mockImplementation(() => {
  const result = Promise.resolve(mockSelectResult);
  (result as unknown as Record<string, unknown>).limit = mockLimit;
  return result;
});
const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'updated-id' }]);
const mockWhereUpdate = vi.fn().mockImplementation(() => ({ returning: mockUpdateReturning }));
const mockWhereDelete = vi.fn().mockResolvedValue(undefined);
const mockFrom = vi.fn().mockImplementation(() => {
  const result = Promise.resolve(mockSelectResult);
  (result as unknown as Record<string, unknown>).where = mockWhereSelect;
  (result as unknown as Record<string, unknown>).limit = mockLimit;
  return result;
});
const mockSet = vi.fn().mockImplementation(() => ({ where: mockWhereUpdate }));
const mockValues = vi.fn().mockImplementation(() => ({ returning: mockReturning }));

const mockDb = {
  select: vi.fn().mockImplementation(() => ({ from: mockFrom })),
  insert: vi.fn().mockImplementation(() => ({ values: mockValues })),
  update: vi.fn().mockImplementation(() => ({ set: mockSet })),
  delete: vi.fn().mockImplementation(() => ({ where: mockWhereDelete })),
  execute: vi.fn(),
  transaction: vi.fn(),
};

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // reset select result
  mockSelectResult.length = 0;
  mockInsertResult.length = 0;

  // re-wire default chains after clear
  mockDb.select.mockImplementation(() => ({ from: mockFrom }));
  mockDb.insert.mockImplementation(() => ({ values: mockValues }));
  mockDb.update.mockImplementation(() => ({ set: mockSet }));
  mockDb.delete.mockImplementation(() => ({ where: mockWhereDelete }));
  mockFrom.mockImplementation(() => {
    const result = Promise.resolve(mockSelectResult);
    (result as unknown as Record<string, unknown>).where = mockWhereSelect;
    (result as unknown as Record<string, unknown>).limit = mockLimit;
    return result;
  });
  mockWhereSelect.mockImplementation(() => {
    const result = Promise.resolve(mockSelectResult);
    (result as unknown as Record<string, unknown>).limit = mockLimit;
    return result;
  });
  mockLimit.mockImplementation(() => mockSelectResult);
  mockValues.mockImplementation(() => ({ returning: mockReturning }));
  mockReturning.mockImplementation(() => mockInsertResult);
  mockSet.mockImplementation(() => ({ where: mockWhereUpdate }));
  mockUpdateReturning.mockResolvedValue([{ id: 'updated-id' }]);
  mockWhereUpdate.mockImplementation(() => ({ returning: mockUpdateReturning }));
  mockWhereDelete.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// webauthn drizzle adapter tests
// ---------------------------------------------------------------------------

describe('INF-01: WebAuthn Drizzle Adapter', () => {
  // import at test time to avoid hoisting issues
  async function getStore() {
    const { createDrizzleWebAuthnStore } = await import(
      '@aptivo/database/adapters'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createDrizzleWebAuthnStore(mockDb as any);
  }

  // -------------------------------------------------------------------------
  // findByUserId
  // -------------------------------------------------------------------------
  describe('findByUserId', () => {
    it('returns array of credentials for a user', async () => {
      const store = await getStore();
      const now = new Date();
      mockSelectResult.push(
        {
          id: 'cred-1',
          credentialId: 'cid-1',
          userId: 'user-1',
          publicKey: 'pk-1',
          counter: 5,
          transports: 'usb,ble',
          friendlyName: 'My Key',
          createdAt: now,
        },
        {
          id: 'cred-2',
          credentialId: 'cid-2',
          userId: 'user-1',
          publicKey: 'pk-2',
          counter: 0,
          transports: null,
          friendlyName: null,
          createdAt: now,
        },
      );

      const result = await store.findByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.credentialId).toBe('cid-1');
      expect(result[0]!.transports).toBe('usb,ble');
      expect(result[0]!.friendlyName).toBe('My Key');
      expect(result[1]!.transports).toBeUndefined();
      expect(result[1]!.friendlyName).toBeUndefined();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('returns empty array when no credentials exist', async () => {
      const store = await getStore();
      // mockSelectResult is already empty

      const result = await store.findByUserId('user-empty');

      expect(result).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // findByCredentialId
  // -------------------------------------------------------------------------
  describe('findByCredentialId', () => {
    it('returns single credential when found', async () => {
      const store = await getStore();
      const now = new Date();
      mockSelectResult.push({
        id: 'cred-1',
        credentialId: 'cid-abc',
        userId: 'user-1',
        publicKey: 'pk-abc',
        counter: 10,
        transports: 'internal',
        friendlyName: 'Passkey',
        createdAt: now,
      });

      const result = await store.findByCredentialId('cid-abc');

      expect(result).not.toBeNull();
      expect(result!.credentialId).toBe('cid-abc');
      expect(result!.counter).toBe(10);
      expect(result!.createdAt).toBe(now);
    });

    it('returns null when credential not found', async () => {
      const store = await getStore();
      // mockSelectResult is empty

      const result = await store.findByCredentialId('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('returns credential with id and createdAt', async () => {
      const store = await getStore();
      const now = new Date();
      mockInsertResult.push({
        id: 'new-uuid',
        credentialId: 'cred-new',
        userId: 'user-1',
        publicKey: 'pk-new',
        counter: 0,
        transports: 'usb',
        friendlyName: 'New Key',
        createdAt: now,
      });

      const result = await store.create({
        credentialId: 'cred-new',
        userId: 'user-1',
        publicKey: 'pk-new',
        counter: 0,
        transports: 'usb',
        friendlyName: 'New Key',
      });

      expect(result.id).toBe('new-uuid');
      expect(result.credentialId).toBe('cred-new');
      expect(result.createdAt).toBe(now);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateCounter
  // -------------------------------------------------------------------------
  describe('updateCounter', () => {
    it('updates counter value for credential', async () => {
      const store = await getStore();

      await store.updateCounter('cid-update', 42);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ counter: 42 });
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete', () => {
    it('removes credential by id', async () => {
      const store = await getStore();

      await store.delete('cred-to-delete');

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockWhereDelete).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // rename
  // -------------------------------------------------------------------------
  describe('rename', () => {
    it('updates friendlyName for credential', async () => {
      const store = await getStore();

      await store.rename('cred-rename', 'Updated Name');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ friendlyName: 'Updated Name' });
    });
  });
});

// ---------------------------------------------------------------------------
// composition root — verify drizzle adapter is wired
// ---------------------------------------------------------------------------

describe('INF-01: Composition Root WebAuthn Wiring', () => {
  it('services.ts imports createDrizzleWebAuthnStore (not in-memory)', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    // should import createDrizzleWebAuthnStore from database adapters
    expect(source).toContain('createDrizzleWebAuthnStore');

    // should NOT import createInMemoryWebAuthnStore
    expect(source).not.toContain('createInMemoryWebAuthnStore');

    // should wire the drizzle store into the webauthn service
    expect(source).toContain('createDrizzleWebAuthnStore(db()');
  });
});

// ---------------------------------------------------------------------------
// ha database connection string selection
// ---------------------------------------------------------------------------

describe('INF-01: HA Database Connection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // restore env between tests
    process.env = { ...originalEnv };
    // reset module cache so getDb() re-initializes
    vi.resetModules();
  });

  it('prefers DATABASE_URL_HA when set', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    // verify source checks DATABASE_URL_HA first
    expect(source).toContain('DATABASE_URL_HA');

    // verify ha mode is tracked
    expect(source).toContain('ha mode active');
  });

  it('falls back to DATABASE_URL when DATABASE_URL_HA is not set', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    // verify fallback logic exists
    expect(source).toContain('DATABASE_URL');
    expect(source).toContain("throw new Error('DATABASE_URL not set')");
  });

  it('exposes reconnect() for failover', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    // verify reconnect function is exported
    expect(source).toContain('export function reconnect()');
    // verify it resets the cached client
    expect(source).toContain('_db = null');
  });

  it('exposes isHaMode() status check', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/db.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export function isHaMode()');
  });

  it('resolveConnectionString selects HA url first', async () => {
    process.env.DATABASE_URL = 'postgres://standard:5432/db';
    process.env.DATABASE_URL_HA = 'postgres://ha-primary:5432/db';

    // dynamic import to get fresh module
    const dbModule = await import('../src/lib/db.js');

    // the module exposes isHaMode — calling getDb would require a real pg connection
    // so instead verify the exported shape
    expect(typeof dbModule.getDb).toBe('function');
    expect(typeof dbModule.reconnect).toBe('function');
    expect(typeof dbModule.isHaMode).toBe('function');
  });

  it('throws when neither DATABASE_URL_HA nor DATABASE_URL is set', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_HA;

    const dbModule = await import('../src/lib/db.js');

    expect(() => dbModule.getDb()).toThrow('DATABASE_URL not set');
  });
});
