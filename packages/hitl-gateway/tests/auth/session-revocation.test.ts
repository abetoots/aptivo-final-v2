/**
 * @testcase HITL-11-REV-001 through HITL-11-REV-009
 * @task HITL-11
 * @frd FR-CORE-ID-001 (closes S1-W5)
 *
 * Tests the session revocation service:
 * - Revoke single session (owner)
 * - Revoke all user sessions (revokeAll=true)
 * - Unauthorized revocation (non-owner, non-admin) → Forbidden
 * - Admin can revoke any session
 * - Session not found → SessionNotFound
 * - isSessionRevoked: fail-closed on store errors
 */

import { describe, it, expect, vi } from 'vitest';
import { revokeSession, isSessionRevoked } from '../../src/auth/session-revocation.js';
import type { SessionStore } from '../../src/auth/session-revocation.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'session-001';
const OWNER_ID = 'user-owner';
const OTHER_USER = 'user-other';
const ADMIN_ID = 'user-admin';

function mockStore(overrides?: Partial<SessionStore>): SessionStore {
  return {
    revokeSession: vi.fn(async () => {}),
    revokeAllUserSessions: vi.fn(async () => ({ revokedCount: 3 })),
    isRevoked: vi.fn(async () => false),
    getSessionOwner: vi.fn(async () => OWNER_ID),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-11: Session Revocation', () => {
  // -----------------------------------------------------------------------
  // revokeSession — happy path
  // -----------------------------------------------------------------------

  describe('revokeSession', () => {
    it('owner can revoke their own session', async () => {
      const store = mockStore();

      const result = await revokeSession({
        sessionId: SESSION_ID,
        requestingUserId: OWNER_ID,
        isAdmin: false,
      }, store);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.revokedCount).toBe(1);
        expect(result.value.sessionId).toBe(SESSION_ID);
      }
      expect(store.revokeSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('admin can revoke any session', async () => {
      const store = mockStore();

      const result = await revokeSession({
        sessionId: SESSION_ID,
        requestingUserId: ADMIN_ID,
        isAdmin: true,
      }, store);

      expect(result.ok).toBe(true);
      expect(store.revokeSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('revokeAll=true revokes all user sessions', async () => {
      const store = mockStore();

      const result = await revokeSession({
        sessionId: SESSION_ID,
        requestingUserId: OWNER_ID,
        isAdmin: false,
        revokeAll: true,
      }, store);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.revokedCount).toBe(3);
      }
      expect(store.revokeAllUserSessions).toHaveBeenCalledWith(OWNER_ID);
    });
  });

  // -----------------------------------------------------------------------
  // revokeSession — authorization
  // -----------------------------------------------------------------------

  describe('authorization', () => {
    it('non-owner non-admin gets Forbidden', async () => {
      const store = mockStore();

      const result = await revokeSession({
        sessionId: SESSION_ID,
        requestingUserId: OTHER_USER,
        isAdmin: false,
      }, store);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('Forbidden');
        expect(result.error).toHaveProperty('message');
      }
      // revokeSession should NOT have been called
      expect(store.revokeSession).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // revokeSession — error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('returns SessionNotFound for unknown session', async () => {
      const store = mockStore({
        getSessionOwner: vi.fn(async () => null),
      });

      const result = await revokeSession({
        sessionId: 'nonexistent',
        requestingUserId: OWNER_ID,
        isAdmin: false,
      }, store);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SessionNotFound');
        expect(result.error).toHaveProperty('sessionId', 'nonexistent');
      }
    });

    it('returns PersistenceError on store failure', async () => {
      const store = mockStore({
        revokeSession: vi.fn(async () => { throw new Error('DB connection lost'); }),
      });

      const result = await revokeSession({
        sessionId: SESSION_ID,
        requestingUserId: OWNER_ID,
        isAdmin: false,
      }, store);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('PersistenceError');
        expect(result.error.message).toBe('DB connection lost');
      }
    });
  });

  // -----------------------------------------------------------------------
  // isSessionRevoked
  // -----------------------------------------------------------------------

  describe('isSessionRevoked', () => {
    it('returns false for active session', async () => {
      const store = mockStore({ isRevoked: vi.fn(async () => false) });

      const result = await isSessionRevoked(SESSION_ID, store);

      expect(result).toBe(false);
    });

    it('returns true for revoked session', async () => {
      const store = mockStore({ isRevoked: vi.fn(async () => true) });

      const result = await isSessionRevoked(SESSION_ID, store);

      expect(result).toBe(true);
    });

    it('fail-closed: returns true on store error', async () => {
      const store = mockStore({
        isRevoked: vi.fn(async () => { throw new Error('Redis down'); }),
      });

      const result = await isSessionRevoked(SESSION_ID, store);

      // fail-closed: treat as revoked when store is unavailable
      expect(result).toBe(true);
    });
  });
});
