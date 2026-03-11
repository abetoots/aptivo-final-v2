/**
 * HITL-11: Session Revocation Service
 * @task HITL-11
 * @frd FR-CORE-ID-001 (closes S1-W5)
 *
 * Application-level session revocation beyond Supabase defaults.
 * Provides immediate invalidation of auth sessions.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// session store interface (injectable — Supabase-decoupled)
// ---------------------------------------------------------------------------

export interface SessionStore {
  /** revokes a specific session by ID */
  revokeSession(sessionId: string): Promise<void>;

  /** revokes all sessions for a user */
  revokeAllUserSessions(userId: string): Promise<{ revokedCount: number }>;

  /** checks if a session has been revoked */
  isRevoked(sessionId: string): Promise<boolean>;

  /** gets the owner (userId) of a session */
  getSessionOwner(sessionId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// revocation errors
// ---------------------------------------------------------------------------

export type RevocationError =
  | { _tag: 'SessionNotFound'; sessionId: string }
  | { _tag: 'Forbidden'; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };

// ---------------------------------------------------------------------------
// revocation service
// ---------------------------------------------------------------------------

export interface RevokeSessionInput {
  /** the session to revoke */
  sessionId: string;
  /** the user making the request */
  requestingUserId: string;
  /** whether the requesting user has admin role */
  isAdmin: boolean;
  /** revoke all sessions for the session owner */
  revokeAll?: boolean;
}

export interface RevokeSessionResult {
  /** number of sessions revoked */
  revokedCount: number;
  /** the session IDs that were revoked (single for revokeAll=false) */
  sessionId: string;
}

/**
 * Revokes a session with ownership/admin authorization.
 * Only the session owner or an admin can revoke.
 */
export async function revokeSession(
  input: RevokeSessionInput,
  store: SessionStore,
): Promise<Result<RevokeSessionResult, RevocationError>> {
  try {
    // verify session exists and check ownership
    const ownerId = await store.getSessionOwner(input.sessionId);
    if (ownerId === null) {
      return Result.err({
        _tag: 'SessionNotFound',
        sessionId: input.sessionId,
      });
    }

    // authorization: only session owner or admin can revoke
    if (ownerId !== input.requestingUserId && !input.isAdmin) {
      return Result.err({
        _tag: 'Forbidden',
        message: 'Only the session owner or an admin can revoke sessions',
      });
    }

    if (input.revokeAll) {
      const { revokedCount } = await store.revokeAllUserSessions(ownerId);
      return Result.ok({
        revokedCount,
        sessionId: input.sessionId,
      });
    }

    await store.revokeSession(input.sessionId);
    return Result.ok({
      revokedCount: 1,
      sessionId: input.sessionId,
    });
  } catch (cause) {
    return Result.err({
      _tag: 'PersistenceError',
      message: cause instanceof Error ? cause.message : 'Session revocation failed',
      cause,
    });
  }
}

/**
 * Checks if a session has been revoked.
 * Used by auth middleware to reject revoked sessions.
 */
export async function isSessionRevoked(
  sessionId: string,
  store: SessionStore,
): Promise<boolean> {
  try {
    return await store.isRevoked(sessionId);
  } catch {
    // fail-closed: if store is unavailable, treat as revoked
    return true;
  }
}
