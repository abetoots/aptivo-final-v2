/**
 * SP-03: Supabase Auth + RLS Spike
 * @spike SP-03
 * @brd BO-CORE-003, BRD §6.4 (Build: Auth & Tenancy)
 * @frd FR-CORE-AUTH-001 through FR-CORE-AUTH-005
 * @add ADD §6 (Auth & Tenancy), §6.1 (RLS Policies)
 * @warnings S7-W3 (auth failure paths), S7-W21 (JWKS stale-if-error 24h boundary)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-03
 */

import { Result } from '@aptivo/types';
import type { Result as ResultType } from '@aptivo/types';

// ---------------------------------------------------------------------------
// spike configuration
// ---------------------------------------------------------------------------

export const SP_03_CONFIG = {
  name: 'SP-03: Supabase Auth + RLS',
  risk: 'CRITICAL' as const,
  validations: [
    'Auth session creation and validation',
    'RLS policy enforcement per tenant',
    'Cross-tenant access prevention',
    'JWT claim propagation to Postgres',
    'Service role bypass behavior',
    'Token refresh and expiry',
  ],
} as const;

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/** jwt claims representing a supabase auth token payload */
export interface JwtClaims {
  readonly sub: string; // user id
  readonly role: 'authenticated' | 'anon' | 'service_role';
  readonly aud: string;
  readonly exp: number; // unix timestamp (seconds)
  readonly iat: number;
  readonly app_metadata?: {
    readonly tenant_id?: string;
  };
}

/** a row in a tenant-scoped table */
export interface TenantRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly data: unknown;
}

/** session states */
export type SessionState = 'active' | 'expired' | 'revoked';

/** auth error tags */
export type AuthError =
  | { readonly _tag: 'MissingClaims'; readonly detail: string }
  | { readonly _tag: 'TenantMismatch'; readonly expected: string; readonly actual: string | undefined }
  | { readonly _tag: 'TokenExpired'; readonly expiredAt: number }
  | { readonly _tag: 'SessionRevoked'; readonly sessionId: string }
  | { readonly _tag: 'SessionExpired'; readonly sessionId: string }
  | { readonly _tag: 'SessionNotFound'; readonly sessionId: string }
  | { readonly _tag: 'Unauthorized'; readonly reason: string }
  | { readonly _tag: 'JwksKeyNotFound'; readonly kid: string }
  | { readonly _tag: 'JwksStaleExpired'; readonly kid: string; readonly staleForMs: number };

// ---------------------------------------------------------------------------
// 1. jwt claims validator
// ---------------------------------------------------------------------------

/**
 * Validates that JWT claims contain the expected tenant binding.
 * Enforces: sub present, role present, tenant_id matches, token not expired.
 */
export const validateJwtClaims = (
  claims: JwtClaims,
  expectedTenantId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): ResultType<JwtClaims, AuthError> => {
  // check required subject
  if (!claims.sub) {
    return Result.err({ _tag: 'MissingClaims', detail: 'sub claim is required' });
  }

  // check expiry (S7-W3: expired token => 401)
  if (claims.exp <= nowSec) {
    return Result.err({ _tag: 'TokenExpired', expiredAt: claims.exp });
  }

  // check tenant binding
  const actualTenant = claims.app_metadata?.tenant_id;
  if (actualTenant !== expectedTenantId) {
    return Result.err({
      _tag: 'TenantMismatch',
      expected: expectedTenantId,
      actual: actualTenant,
    });
  }

  return Result.ok(claims);
};

// ---------------------------------------------------------------------------
// 2. rls policy simulator
// ---------------------------------------------------------------------------

/**
 * Simulates a Postgres RLS policy check: tenant_id = current_setting('app.tenant_id').
 * Service role bypasses RLS entirely.
 */
export const simulateRlsCheck = (
  row: TenantRow,
  userClaims: JwtClaims,
): ResultType<TenantRow, AuthError> => {
  // service_role bypasses RLS
  if (userClaims.role === 'service_role') {
    return Result.ok(row);
  }

  // anon role has no tenant context — deny
  if (userClaims.role === 'anon') {
    return Result.err({ _tag: 'Unauthorized', reason: 'anon role cannot access tenant data' });
  }

  // authenticated: enforce tenant_id match
  const userTenant = userClaims.app_metadata?.tenant_id;
  if (!userTenant) {
    return Result.err({ _tag: 'MissingClaims', detail: 'tenant_id not found in app_metadata' });
  }

  if (row.tenant_id !== userTenant) {
    return Result.err({
      _tag: 'TenantMismatch',
      expected: userTenant,
      actual: row.tenant_id,
    });
  }

  return Result.ok(row);
};

// ---------------------------------------------------------------------------
// 3. session state machine
// ---------------------------------------------------------------------------

interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly state: SessionState;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly refreshedAt?: number;
}

/**
 * In-memory session manager that models Supabase auth session lifecycle.
 * States: active -> expired (by time) or active -> revoked (explicit).
 */
export class SessionManager {
  private sessions = new Map<string, SessionRecord>();
  private sessionTtlMs: number;
  private idCounter = 0;

  constructor(sessionTtlMs: number = 3600_000) {
    this.sessionTtlMs = sessionTtlMs;
  }

  /** creates a new active session */
  createSession(
    userId: string,
    tenantId: string,
    now: number = Date.now(),
  ): ResultType<SessionRecord, AuthError> {
    const id = `session-${++this.idCounter}`;
    const session: SessionRecord = {
      id,
      userId,
      tenantId,
      state: 'active',
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
    };
    this.sessions.set(id, session);
    return Result.ok(session);
  }

  /** validates whether a session is still usable */
  validateSession(
    sessionId: string,
    now: number = Date.now(),
  ): ResultType<SessionRecord, AuthError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Result.err({ _tag: 'SessionNotFound', sessionId });
    }

    if (session.state === 'revoked') {
      return Result.err({ _tag: 'SessionRevoked', sessionId });
    }

    // check time-based expiry
    if (now >= session.expiresAt) {
      // transition to expired state
      this.sessions.set(sessionId, { ...session, state: 'expired' });
      return Result.err({ _tag: 'SessionExpired', sessionId });
    }

    return Result.ok(session);
  }

  /** refreshes an active session, extending its expiry */
  refreshSession(
    sessionId: string,
    now: number = Date.now(),
  ): ResultType<SessionRecord, AuthError> {
    const valid = this.validateSession(sessionId, now);
    if (!valid.ok) {
      return valid;
    }

    const refreshed: SessionRecord = {
      ...valid.value,
      expiresAt: now + this.sessionTtlMs,
      refreshedAt: now,
    };
    this.sessions.set(sessionId, refreshed);
    return Result.ok(refreshed);
  }

  /** explicitly revokes a session */
  revokeSession(sessionId: string): ResultType<SessionRecord, AuthError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Result.err({ _tag: 'SessionNotFound', sessionId });
    }

    const revoked: SessionRecord = { ...session, state: 'revoked' };
    this.sessions.set(sessionId, revoked);
    return Result.ok(revoked);
  }
}

// ---------------------------------------------------------------------------
// 4. jwks cache simulator (S7-W21)
// ---------------------------------------------------------------------------

interface CachedKey {
  readonly kid: string;
  readonly publicKey: string;
  readonly fetchedAt: number;
}

/**
 * Simulates JWKS key caching with stale-if-error semantics.
 * S7-W21: stale keys are served during outage for up to maxStaleDurationMs (24h).
 * After that boundary, stale keys are rejected.
 */
export class JwksCache {
  private cache = new Map<string, CachedKey>();
  private maxAgeMs: number;
  private maxStaleDurationMs: number;
  private outageActive = false;

  constructor(
    maxAgeMs: number = 3600_000, // 1h default freshness
    maxStaleDurationMs: number = 24 * 3600_000, // 24h stale-if-error
  ) {
    this.maxAgeMs = maxAgeMs;
    this.maxStaleDurationMs = maxStaleDurationMs;
  }

  /** adds a key to the cache */
  setKey(kid: string, publicKey: string, now: number = Date.now()): void {
    this.cache.set(kid, { kid, publicKey, fetchedAt: now });
  }

  /** simulates an upstream jwks outage */
  simulateOutage(): void {
    this.outageActive = true;
  }

  /** restores upstream jwks availability */
  restoreService(): void {
    this.outageActive = false;
  }

  /** checks if a cached key is stale (past maxAge) */
  isStale(kid: string, now: number = Date.now()): boolean {
    const entry = this.cache.get(kid);
    if (!entry) return true;
    return now - entry.fetchedAt > this.maxAgeMs;
  }

  /**
   * Retrieves a JWKS key, implementing stale-if-error:
   * - If fresh: return immediately
   * - If stale + outage + within 24h: return stale key (S7-W21 within boundary)
   * - If stale + outage + past 24h: reject (S7-W21 boundary exceeded)
   * - If stale + no outage: simulate refresh
   */
  getKey(
    kid: string,
    now: number = Date.now(),
  ): ResultType<CachedKey, AuthError> {
    const entry = this.cache.get(kid);

    // no cached key at all
    if (!entry) {
      if (this.outageActive) {
        return Result.err({ _tag: 'JwksKeyNotFound', kid });
      }
      // simulate fresh fetch
      const fresh: CachedKey = { kid, publicKey: `pk-${kid}`, fetchedAt: now };
      this.cache.set(kid, fresh);
      return Result.ok(fresh);
    }

    const age = now - entry.fetchedAt;

    // still fresh
    if (age <= this.maxAgeMs) {
      return Result.ok(entry);
    }

    // stale — attempt refresh
    if (!this.outageActive) {
      // simulate successful refresh
      const refreshed: CachedKey = { kid, publicKey: entry.publicKey, fetchedAt: now };
      this.cache.set(kid, refreshed);
      return Result.ok(refreshed);
    }

    // outage active — stale-if-error logic
    if (age <= this.maxStaleDurationMs) {
      // within 24h boundary — serve stale (S7-W21 safe)
      return Result.ok(entry);
    }

    // past 24h boundary — reject stale key (S7-W21 exceeded)
    return Result.err({
      _tag: 'JwksStaleExpired',
      kid,
      staleForMs: age,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. service role bypass
// ---------------------------------------------------------------------------

/** operations that rls might gate */
export type RlsOperation = 'select' | 'insert' | 'update' | 'delete';

/**
 * Validates whether a given role can perform an operation.
 * Service role bypasses RLS; authenticated requires tenant binding;
 * anon is denied write operations.
 */
export const checkServiceRoleAccess = (
  role: JwtClaims['role'],
  operation: RlsOperation,
): ResultType<{ allowed: true; bypassRls: boolean }, AuthError> => {
  // service_role always bypasses RLS
  if (role === 'service_role') {
    return Result.ok({ allowed: true, bypassRls: true });
  }

  // anon: read-only at most, no writes
  if (role === 'anon') {
    if (operation !== 'select') {
      return Result.err({
        _tag: 'Unauthorized',
        reason: `anon role cannot perform ${operation}`,
      });
    }
    // anon select still goes through RLS (bypassRls: false)
    return Result.ok({ allowed: true, bypassRls: false });
  }

  // authenticated: all operations allowed, but RLS still applies
  return Result.ok({ allowed: true, bypassRls: false });
};
