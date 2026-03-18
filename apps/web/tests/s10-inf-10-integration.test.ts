/**
 * INF-10: sprint 10 integration tests
 * @task INF-10
 *
 * cross-cutting validation of infrastructure hardening deliverables.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  createSessionLimitService,
  type SessionLimitService,
} from '../src/lib/auth/session-limit-service';
import { createTokenBlacklistService, type RedisClient } from '../src/lib/auth/token-blacklist';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** resolves a project-relative path from the apps/web root */
const webRoot = (...segments: string[]) => resolve(__dirname, '..', ...segments);

/** reads source file content from apps/web root */
function readSource(relativePath: string): string {
  return readFileSync(webRoot(relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// mock redis for session/blacklist integration
// ---------------------------------------------------------------------------

function createMockRedis(): RedisClient {
  const store = new Map<string, string>();
  return {
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async exists(...keys: string[]) {
      return keys.filter((k) => store.has(k)).length;
    },
    async del(...keys: string[]) {
      let c = 0;
      for (const k of keys) {
        if (store.delete(k)) c++;
      }
      return c;
    },
    async dbsize() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. webauthn persistence via drizzle adapter
// ---------------------------------------------------------------------------

describe('INF-10: WebAuthn Persistence via Drizzle Adapter', () => {
  it('createDrizzleWebAuthnStore is exported from @aptivo/database/adapters', async () => {
    const adapters = await import('@aptivo/database/adapters');
    expect(typeof adapters.createDrizzleWebAuthnStore).toBe('function');
  });

  // @testtype doc-lint
  it('services.ts imports createDrizzleWebAuthnStore (not in-memory)', () => {
    const source = readSource('src/lib/services.ts');

    // must import the drizzle adapter
    expect(source).toContain('createDrizzleWebAuthnStore');

    // must not use an in-memory store for webauthn
    expect(source).not.toContain('createInMemoryWebAuthnStore');

    // verify it's wired in the webauthn service factory
    expect(source).toContain('createDrizzleWebAuthnStore(db()');
  });
});

// ---------------------------------------------------------------------------
// 2. session eviction atomicity (shared redis)
// ---------------------------------------------------------------------------

describe('INF-10: Session Eviction Atomicity (shared Redis)', () => {
  let redis: RedisClient;
  let sessionService: SessionLimitService;

  beforeEach(() => {
    redis = createMockRedis();
    sessionService = createSessionLimitService({
      redis,
      config: { limits: { admin: 1, user: 3 }, defaultLimit: 3 },
    });
  });

  it('evicts oldest admin session when limit (1) is exceeded', async () => {
    // register first admin session
    const r1 = await sessionService.checkAndEvict('admin-1', 'admin', 'sess-a');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value).toHaveLength(0);

    // register second admin session — should evict the first
    const r2 = await sessionService.checkAndEvict('admin-1', 'admin', 'sess-b');
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value).toHaveLength(1);
      expect(r2.value[0]!.sessionId).toBe('sess-a');
    }
  });

  it('blacklists evicted session token via shared redis', async () => {
    // create token blacklist service on the same redis
    const blacklist = createTokenBlacklistService({ redis });

    // register 2 admin sessions (limit: 1) to cause eviction
    await sessionService.checkAndEvict('admin-1', 'admin', 'sess-a');
    const r = await sessionService.checkAndEvict('admin-1', 'admin', 'sess-b');
    expect(r.ok).toBe(true);

    // blacklist the evicted session's token
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    await blacklist.blacklist('sess-a', futureExp);

    // verify blacklist lookup returns true
    const result = await blacklist.isBlacklisted('sess-a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);

    // non-evicted session is not blacklisted
    const notBlacklisted = await blacklist.isBlacklisted('sess-b');
    expect(notBlacklisted.ok).toBe(true);
    if (notBlacklisted.ok) expect(notBlacklisted.value).toBe(false);
  });

  it('does not evict user sessions within limit (3)', async () => {
    const r1 = await sessionService.checkAndEvict('user-1', 'user', 'u-s1');
    const r2 = await sessionService.checkAndEvict('user-1', 'user', 'u-s2');
    const r3 = await sessionService.checkAndEvict('user-1', 'user', 'u-s3');

    expect(r1.ok && r1.value).toHaveLength(0);
    expect(r2.ok && r2.value).toHaveLength(0);
    expect(r3.ok && r3.value).toHaveLength(0);

    // fourth session should evict the oldest
    const r4 = await sessionService.checkAndEvict('user-1', 'user', 'u-s4');
    expect(r4.ok).toBe(true);
    if (r4.ok) {
      expect(r4.value).toHaveLength(1);
      expect(r4.value[0]!.sessionId).toBe('u-s1');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. admin routes use enhanced middleware
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-10: Admin Routes Use Enhanced Middleware', () => {
  const adminRoutes = [
    { name: 'admin/overview', path: 'src/app/api/admin/overview/route.ts' },
    { name: 'admin/audit', path: 'src/app/api/admin/audit/route.ts' },
    { name: 'admin/hitl', path: 'src/app/api/admin/hitl/route.ts' },
    { name: 'admin/llm-usage', path: 'src/app/api/admin/llm-usage/route.ts' },
    { name: 'admin/llm-usage/budget', path: 'src/app/api/admin/llm-usage/budget/route.ts' },
  ];

  for (const route of adminRoutes) {
    it(`${route.name} imports checkPermissionWithBlacklist`, () => {
      const source = readSource(route.path);
      expect(source).toContain('checkPermissionWithBlacklist');
      // must not import old checkPermission (only checkPermissionWithBlacklist)
      expect(source).not.toMatch(/import\s*\{[^}]*\bcheckPermission\b(?!WithBlacklist)[^}]*\}/);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. session routes wired to service
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-10: Session Routes Wired to Service', () => {
  it('GET /api/auth/sessions imports from @/lib/services.js', () => {
    const source = readSource('src/app/api/auth/sessions/route.ts');
    expect(source).toContain('@/lib/services.js');
    expect(source).toContain('getSessionLimitService');
  });

  it('DELETE /api/auth/sessions/:id imports from @/lib/services.js', () => {
    const source = readSource('src/app/api/auth/sessions/[id]/route.ts');
    expect(source).toContain('@/lib/services.js');
    expect(source).toContain('getSessionLimitService');
  });
});

// ---------------------------------------------------------------------------
// 5. secrets provider available in composition root
// ---------------------------------------------------------------------------

describe('INF-10: Secrets Provider in Composition Root', () => {
  // @testtype doc-lint
  it('services.ts exports getSecretsProvider', () => {
    const source = readSource('src/lib/services.ts');
    expect(source).toContain('export const getSecretsProvider');
    expect(source).toContain('createEnvSecretsProvider');
  });

  // @testtype doc-lint
  it('services.ts exports getMfaClient', () => {
    const source = readSource('src/lib/services.ts');
    expect(source).toContain('export const getMfaClient');
    expect(source).toContain('createMfaStubClient');
  });

  it('secrets-provider module exports createEnvSecretsProvider', async () => {
    const mod = await import('../src/lib/auth/secrets-provider');
    expect(typeof mod.createEnvSecretsProvider).toBe('function');
  });

  it('mfa-enforcement module exports createMfaStubClient', async () => {
    const mod = await import('../src/lib/auth/mfa-enforcement');
    expect(typeof mod.createMfaStubClient).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 6. redis split backward compatibility
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-10: Redis Split Backward Compatibility', () => {
  it('redis resolver prefers session-specific URL, falls back to shared', () => {
    const resolverSource = readSource('src/lib/redis/redis-resolver.ts');
    // verify the fallback chain exists in the extracted resolver
    expect(resolverSource).toContain('UPSTASH_REDIS_SESSION_URL');
    expect(resolverSource).toContain('UPSTASH_REDIS_URL');
    // the ?? operator does the fallback
    expect(resolverSource).toContain(
      'env.UPSTASH_REDIS_SESSION_URL ?? env.UPSTASH_REDIS_URL',
    );
    // services.ts delegates to the resolver
    const servicesSource = readSource('src/lib/services.ts');
    expect(servicesSource).toContain('resolveSessionRedisConfig');
  });

  it('getTokenBlacklist and getSessionLimitService both use getSessionRedis', () => {
    const source = readSource('src/lib/services.ts');
    // both services should call getSessionRedis() for their redis client
    const tokenBlacklistSection = source.slice(
      source.indexOf('getTokenBlacklist'),
      source.indexOf('getTokenBlacklist') + 200,
    );
    const sessionLimitSection = source.slice(
      source.indexOf('getSessionLimitService'),
      source.indexOf('getSessionLimitService') + 200,
    );

    expect(tokenBlacklistSection).toContain('getSessionRedis()');
    expect(sessionLimitSection).toContain('getSessionRedis()');
  });

  it('both services return null when redis is unavailable', () => {
    const source = readSource('src/lib/services.ts');
    // verify null fallback in both getters
    expect(source).toMatch(/getTokenBlacklist[\s\S]*?return null/);
    expect(source).toMatch(/getSessionLimitService[\s\S]*?return null/);
  });
});

// ---------------------------------------------------------------------------
// 7. infrastructure config validation
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-10: Infrastructure Config Validation', () => {
  it('.do/app.yaml exists and contains autoscaling config', () => {
    const source = readFileSync(resolve(__dirname, '../../..', '.do/app.yaml'), 'utf-8');
    expect(source).toContain('autoscaling');
    expect(source).toContain('min_instance_count');
    expect(source).toContain('max_instance_count');
  });

  it('.github/workflows/drift-detection.yml exists', () => {
    const source = readFileSync(
      resolve(__dirname, '../../..', '.github/workflows/drift-detection.yml'),
      'utf-8',
    );
    expect(source).toBeTruthy();
    // should reference the drift-check script
    expect(source).toContain('drift');
  });

  it('scripts/drift-check.sh exists', () => {
    const source = readFileSync(resolve(__dirname, '../../..', 'scripts/drift-check.sh'), 'utf-8');
    expect(source).toBeTruthy();
  });

  it('scripts/failover-test.sh exists', () => {
    const source = readFileSync(
      resolve(__dirname, '../../..', 'scripts/failover-test.sh'),
      'utf-8',
    );
    expect(source).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8. ha database configuration
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-10: HA Database Configuration', () => {
  it('db.ts exports resolveConnectionString', () => {
    const source = readSource('src/lib/db.ts');
    expect(source).toContain('export function resolveConnectionString');
  });

  it('db.ts exports isHaMode', () => {
    const source = readSource('src/lib/db.ts');
    expect(source).toContain('export function isHaMode');
  });

  it('db.ts exports reconnect', () => {
    const source = readSource('src/lib/db.ts');
    expect(source).toContain('export function reconnect');
  });

  it('db.ts exports getDbForDomain', () => {
    const source = readSource('src/lib/db.ts');
    expect(source).toContain('export function getDbForDomain');
  });

  it('resolveConnectionString prefers DATABASE_URL_HA over DATABASE_URL', () => {
    const source = readSource('src/lib/db.ts');
    // ha url should be checked first
    expect(source).toContain('DATABASE_URL_HA');
    // the function should return { ha: true } when HA is set
    expect(source).toMatch(/DATABASE_URL_HA[\s\S]*?ha:\s*true/);
  });

  it('getDbForDomain supports crypto and hr domains', () => {
    const source = readSource('src/lib/db.ts');
    expect(source).toContain("crypto");
    expect(source).toContain("hr");
    // verify default pool config has both domains
    expect(source).toMatch(/crypto:\s*\{/);
    expect(source).toMatch(/hr:\s*\{/);
  });
});
