/**
 * HITL2-00: session DELETE token blacklisting
 * @task HITL2-00
 *
 * verifies that DELETE /api/auth/sessions/:id blacklists the session
 * token after successful removal, and degrades gracefully when the
 * blacklist service is unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock extractUser — controls authentication
// ---------------------------------------------------------------------------

const mockExtractUser = vi.fn();
vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: (...args: unknown[]) => mockExtractUser(...args),
}));

// ---------------------------------------------------------------------------
// mock services — controls session + blacklist services
// ---------------------------------------------------------------------------

const mockRemoveSession = vi.fn();
const mockSessionService = {
  listSessions: vi.fn(),
  removeSession: mockRemoveSession,
  checkAndEvict: vi.fn(),
  getSessionCount: vi.fn(),
};

const mockBlacklist = vi.fn();
const mockBlacklistService = {
  blacklist: mockBlacklist,
  isBlacklisted: vi.fn(),
  getStats: vi.fn(),
};

// toggleable service availability
let sessionServiceValue: typeof mockSessionService | null = mockSessionService;
let blacklistServiceValue: typeof mockBlacklistService | null = mockBlacklistService;

vi.mock('../src/lib/services', () => ({
  getSessionLimitService: () => sessionServiceValue,
  getTokenBlacklist: () => blacklistServiceValue,
}));

// ---------------------------------------------------------------------------
// import route handler (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { DELETE as deleteSession } from '../src/app/api/auth/sessions/[id]/route';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string) {
  return new Request(`http://localhost:3000${path}`, { method: 'DELETE' });
}

function callDelete(req: Request, sessionId: string) {
  return deleteSession(req, { params: Promise.resolve({ id: sessionId }) });
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  sessionServiceValue = mockSessionService;
  blacklistServiceValue = mockBlacklistService;
  mockExtractUser.mockReset();
  mockRemoveSession.mockReset();
  mockBlacklist.mockReset();
  // default: successful remove + successful blacklist
  mockRemoveSession.mockResolvedValue({ ok: true, value: undefined });
  mockBlacklist.mockResolvedValue({ ok: true, value: undefined });
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL2-00: DELETE /api/auth/sessions/:id — token blacklisting', () => {
  it('blacklists the session token after successful removal', async () => {
    mockExtractUser.mockResolvedValue({ userId: 'user-1', email: 'a@test.com' });

    const req = makeRequest('/api/auth/sessions/sess-abc');
    const res = await callDelete(req, 'sess-abc');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terminated).toBe('sess-abc');
    expect(body.userId).toBe('user-1');

    // session was removed
    expect(mockRemoveSession).toHaveBeenCalledWith('user-1', 'sess-abc');

    // token was blacklisted with session id as jti
    // allow fire-and-forget to resolve
    await vi.waitFor(() => {
      expect(mockBlacklist).toHaveBeenCalledTimes(1);
    });

    const [jti, expiresAt] = mockBlacklist.mock.calls[0]!;
    expect(jti).toBe('sess-abc');
    // expires at should be ~900 seconds from now (jwt lifetime)
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(expiresAt).toBeGreaterThanOrEqual(nowSeconds + 899);
    expect(expiresAt).toBeLessThanOrEqual(nowSeconds + 901);
  });

  it('succeeds without error when blacklist service is unavailable (null)', async () => {
    blacklistServiceValue = null;
    mockExtractUser.mockResolvedValue({ userId: 'user-2', email: 'b@test.com' });

    const req = makeRequest('/api/auth/sessions/sess-xyz');
    const res = await callDelete(req, 'sess-xyz');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terminated).toBe('sess-xyz');

    // session was removed
    expect(mockRemoveSession).toHaveBeenCalledWith('user-2', 'sess-xyz');

    // blacklist was never called (service is null)
    expect(mockBlacklist).not.toHaveBeenCalled();
  });

  it('returns 401 without authentication', async () => {
    mockExtractUser.mockResolvedValue(null);

    const req = makeRequest('/api/auth/sessions/sess-no-auth');
    const res = await callDelete(req, 'sess-no-auth');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/unauthorized');
    expect(body.detail).toBe('Authentication required');

    // neither service was invoked
    expect(mockRemoveSession).not.toHaveBeenCalled();
    expect(mockBlacklist).not.toHaveBeenCalled();
  });

  it('still returns 200 when blacklist call rejects (fire-and-forget)', async () => {
    mockExtractUser.mockResolvedValue({ userId: 'user-3', email: 'c@test.com' });
    mockBlacklist.mockRejectedValue(new Error('redis down'));

    const req = makeRequest('/api/auth/sessions/sess-err');
    const res = await callDelete(req, 'sess-err');

    // response should still be 200 — blacklist error is swallowed
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terminated).toBe('sess-err');

    // session was removed
    expect(mockRemoveSession).toHaveBeenCalledWith('user-3', 'sess-err');

    // blacklist was attempted
    await vi.waitFor(() => {
      expect(mockBlacklist).toHaveBeenCalledTimes(1);
    });
  });
});
