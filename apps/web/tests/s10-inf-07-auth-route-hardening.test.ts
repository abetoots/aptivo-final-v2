/**
 * INF-07: auth route hardening tests
 * @task INF-07
 *
 * verifies:
 * 1. all 5 admin routes import checkPermissionWithBlacklist (not checkPermission)
 * 2. session listing and termination routes wire to real service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// part 1: admin route migration verification (source-level checks)
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('INF-07: Admin route migration to checkPermissionWithBlacklist', () => {
  const adminRoutes = [
    {
      name: 'admin/overview',
      path: 'src/app/api/admin/overview/route.ts',
    },
    {
      name: 'admin/audit',
      path: 'src/app/api/admin/audit/route.ts',
    },
    {
      name: 'admin/hitl',
      path: 'src/app/api/admin/hitl/route.ts',
    },
    {
      name: 'admin/llm-usage',
      path: 'src/app/api/admin/llm-usage/route.ts',
    },
    {
      name: 'admin/llm-usage/budget',
      path: 'src/app/api/admin/llm-usage/budget/route.ts',
    },
  ];

  for (const route of adminRoutes) {
    it(`${route.name} imports checkPermissionWithBlacklist`, () => {
      const source = readFileSync(resolve(__dirname, '..', route.path), 'utf-8');
      expect(source).toContain('checkPermissionWithBlacklist');
      // must not import old checkPermission (but substring match could hit checkPermissionWithBlacklist)
      // verify that "import { checkPermission }" is NOT present (only checkPermissionWithBlacklist)
      expect(source).not.toMatch(/import\s*\{[^}]*\bcheckPermission\b(?!WithBlacklist)[^}]*\}/);
    });

    it(`${route.name} calls checkPermissionWithBlacklist (not checkPermission)`, () => {
      const source = readFileSync(resolve(__dirname, '..', route.path), 'utf-8');
      expect(source).toMatch(/checkPermissionWithBlacklist\s*\(/);
      // must not call the old checkPermission directly
      expect(source).not.toMatch(/(?<!WithBlacklist)\bcheckPermission\s*\(/);
    });
  }
});

// ---------------------------------------------------------------------------
// part 2: session route tests — mock extractUser and services
// ---------------------------------------------------------------------------

// mock extractUser — controls authentication
const mockExtractUser = vi.fn();
vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: (...args: unknown[]) => mockExtractUser(...args),
}));

// mock session limit service — controls session data
const mockListSessions = vi.fn();
const mockRemoveSession = vi.fn();
const mockSessionService = {
  listSessions: mockListSessions,
  removeSession: mockRemoveSession,
  checkAndEvict: vi.fn(),
  getSessionCount: vi.fn(),
};

// track whether service returns null (unavailable) or the mock service
let sessionServiceValue: typeof mockSessionService | null = mockSessionService;

vi.mock('../src/lib/services', () => ({
  getSessionLimitService: () => sessionServiceValue,
}));

// imports (after mocks are hoisted)
import { GET as getSessions } from '../src/app/api/auth/sessions/route';
import { DELETE as deleteSession } from '../src/app/api/auth/sessions/[id]/route';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, headers?: Record<string, string>) {
  return new Request(`http://localhost:3000${path}`, { headers });
}

function makeAuthenticatedRequest(path: string, userId = 'user-123') {
  return makeRequest(path, { 'x-user-id': userId });
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  sessionServiceValue = mockSessionService;
  mockExtractUser.mockReset();
  mockListSessions.mockReset();
  mockRemoveSession.mockReset();
});

// ---------------------------------------------------------------------------
// session listing: GET /api/auth/sessions
// ---------------------------------------------------------------------------

describe('INF-07: GET /api/auth/sessions', () => {
  it('returns 401 without authentication', async () => {
    mockExtractUser.mockResolvedValue(null);

    const req = makeRequest('/api/auth/sessions');
    const res = await getSessions(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/unauthorized');
    expect(body.detail).toBe('Authentication required');
  });

  it('returns sessions list when service is available', async () => {
    const sessions = [
      { sessionId: 's1', createdAt: 1000, deviceInfo: 'chrome' },
      { sessionId: 's2', createdAt: 2000 },
    ];
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });
    mockListSessions.mockResolvedValue({ ok: true, value: sessions });

    const req = makeAuthenticatedRequest('/api/auth/sessions');
    const res = await getSessions(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-123');
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].sessionId).toBe('s1');
    expect(body.sessions[1].sessionId).toBe('s2');
  });

  it('returns empty array when service is null', async () => {
    sessionServiceValue = null;
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });

    const req = makeAuthenticatedRequest('/api/auth/sessions');
    const res = await getSessions(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-123');
    expect(body.sessions).toEqual([]);
  });

  it('returns empty array when listSessions returns error', async () => {
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });
    mockListSessions.mockResolvedValue({
      ok: false,
      error: { _tag: 'SessionError', operation: 'listSessions', cause: 'redis down' },
    });

    const req = makeAuthenticatedRequest('/api/auth/sessions');
    const res = await getSessions(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// session termination: DELETE /api/auth/sessions/:id
// ---------------------------------------------------------------------------

describe('INF-07: DELETE /api/auth/sessions/:id', () => {
  // helper to simulate next.js dynamic route params
  function callDelete(req: Request, sessionId: string) {
    return deleteSession(req, { params: Promise.resolve({ id: sessionId }) });
  }

  it('returns 401 without authentication', async () => {
    mockExtractUser.mockResolvedValue(null);

    const req = makeRequest('/api/auth/sessions/s1', { });
    const res = await callDelete(req, 's1');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/unauthorized');
  });

  it('returns 200 on successful termination', async () => {
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });
    mockRemoveSession.mockResolvedValue({ ok: true, value: undefined });

    const req = makeAuthenticatedRequest('/api/auth/sessions/s1');
    const res = await callDelete(req, 's1');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terminated).toBe('s1');
    expect(body.userId).toBe('user-123');
    expect(mockRemoveSession).toHaveBeenCalledWith('user-123', 's1');
  });

  it('returns 503 when service is unavailable (null)', async () => {
    sessionServiceValue = null;
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });

    const req = makeAuthenticatedRequest('/api/auth/sessions/s1');
    const res = await callDelete(req, 's1');

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/service-unavailable');
    expect(body.detail).toContain('not configured');
  });

  it('returns 500 when removeSession fails', async () => {
    mockExtractUser.mockResolvedValue({ userId: 'user-123', email: 'dev@test.com' });
    mockRemoveSession.mockResolvedValue({
      ok: false,
      error: { _tag: 'SessionError', operation: 'removeSession', cause: 'redis error' },
    });

    const req = makeAuthenticatedRequest('/api/auth/sessions/s1');
    const res = await callDelete(req, 's1');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/session-removal-failed');
  });
});
