/**
 * P1.5-05: DB-backed RBAC middleware tests
 * @task P1.5-05
 *
 * verifies that checkPermission correctly enforces DB-backed
 * role->permission lookups, user extraction, caching, and
 * dev-mode backward compatibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock variables — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockExtractUser = vi.fn();
const mockResolvePermissions = vi.fn();
const mockResolvePermissionsForRole = vi.fn();
const mockGetDb = vi.fn();

vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: (...args: unknown[]) => mockExtractUser(...args),
  resolvePermissions: (...args: unknown[]) => mockResolvePermissions(...args),
  resolvePermissionsForRole: (...args: unknown[]) => mockResolvePermissionsForRole(...args),
}));

vi.mock('../src/lib/db', () => ({
  getDb: () => mockGetDb(),
}));

// ---------------------------------------------------------------------------
// import under test (after mocks)
// ---------------------------------------------------------------------------

import { checkPermission } from '../src/lib/security/rbac-middleware';

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

describe('checkPermission — dev mode', () => {
  it('returns null (permitted) when user has matching permission via role', async () => {
    const req = makeRequest({ 'x-user-role': 'admin' });
    mockResolvePermissionsForRole.mockResolvedValue(
      new Set(['platform/admin.view', 'platform/admin.manage']),
    );

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeNull();
  });

  it('returns 403 when user role lacks the required permission', async () => {
    const req = makeRequest({ 'x-user-role': 'viewer' });
    mockResolvePermissionsForRole.mockResolvedValue(
      new Set(['platform/viewer.read']),
    );

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);

    const body = await result!.json();
    expect(body.detail).toContain('platform/admin.view');
  });

  it('returns 403 when no x-user-role header is present', async () => {
    const req = makeRequest();

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 403 when x-user-role is "anonymous"', async () => {
    const req = makeRequest({ 'x-user-role': 'anonymous' });

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('falls back to stub (permit) when DB is unavailable', async () => {
    // db not available
    mockGetDb.mockImplementation(() => {
      throw new Error('DATABASE_URL not set');
    });

    const req = makeRequest({ 'x-user-role': 'admin' });

    const result = await checkPermission('platform/admin.view')(req);
    // stub fallback: accept any non-empty, non-anonymous role
    expect(result).toBeNull();
  });

  it('falls back to stub (permit) when DB query throws', async () => {
    mockGetDb.mockReturnValue({});
    mockResolvePermissionsForRole.mockRejectedValue(new Error('connection refused'));

    const req = makeRequest({ 'x-user-role': 'admin' });

    const result = await checkPermission('platform/admin.view')(req);
    // stub fallback: accept any non-empty, non-anonymous role
    expect(result).toBeNull();
  });

  it('uses x-user-id header for user-based permission lookup when available', async () => {
    const req = makeRequest({
      'x-user-role': 'admin',
      'x-user-id': 'user-123',
    });
    mockResolvePermissions.mockResolvedValue(
      new Set(['platform/admin.view']),
    );

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeNull();
    expect(mockResolvePermissions).toHaveBeenCalledWith('user-123', expect.anything());
    // should NOT have called role-based lookup
    expect(mockResolvePermissionsForRole).not.toHaveBeenCalled();
  });

  it('resolves multiple permissions for a role correctly', async () => {
    mockResolvePermissionsForRole.mockResolvedValue(
      new Set([
        'platform/admin.view',
        'platform/admin.manage',
        'crypto/trade.view',
      ]),
    );

    const req1 = makeRequest({ 'x-user-role': 'admin' });
    const result1 = await checkPermission('platform/admin.view')(req1);
    expect(result1).toBeNull();

    const req2 = makeRequest({ 'x-user-role': 'admin' });
    const result2 = await checkPermission('crypto/trade.view')(req2);
    expect(result2).toBeNull();

    const req3 = makeRequest({ 'x-user-role': 'admin' });
    const result3 = await checkPermission('hr/candidate.delete')(req3);
    // role has permissions in DB but not this one → 403
    expect(result3).not.toBeNull();
    expect(result3!.status).toBe(403);
  });
});

describe('checkPermission — production mode', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('returns null (permitted) when JWT user has the required permission', async () => {
    const req = makeRequest();
    mockExtractUser.mockResolvedValue({ userId: 'user-abc', email: 'user@example.com' });
    mockResolvePermissions.mockResolvedValue(new Set(['platform/admin.view']));

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeNull();
    expect(mockExtractUser).toHaveBeenCalledWith(req);
    expect(mockResolvePermissions).toHaveBeenCalledWith('user-abc', expect.anything());
  });

  it('returns 403 when JWT user lacks the required permission', async () => {
    const req = makeRequest();
    mockExtractUser.mockResolvedValue({ userId: 'user-abc', email: 'user@example.com' });
    mockResolvePermissions.mockResolvedValue(new Set(['platform/viewer.read']));

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 401 when no user can be extracted (no JWT)', async () => {
    const req = makeRequest();
    mockExtractUser.mockResolvedValue(null);

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);

    const body = await result!.json();
    expect(body.title).toBe('Unauthorized');
  });

  it('returns 403 when DB is unavailable in production', async () => {
    const req = makeRequest();
    mockExtractUser.mockResolvedValue({ userId: 'user-abc', email: 'user@example.com' });
    mockGetDb.mockImplementation(() => {
      throw new Error('DATABASE_URL not set');
    });

    const result = await checkPermission('platform/admin.view')(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });
});

describe('checkPermission — caching', () => {
  it('caches permissions per request — does not re-query DB on second call', async () => {
    const req = makeRequest({ 'x-user-role': 'admin' });
    mockResolvePermissionsForRole.mockResolvedValue(
      new Set(['platform/admin.view', 'platform/admin.manage']),
    );

    // first call — queries DB
    const result1 = await checkPermission('platform/admin.view')(req);
    expect(result1).toBeNull();
    expect(mockResolvePermissionsForRole).toHaveBeenCalledTimes(1);

    // second call with same Request — should use cache
    const result2 = await checkPermission('platform/admin.manage')(req);
    expect(result2).toBeNull();
    expect(mockResolvePermissionsForRole).toHaveBeenCalledTimes(1); // still 1

    // third call — permission NOT in cached set
    const result3 = await checkPermission('hr/candidate.delete')(req);
    expect(result3).not.toBeNull();
    expect(result3!.status).toBe(403);
    expect(mockResolvePermissionsForRole).toHaveBeenCalledTimes(1); // still 1
  });

  it('does not share cache across different Request objects', async () => {
    mockResolvePermissionsForRole.mockResolvedValue(
      new Set(['platform/admin.view']),
    );

    const req1 = makeRequest({ 'x-user-role': 'admin' });
    await checkPermission('platform/admin.view')(req1);
    expect(mockResolvePermissionsForRole).toHaveBeenCalledTimes(1);

    const req2 = makeRequest({ 'x-user-role': 'admin' });
    await checkPermission('platform/admin.view')(req2);
    // different Request object → separate cache entry → queries again
    expect(mockResolvePermissionsForRole).toHaveBeenCalledTimes(2);
  });

  it('caches permissions in production mode too', async () => {
    process.env.NODE_ENV = 'production';
    const req = makeRequest();
    mockExtractUser.mockResolvedValue({ userId: 'user-abc', email: 'user@example.com' });
    mockResolvePermissions.mockResolvedValue(
      new Set(['platform/admin.view', 'platform/admin.manage']),
    );

    // first call
    await checkPermission('platform/admin.view')(req);
    expect(mockResolvePermissions).toHaveBeenCalledTimes(1);

    // second call with same Request — cached
    await checkPermission('platform/admin.manage')(req);
    expect(mockResolvePermissions).toHaveBeenCalledTimes(1);
  });
});
