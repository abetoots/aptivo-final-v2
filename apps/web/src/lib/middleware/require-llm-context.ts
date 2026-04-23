/**
 * S17-B1: LLM request actor context resolver.
 *
 * Resolves an `ActorContext` (userId + optional departmentId) from an
 * inbound `Request` so callers can stamp it onto a `CompletionRequest`
 * before dispatching through the LLM gateway. Two purposes:
 *
 *   1. Anomaly-gate scoping — the LLM3-04 gate aggregates audit events
 *      keyed by `userId`, so without an actor the gate is a no-op.
 *   2. Department attribution — `llm_usage_logs.department_id` carries
 *      this value; FA3-01 reporting reads it to compute `coverageLevel`
 *      ('none' until a stamped row exists, 'full' thereafter).
 *
 * Auth source: re-uses `extractUser` (apps/web/src/lib/security/
 * rbac-resolver.ts) so the JWT verification path stays single-source.
 *
 * Department mapping: `departments.ownerUserId = userId` is the only
 * association today (S16 FA3-01 ships single-owner departments). When a
 * first-class user→department membership table lands, swap the lookup
 * here without changing call-site semantics. Returns `departmentId:
 * undefined` for users without an owned department — usage rows still
 * insert, just unstamped.
 */

import type { ActorContext } from '@aptivo/llm-gateway';
import { extractUser } from '../security/rbac-resolver.js';

// ---------------------------------------------------------------------------
// dependency interface — keeps the middleware testable without the live db
// ---------------------------------------------------------------------------

export interface DepartmentLookup {
  /** returns the first department owned by `userId`, or null if none. */
  findOwnedDepartmentId(userId: string): Promise<string | null>;
}

export interface RequireLlmContextDeps {
  departmentLookup: DepartmentLookup;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createRequireLlmContext(deps: RequireLlmContextDeps) {
  return async function requireLlmContext(request: Request): Promise<ActorContext | null> {
    const user = await extractUser(request);
    if (!user) return null;

    const departmentId = await deps.departmentLookup.findOwnedDepartmentId(user.userId);

    return {
      userId: user.userId,
      departmentId: departmentId ?? undefined,
      roles: user.federatedRoles,
    };
  };
}

export type RequireLlmContext = ReturnType<typeof createRequireLlmContext>;
