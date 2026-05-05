/**
 * S18-A1: Centralized actor-type literal union.
 *
 * Ground truth for the `actor.type` discriminant carried on audit events
 * and the `actor.id`/`actor.userId` shape consumed by anomaly aggregation.
 * Centralizing here so emit-side (workflow audit calls) and query-side
 * (audit aggregate / anomaly gate) can never drift to different string
 * literals.
 *
 * Why this matters: `audit_logs.user_id` is populated only when
 * `actor.type === 'user'` (see packages/audit/src/audit-service.ts).
 * Misspelling 'user' anywhere upstream silently zeroes out the column
 * and the anomaly gate sees zero rows. Importing from one source
 * eliminates that failure mode at the type level.
 */

/**
 * The three actor archetypes the platform distinguishes:
 *
 * - `'user'`: an authenticated principal initiated or is currently
 *   acting on the request (e.g., HITL approver, dashboard user). Audit
 *   rows carry the userId; anomaly aggregation matches these.
 * - `'system'`: an external trigger fired without a human initiator
 *   (e.g., webhook from an exchange, scheduled cron). No userId.
 * - `'workflow'`: an internal Inngest step performing maintenance work
 *   that does NOT directly serve a user request (e.g., chain-head
 *   compaction, retention sweep). No userId.
 *
 * Workflow steps that DO serve a user request — including LLM steps and
 * downstream HITL-approver actions — must use `'user'`, not `'workflow'`,
 * so the gate can attribute correctly.
 */
export type ActorType = 'user' | 'system' | 'workflow';

/**
 * The runtime values of {@link ActorType}, for callers that need to
 * iterate or build a Zod enum. Keep in sync with the type union above —
 * `satisfies` ensures TypeScript catches drift.
 */
export const ACTOR_TYPES = ['user', 'system', 'workflow'] as const satisfies readonly ActorType[];
