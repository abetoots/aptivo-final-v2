/**
 * @testcase SP-03-COMP-001 through SP-03-COMP-005
 * @requirements FR-CORE-AUTH-001 through FR-CORE-AUTH-005
 * @warnings S7-W3 (auth failure paths), S7-W21 (JWKS stale-if-error 24h boundary)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-03
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SP_03_CONFIG,
  validateJwtClaims,
  simulateRlsCheck,
  SessionManager,
  JwksCache,
  checkServiceRoleAccess,
} from '../src/sp-03-supabase-auth.js';
import type { JwtClaims, TenantRow } from '../src/sp-03-supabase-auth.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const NOW_SEC = 1_700_000_000; // unix seconds for jwt
const NOW_MS = NOW_SEC * 1000; // milliseconds for session/jwks

const makeClaims = (overrides: Partial<JwtClaims> = {}): JwtClaims => ({
  sub: 'user-1',
  role: 'authenticated',
  aud: 'authenticated',
  iat: NOW_SEC - 300,
  exp: NOW_SEC + 3600,
  app_metadata: { tenant_id: TENANT_A },
  ...overrides,
});

const makeRow = (tenantId: string = TENANT_A): TenantRow => ({
  id: 'row-1',
  tenant_id: tenantId,
  data: { name: 'test' },
});

// ---------------------------------------------------------------------------
// SP-03-COMP-001: spike configuration
// ---------------------------------------------------------------------------

describe('SP-03: Supabase Auth + RLS', () => {
  it('has correct spike configuration', () => {
    expect(SP_03_CONFIG.name).toBe('SP-03: Supabase Auth + RLS');
    expect(SP_03_CONFIG.risk).toBe('CRITICAL');
    expect(SP_03_CONFIG.validations).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // SP-03-COMP-002: JWT claims validation
  // -------------------------------------------------------------------------

  describe('JWT claims validation', () => {
    it('accepts valid claims with matching tenant', () => {
      const result = validateJwtClaims(makeClaims(), TENANT_A, NOW_SEC);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sub).toBe('user-1');
        expect(result.value.app_metadata?.tenant_id).toBe(TENANT_A);
      }
    });

    it('rejects claims with wrong tenant', () => {
      const result = validateJwtClaims(makeClaims(), TENANT_B, NOW_SEC);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TenantMismatch');
        if (result.error._tag === 'TenantMismatch') {
          expect(result.error.expected).toBe(TENANT_B);
          expect(result.error.actual).toBe(TENANT_A);
        }
      }
    });

    it('rejects claims with missing tenant_id', () => {
      const claims = makeClaims({ app_metadata: {} });
      const result = validateJwtClaims(claims, TENANT_A, NOW_SEC);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TenantMismatch');
      }
    });

    it('rejects claims with missing sub', () => {
      const claims = makeClaims({ sub: '' });
      const result = validateJwtClaims(claims, TENANT_A, NOW_SEC);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MissingClaims');
      }
    });

    it('rejects expired token (S7-W3)', () => {
      // token expired 60 seconds ago
      const claims = makeClaims({ exp: NOW_SEC - 60 });
      const result = validateJwtClaims(claims, TENANT_A, NOW_SEC);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TokenExpired');
      }
    });

    it('rejects token expiring exactly at current time', () => {
      const claims = makeClaims({ exp: NOW_SEC });
      const result = validateJwtClaims(claims, TENANT_A, NOW_SEC);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TokenExpired');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SP-03-COMP-003: RLS policy simulation
  // -------------------------------------------------------------------------

  describe('RLS policy simulation', () => {
    it('allows access when tenant matches', () => {
      const result = simulateRlsCheck(makeRow(TENANT_A), makeClaims());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('row-1');
      }
    });

    it('blocks cross-tenant access', () => {
      const result = simulateRlsCheck(makeRow(TENANT_B), makeClaims());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('TenantMismatch');
      }
    });

    it('allows service_role to bypass RLS', () => {
      const claims = makeClaims({ role: 'service_role' });
      // service role can access any tenant's row
      const result = simulateRlsCheck(makeRow(TENANT_B), claims);
      expect(result.ok).toBe(true);
    });

    it('blocks anon role from tenant data', () => {
      const claims = makeClaims({ role: 'anon' });
      const result = simulateRlsCheck(makeRow(TENANT_A), claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('Unauthorized');
      }
    });

    it('blocks authenticated user with missing tenant_id', () => {
      const claims = makeClaims({ app_metadata: {} });
      const result = simulateRlsCheck(makeRow(TENANT_A), claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MissingClaims');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SP-03-COMP-004: session lifecycle
  // -------------------------------------------------------------------------

  describe('session lifecycle', () => {
    const TTL = 3600_000; // 1 hour
    let mgr: SessionManager;

    beforeEach(() => {
      mgr = new SessionManager(TTL);
    });

    it('creates an active session', () => {
      const result = mgr.createSession('user-1', TENANT_A, NOW_MS);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.state).toBe('active');
        expect(result.value.userId).toBe('user-1');
        expect(result.value.tenantId).toBe(TENANT_A);
        expect(result.value.expiresAt).toBe(NOW_MS + TTL);
      }
    });

    it('validates an active session', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const validated = mgr.validateSession(created.value.id, NOW_MS + 1000);
      expect(validated.ok).toBe(true);
    });

    it('refreshes an active session extending expiry', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      if (!created.ok) return;

      const refreshTime = NOW_MS + 1800_000; // 30 min later
      const refreshed = mgr.refreshSession(created.value.id, refreshTime);
      expect(refreshed.ok).toBe(true);
      if (refreshed.ok) {
        expect(refreshed.value.expiresAt).toBe(refreshTime + TTL);
        expect(refreshed.value.refreshedAt).toBe(refreshTime);
      }
    });

    it('detects expired session (S7-W3)', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      if (!created.ok) return;

      // validate after TTL has passed
      const result = mgr.validateSession(created.value.id, NOW_MS + TTL + 1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionExpired');
      }
    });

    it('revokes a session', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      if (!created.ok) return;

      const revoked = mgr.revokeSession(created.value.id);
      expect(revoked.ok).toBe(true);
      if (revoked.ok) {
        expect(revoked.value.state).toBe('revoked');
      }
    });

    it('rejects validation of revoked session (S7-W3)', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      if (!created.ok) return;

      mgr.revokeSession(created.value.id);
      const result = mgr.validateSession(created.value.id, NOW_MS + 1000);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionRevoked');
      }
    });

    it('rejects refresh of expired session', () => {
      const created = mgr.createSession('user-1', TENANT_A, NOW_MS);
      if (!created.ok) return;

      const result = mgr.refreshSession(created.value.id, NOW_MS + TTL + 1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionExpired');
      }
    });

    it('returns error for unknown session id', () => {
      const result = mgr.validateSession('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionNotFound');
      }
    });
  });

  // -------------------------------------------------------------------------
  // SP-03-COMP-005: JWKS cache with stale-if-error (S7-W21)
  // -------------------------------------------------------------------------

  describe('JWKS cache (S7-W21)', () => {
    const MAX_AGE = 3600_000; // 1h freshness
    const STALE_LIMIT = 24 * 3600_000; // 24h stale-if-error boundary
    let cache: JwksCache;

    beforeEach(() => {
      cache = new JwksCache(MAX_AGE, STALE_LIMIT);
    });

    it('returns a fresh cached key', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      const result = cache.getKey('key-1', NOW_MS + 1000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kid).toBe('key-1');
        expect(result.value.publicKey).toBe('pk-key-1');
      }
    });

    it('reports staleness correctly', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      expect(cache.isStale('key-1', NOW_MS + 1000)).toBe(false);
      expect(cache.isStale('key-1', NOW_MS + MAX_AGE + 1)).toBe(true);
      expect(cache.isStale('unknown-key')).toBe(true);
    });

    it('refreshes stale key when upstream is available', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      const staleTime = NOW_MS + MAX_AGE + 1000;

      const result = cache.getKey('key-1', staleTime);
      expect(result.ok).toBe(true);
      // should now be fresh again
      expect(cache.isStale('key-1', staleTime)).toBe(false);
    });

    it('serves stale key during outage within 24h boundary', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      cache.simulateOutage();

      // 2 hours later (stale, but within 24h)
      const staleTime = NOW_MS + MAX_AGE + 3600_000;
      const result = cache.getKey('key-1', staleTime);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kid).toBe('key-1');
      }
    });

    it('rejects stale key after 24h boundary during outage (S7-W21)', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      cache.simulateOutage();

      // 25 hours later (past 24h stale-if-error boundary)
      const expiredTime = NOW_MS + STALE_LIMIT + 3600_000;
      const result = cache.getKey('key-1', expiredTime);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('JwksStaleExpired');
        if (result.error._tag === 'JwksStaleExpired') {
          expect(result.error.staleForMs).toBeGreaterThan(STALE_LIMIT);
        }
      }
    });

    it('fetches unknown key when upstream is available', () => {
      const result = cache.getKey('new-key', NOW_MS);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kid).toBe('new-key');
      }
    });

    it('fails for unknown key during outage', () => {
      cache.simulateOutage();
      const result = cache.getKey('unknown-key', NOW_MS);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('JwksKeyNotFound');
      }
    });

    it('recovers after outage is restored', () => {
      cache.setKey('key-1', 'pk-key-1', NOW_MS);
      cache.simulateOutage();
      cache.restoreService();

      const staleTime = NOW_MS + MAX_AGE + 1000;
      const result = cache.getKey('key-1', staleTime);
      expect(result.ok).toBe(true);
      // key should be refreshed (no longer stale)
      expect(cache.isStale('key-1', staleTime)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SP-03-COMP-006: service role bypass
  // -------------------------------------------------------------------------

  describe('service role bypass', () => {
    it('service_role bypasses RLS for all operations', () => {
      const operations = ['select', 'insert', 'update', 'delete'] as const;
      for (const op of operations) {
        const result = checkServiceRoleAccess('service_role', op);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.bypassRls).toBe(true);
        }
      }
    });

    it('authenticated role does not bypass RLS', () => {
      const result = checkServiceRoleAccess('authenticated', 'select');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bypassRls).toBe(false);
      }
    });

    it('anon role can select but not bypass RLS', () => {
      const result = checkServiceRoleAccess('anon', 'select');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bypassRls).toBe(false);
      }
    });

    it('anon role cannot perform write operations', () => {
      const writes = ['insert', 'update', 'delete'] as const;
      for (const op of writes) {
        const result = checkServiceRoleAccess('anon', op);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error._tag).toBe('Unauthorized');
        }
      }
    });
  });
});
