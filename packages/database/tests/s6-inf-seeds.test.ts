/**
 * S6-INF-SEED: domain seed tests
 * @task S6-INF-SEED
 *
 * tests:
 * - seedCryptoRoles inserts 16 role-permission pairs
 * - seedHrRoles inserts 18 role-permission pairs
 * - seedCryptoTemplates inserts 2 templates
 * - seedHrTemplates inserts 2 templates
 * - seedCryptoMcpServers inserts 1 server
 * - seedHrMcpServers inserts 2 servers
 * - running seed twice does not throw (idempotent)
 * - seedAllCrypto calls all 3 crypto seed functions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  seedCryptoRoles,
  seedCryptoTemplates,
  seedCryptoMcpServers,
  seedAllCrypto,
  CRYPTO_PERMISSIONS,
  CRYPTO_TEMPLATES,
  CRYPTO_MCP_SERVERS,
} from '../src/seeds/crypto-seeds.js';
import {
  seedHrRoles,
  seedHrTemplates,
  seedHrMcpServers,
  seedAllHr,
  HR_PERMISSIONS,
  HR_TEMPLATES,
  HR_MCP_SERVERS,
} from '../src/seeds/hr-seeds.js';
import type { DrizzleClient } from '../src/adapters/types.js';

// ---------------------------------------------------------------------------
// helpers — chainable mock db that tracks inserts
// ---------------------------------------------------------------------------

interface MockDb extends DrizzleClient {
  _insertedValues: Record<string, unknown>[];
  _insertedTables: unknown[];
}

function createMockDb(): MockDb {
  const insertedValues: Record<string, unknown>[] = [];
  const insertedTables: unknown[] = [];

  const db: MockDb = {
    _insertedValues: insertedValues,
    _insertedTables: insertedTables,
    select: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
    insert(table: unknown) {
      insertedTables.push(table);
      return {
        values(row: Record<string, unknown>) {
          insertedValues.push(row);
          return {
            onConflictDoNothing() {
              return Promise.resolve(undefined);
            },
            onConflictDoUpdate() {
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };

  return db;
}

// ---------------------------------------------------------------------------
// crypto seed tests
// ---------------------------------------------------------------------------

describe('seedCryptoRoles', () => {
  it('inserts all 16 crypto role-permission pairs', async () => {
    const db = createMockDb();

    const result = await seedCryptoRoles(db);

    expect(result.insertedCount).toBe(16);
    expect(db._insertedValues).toHaveLength(16);
    expect(CRYPTO_PERMISSIONS).toHaveLength(16);
  });

  it('inserts correct permissions for trader role', async () => {
    const db = createMockDb();

    await seedCryptoRoles(db);

    const traderPerms = db._insertedValues.filter((v) => v.role === 'trader');
    expect(traderPerms).toHaveLength(6);

    const permNames = traderPerms.map((v) => v.permission);
    expect(permNames).toContain('crypto/signal.create');
    expect(permNames).toContain('crypto/trade.execute');
    expect(permNames).toContain('crypto/portfolio.view');
  });

  it('inserts correct permissions for risk-manager role', async () => {
    const db = createMockDb();

    await seedCryptoRoles(db);

    const riskPerms = db._insertedValues.filter((v) => v.role === 'risk-manager');
    expect(riskPerms).toHaveLength(6);

    const permNames = riskPerms.map((v) => v.permission);
    expect(permNames).toContain('crypto/trade.pause');
    expect(permNames).toContain('crypto/wallet.manage');
  });
});

describe('seedCryptoTemplates', () => {
  it('inserts 2 crypto notification templates', async () => {
    const db = createMockDb();

    const result = await seedCryptoTemplates(db);

    expect(result.insertedCount).toBe(2);
    expect(db._insertedValues).toHaveLength(2);
    expect(CRYPTO_TEMPLATES).toHaveLength(2);
  });

  it('inserts templates with correct domain and slug', async () => {
    const db = createMockDb();

    await seedCryptoTemplates(db);

    const slugs = db._insertedValues.map((v) => v.slug);
    expect(slugs).toContain('crypto-trade-alert');
    expect(slugs).toContain('crypto-signal-approval');

    // all templates have domain set to 'crypto'
    for (const val of db._insertedValues) {
      expect(val.domain).toBe('crypto');
    }
  });
});

describe('seedCryptoMcpServers', () => {
  it('inserts 1 crypto mcp server', async () => {
    const db = createMockDb();

    const result = await seedCryptoMcpServers(db);

    expect(result.insertedCount).toBe(1);
    expect(db._insertedValues).toHaveLength(1);
    expect(CRYPTO_MCP_SERVERS).toHaveLength(1);
  });

  it('inserts dexscreener server with correct fields', async () => {
    const db = createMockDb();

    await seedCryptoMcpServers(db);

    expect(db._insertedValues[0]).toMatchObject({
      name: 'dexscreener',
      transport: 'http',
      isEnabled: true,
    });
  });
});

describe('seedAllCrypto', () => {
  it('calls all 3 crypto seed functions', async () => {
    const db = createMockDb();

    await seedAllCrypto(db);

    // 16 permissions + 2 templates + 1 server = 19 inserts
    expect(db._insertedValues).toHaveLength(19);
  });
});

// ---------------------------------------------------------------------------
// hr seed tests
// ---------------------------------------------------------------------------

describe('seedHrRoles', () => {
  it('inserts all 25 hr role-permission pairs (was 18; +6 export+contract+employee, +2 onboarding in S18-B2)', async () => {
    const db = createMockDb();

    const result = await seedHrRoles(db);

    expect(result.insertedCount).toBe(25);
    expect(db._insertedValues).toHaveLength(25);
    expect(HR_PERMISSIONS).toHaveLength(25);
  });

  it('inserts correct permissions for recruiter role (14 — +6 from S18-B2)', async () => {
    const db = createMockDb();

    await seedHrRoles(db);

    const recruiterPerms = db._insertedValues.filter((v) => v.role === 'recruiter');
    expect(recruiterPerms).toHaveLength(14);

    const permNames = recruiterPerms.map((v) => v.permission);
    expect(permNames).toContain('hr/candidate.create');
    expect(permNames).toContain('hr/interview.create');
    expect(permNames).toContain('hr/offer.create');
  });

  it('inserts correct permissions for hiring-manager role (6 — +1 hr/onboarding.view in S18-B2)', async () => {
    const db = createMockDb();

    await seedHrRoles(db);

    const hmPerms = db._insertedValues.filter((v) => v.role === 'hiring-manager');
    expect(hmPerms).toHaveLength(6);

    const permNames = hmPerms.map((v) => v.permission);
    expect(permNames).toContain('hr/offer.approve');
    expect(permNames).toContain('hr/offer.view');
    expect(permNames).toContain('hr/onboarding.view');
  });

  it('inserts correct permissions for interviewer role', async () => {
    const db = createMockDb();

    await seedHrRoles(db);

    const interviewerPerms = db._insertedValues.filter((v) => v.role === 'interviewer');
    expect(interviewerPerms).toHaveLength(3);

    const permNames = interviewerPerms.map((v) => v.permission);
    expect(permNames).toContain('hr/feedback.submit');
  });

  it('inserts correct permissions for client-user role', async () => {
    const db = createMockDb();

    await seedHrRoles(db);

    const clientPerms = db._insertedValues.filter((v) => v.role === 'client-user');
    expect(clientPerms).toHaveLength(2);
  });
});

describe('seedHrTemplates', () => {
  it('inserts 4 hr notification templates', async () => {
    const db = createMockDb();

    const result = await seedHrTemplates(db);

    expect(result.insertedCount).toBe(4);
    expect(db._insertedValues).toHaveLength(4);
    expect(HR_TEMPLATES).toHaveLength(4);
  });

  it('inserts templates with correct domain and slug', async () => {
    const db = createMockDb();

    await seedHrTemplates(db);

    const slugs = db._insertedValues.map((v) => v.slug);
    expect(slugs).toContain('hr-interview-scheduled');
    expect(slugs).toContain('hr-offer-approval');
    expect(slugs).toContain('hr-consent-request');
    expect(slugs).toContain('hr-new-application');

    // all templates have domain set to 'hr'
    for (const val of db._insertedValues) {
      expect(val.domain).toBe('hr');
    }
  });
});

describe('seedHrMcpServers', () => {
  it('inserts 2 hr mcp servers', async () => {
    const db = createMockDb();

    const result = await seedHrMcpServers(db);

    expect(result.insertedCount).toBe(2);
    expect(db._insertedValues).toHaveLength(2);
    expect(HR_MCP_SERVERS).toHaveLength(2);
  });

  it('inserts gmail-connector and google-calendar servers', async () => {
    const db = createMockDb();

    await seedHrMcpServers(db);

    const names = db._insertedValues.map((v) => v.name);
    expect(names).toContain('gmail-connector');
    expect(names).toContain('google-calendar');
  });
});

describe('seedAllHr', () => {
  it('calls all 3 hr seed functions', async () => {
    const db = createMockDb();

    await seedAllHr(db);

    // 25 permissions + 4 templates + 2 servers = 31 inserts (was 23+4+2=29
    // before S18-B2 slice 5 added hr/onboarding.view to recruiter +
    // hiring-manager)
    expect(db._insertedValues).toHaveLength(31);
  });
});

// ---------------------------------------------------------------------------
// idempotency tests
// ---------------------------------------------------------------------------

describe('seed idempotency', () => {
  it('running crypto seeds twice does not throw', async () => {
    const db = createMockDb();

    await seedAllCrypto(db);
    await seedAllCrypto(db);

    // 19 * 2 = 38 total inserts (onConflictDoNothing handles duplicates)
    expect(db._insertedValues).toHaveLength(38);
  });

  it('running hr seeds twice does not throw', async () => {
    const db = createMockDb();

    await seedAllHr(db);
    await seedAllHr(db);

    // 31 * 2 = 62 total inserts (onConflictDoNothing handles duplicates)
    expect(db._insertedValues).toHaveLength(62);
  });
});
