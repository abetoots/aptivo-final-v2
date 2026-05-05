/**
 * S18-A1: workflow-side counterpart to `requireLlmContext`.
 *
 * `requireLlmContext` (apps/web/src/lib/middleware/require-llm-context.ts)
 * derives an `ActorContext` from an inbound HTTP `Request` via JWT
 * extraction. Inngest workflow steps don't have a `Request` — they have
 * an event payload. This helper does the equivalent shape transformation
 * for the workflow side.
 *
 * Why this exists: every workflow step that calls the LLM gateway must
 * stamp `request.actor` so:
 *
 *   1. `llm_usage_logs.user_id` is populated for FA3-01 spend reports
 *   2. `audit_logs.user_id` is populated (only when `actor.type='user'`,
 *      see packages/audit/src/audit-service.ts:61) — the anomaly gate's
 *      aggregate query (`WHERE user_id = $actor`) returns zero rows
 *      otherwise, leaving the gate silently inert
 *
 * Pair with `completeWorkflowRequest` (./complete-workflow-request.ts):
 * the wrapper takes `ActorContext` as a *required* parameter, and a CI
 * grep gate prevents bare `gateway.complete(` in workflow files. This
 * helper is the only sanctioned producer of that `ActorContext` for
 * workflow callsites.
 *
 * Honest behaviour: returns `undefined` when no `requestedBy` is present
 * in the event. That's the right answer for workflows triggered by
 * external systems (`crypto/signal.created`, `hr/application.received`)
 * — there is no initiating user. Don't fabricate `userId: 'system'` to
 * fill the column; `actor.type='system'` on the audit emit conveys this
 * honestly without polluting `audit_logs.user_id`.
 */

import type { ActorContext } from '@aptivo/llm-gateway';

// ---------------------------------------------------------------------------
// input shape — matches the `requestedBy` field plumbed through Inngest
// event payloads (see packages/types/src/events/* additions in S18-A1)
// ---------------------------------------------------------------------------

export interface WorkflowActorInput {
  /**
   * The user who initiated this workflow run, or who has taken over a
   * step (e.g., HITL approver). Carried on the event payload as
   * `requestedBy`. Absent when the workflow was triggered by an
   * external system.
   */
  readonly requestedBy?: {
    readonly userId: string;
    readonly departmentId?: string;
    readonly roles?: readonly string[];
  };

  /**
   * Optional fallback for the case where the workflow step knows the
   * department from context (e.g., a per-department signal) but the
   * acting user's owned department isn't known. Stamped only when
   * `requestedBy.departmentId` is absent.
   */
  readonly fallbackDepartmentId?: string;
}

// ---------------------------------------------------------------------------
// resolver
// ---------------------------------------------------------------------------

/**
 * Build an `ActorContext` from a workflow event payload, or return
 * `undefined` if no acting user is in scope.
 *
 * Note: this is intentionally a pure function with no I/O. Department
 * lookup happens upstream when the event is emitted (HTTP route or
 * cross-step propagation), not here — workflow steps are durable and
 * shouldn't add database calls just to enrich actor context.
 */
export function resolveWorkflowActor(input: WorkflowActorInput): ActorContext | undefined {
  if (!input.requestedBy) return undefined;

  const { userId, departmentId, roles } = input.requestedBy;

  return {
    userId,
    departmentId: departmentId ?? input.fallbackDepartmentId,
    roles,
  };
}
