/**
 * ID2-07: auth-failure test matrix — closes tier 2 EP-2
 * @task ID2-07
 * @tier2 EP-2
 *
 * comprehensive negative test matrix covering all authentication and
 * authorization failure modes. each test documents which FR-CORE requirement
 * and tier 2 finding it addresses.
 *
 * requirement mapping:
 * - FR-CORE-ID-001: authentication (JWT, MFA, SSO)
 * - FR-CORE-ID-002: authorization (RBAC, permissions)
 * - FR-CORE-ID-003: session management (blacklist, revocation)
 * - EP-2: auth-failure path test cases (tier 2 finding)
 * - AS-1: JWT revocation window (tier 2 finding)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock variables — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockExtractUser = vi.fn();
const mockResolvePermissions = vi.fn();
const mockResolvePermissionsForRole = vi.fn();
const mockResolvePermissionsWithFederation = vi.fn();
const mockGetDb = vi.fn();

vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: (...args: unknown[]) => mockExtractUser(...args),
  resolvePermissions: (...args: unknown[]) => mockResolvePermissions(...args),
  resolvePermissionsForRole: (...args: unknown[]) => mockResolvePermissionsForRole(...args),
  resolvePermissionsWithFederation: (...args: unknown[]) => mockResolvePermissionsWithFederation(...args),
}));

vi.mock('../src/lib/db', () => ({
  getDb: () => mockGetDb(),
}));

// ---------------------------------------------------------------------------
// import under test (after mocks)
// ---------------------------------------------------------------------------

import { checkPermission, checkPermissionWithBlacklist } from '../src/lib/security/rbac-middleware';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/admin/overview', {
    headers: { ...headers },
  });
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  // default: dev mode
  process.env.NODE_ENV = 'test';
  // default: db available
  mockGetDb.mockReturnValue({});
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('auth-failure matrix — authentication (FR-CORE-ID-001)', () => {
  // -- test 1: expired/invalid JWT → 401 (FR-CORE-ID-001, EP-2) --

  it('returns 401 when JWT is expired or invalid (extractUser returns null)', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue(null);

    const req = makeRequest();
    const result = await checkPermission('platform/admin.view')(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);

    const body = await result!.json();
    expect(body.type).toBe('https://aptivo.dev/errors/unauthorized');
    expect(body.title).toBe('Unauthorized');
  });

  // -- test 2: MFA step-up required → 403 (FR-CORE-ID-001, EP-2) --

  it('returns 403 with mfa_required when aal1 user accesses sensitive operation', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal1',
    });

    const req = makeRequest();
    // platform/admin.view is in SENSITIVE_OPERATIONS
    const result = await checkPermissionWithBlacklist('platform/admin.view')(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.errorCode).toBe('mfa_required');
    expect(body.mfaChallengeUrl).toBeDefined();
    expect(body.type).toBe('https://aptivo.dev/errors/mfa-required');
  });

  // -- test 3: MFA satisfied (aal2) → passes through (FR-CORE-ID-001) --

  it('returns null (permitted) when aal2 user accesses sensitive operation', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal2',
    });
    mockResolvePermissions.mockResolvedValue(
      new Set(['platform/admin.view']),
    );

    const req = makeRequest();
    const result = await checkPermissionWithBlacklist('platform/admin.view')(req);

    expect(result).toBeNull();
  });

  // -- test 9: non-sensitive operation with aal1 → no MFA required (FR-CORE-ID-001) --

  it('permits aal1 user on non-sensitive operation without MFA check', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal1',
    });
    mockResolvePermissions.mockResolvedValue(
      new Set(['crypto/trade.view']),
    );

    const req = makeRequest();
    // crypto/trade.view is NOT in SENSITIVE_OPERATIONS
    const result = await checkPermissionWithBlacklist('crypto/trade.view')(req);

    expect(result).toBeNull();
  });
});

describe('auth-failure matrix — session management (FR-CORE-ID-003)', () => {
  // -- test 4: blacklisted token → 401 (FR-CORE-ID-003, AS-1) --

  it('returns 401 with token_revoked when blacklist check blocks request', async () => {
    // dev mode — easier to mock the blacklist callback
    process.env.NODE_ENV = 'test';

    const blacklistCheck = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'https://aptivo.dev/errors/token-revoked',
          title: 'Token Revoked',
          status: 401,
          detail: 'This token has been revoked',
          errorCode: 'token_revoked',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );

    const req = makeRequest({
      'x-user-role': 'admin',
      'x-token-jti': 'revoked-jti',
    });

    const result = await checkPermissionWithBlacklist('platform/admin.view', blacklistCheck)(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);

    const body = await result!.json();
    expect(body.errorCode).toBe('token_revoked');
    expect(body.type).toBe('https://aptivo.dev/errors/token-revoked');

    // verify the blacklist check received the jti
    expect(blacklistCheck).toHaveBeenCalledWith(req, 'revoked-jti');
  });

  // -- test 5: non-blacklisted token → passes through (FR-CORE-ID-003) --

  it('returns null (permitted) when blacklist check passes', async () => {
    process.env.NODE_ENV = 'test';

    const blacklistCheck = vi.fn().mockResolvedValue(null);

    mockResolvePermissionsForRole.mockResolvedValue(
      new Set(['crypto/trade.view']),
    );

    const req = makeRequest({
      'x-user-role': 'admin',
      'x-token-jti': 'valid-jti',
    });

    const result = await checkPermissionWithBlacklist('crypto/trade.view', blacklistCheck)(req);

    // non-sensitive op with valid blacklist check and matching permission → permitted
    expect(result).toBeNull();
    expect(blacklistCheck).toHaveBeenCalledWith(req, 'valid-jti');
  });
});

describe('auth-failure matrix — authorization (FR-CORE-ID-002)', () => {
  // -- test 6: insufficient permission → 403 (FR-CORE-ID-002, EP-2) --

  it('returns 403 when authenticated user lacks required permission', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal2',
    });
    mockResolvePermissions.mockResolvedValue(
      new Set(['platform/viewer.read']),
    );

    const req = makeRequest();
    const result = await checkPermission('platform/admin.view')(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.type).toBe('https://aptivo.dev/errors/forbidden');
    expect(body.title).toBe('Forbidden');
    expect(body.detail).toContain('platform/admin.view');
  });
});

describe('auth-failure matrix — federation (EP-2)', () => {
  // -- test 7: federated user with unmapped group → default role (EP-2) --

  it('resolves permissions via federation path when federatedRoles is present', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal2',
      federatedRoles: ['unmapped-group'],
    });
    // unmapped group + local role → only default/local permissions
    mockResolvePermissionsWithFederation.mockResolvedValue(
      new Set(['platform/viewer.read']),
    );

    const req = makeRequest();
    const result = await checkPermissionWithBlacklist('platform/admin.view')(req);

    // should use federated resolution
    expect(mockResolvePermissionsWithFederation).toHaveBeenCalledWith(
      'u1',
      ['unmapped-group'],
      expect.anything(),
    );
    // permission not in resolved set → 403
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  // -- test 8: federated user with mapped groups → merged permissions (EP-2) --

  it('merges local and federated permissions for mapped idp groups', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal2',
      federatedRoles: ['admin'],
    });
    // federation merges local + idp-mapped admin permissions
    mockResolvePermissionsWithFederation.mockResolvedValue(
      new Set(['platform/admin.view', 'platform/admin.manage', 'crypto/trade.view']),
    );

    const req = makeRequest();
    const result = await checkPermissionWithBlacklist('platform/admin.view')(req);

    expect(mockResolvePermissionsWithFederation).toHaveBeenCalledWith(
      'u1',
      ['admin'],
      expect.anything(),
    );
    // merged set includes required permission → null (permitted)
    expect(result).toBeNull();
  });
});

describe('auth-failure matrix — resilience', () => {
  // -- test 10: DB unavailable → 403 in production --

  it('returns 403 when DB is unavailable in production mode', async () => {
    process.env.NODE_ENV = 'production';
    mockExtractUser.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      aal: 'aal2',
    });
    mockGetDb.mockImplementation(() => {
      throw new Error('DATABASE_URL not set');
    });

    const req = makeRequest();
    const result = await checkPermission('platform/admin.view')(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.type).toBe('https://aptivo.dev/errors/forbidden');
  });
});

describe('auth-failure matrix — dev mode backward compatibility', () => {
  // -- test 11: dev mode stub fallback → permits non-anonymous roles --

  it('permits non-anonymous role via stub fallback when DB returns empty permissions', async () => {
    process.env.NODE_ENV = 'test';
    mockResolvePermissionsForRole.mockResolvedValue(new Set());

    const req = makeRequest({ 'x-user-role': 'admin' });
    const result = await checkPermission('platform/admin.view')(req);

    // stub fallback: accept any non-empty, non-anonymous role
    expect(result).toBeNull();
  });

  // -- test 12: dev mode anonymous → 403 --

  it('returns 403 for anonymous role in dev mode', async () => {
    process.env.NODE_ENV = 'test';

    const req = makeRequest({ 'x-user-role': 'anonymous' });
    const result = await checkPermission('platform/admin.view')(req);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.type).toBe('https://aptivo.dev/errors/forbidden');
  });
});
