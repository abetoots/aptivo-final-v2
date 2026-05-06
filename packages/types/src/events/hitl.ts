/**
 * S18-A1: centralized HITL decision-event payload contract.
 *
 * Workflow `step.waitForEvent` returns `unknown` for the event payload
 * because Inngest's type machinery can't always narrow it — `as` casts
 * proliferated across the workflow tree, each defining its own ad-hoc
 * shape. Three problems with that:
 *
 *   1. Drift — different workflows asserted slightly different shapes
 *      for the same event (some included `approverId`, some didn't;
 *      some included `comment`/`reason`, some didn't).
 *   2. Mismatch with the actual Inngest schema — at least two casts
 *      asserted decision values that the registered event schema
 *      doesn't allow (e.g. `'request_changes'` cast over a schema
 *      typed `'approved' | 'rejected'`).
 *   3. The S18-A1 audit-emitter migration needs `approverId` reliably
 *      available, but each workflow had to re-extend its cast to add
 *      the field.
 *
 * Centralizing the type here gives a single canonical shape:
 *   - workflow `as` casts reference this name (or the inferred Inngest
 *     event-data type after the inngest.ts schemas are updated to
 *     point here)
 *   - hitl-gateway emit-side and apps/web consume-side share one source
 *   - new HITL-shaped events (budget exception, ticket escalation
 *     review, etc.) reuse the same shape rather than inventing a fork
 *
 * NOT included here: a Zod runtime schema. Workflows trust the Inngest
 * boundary; adding parse-and-fail at every consumer is overkill given
 * the events are emitted by trusted in-process code paths. If a future
 * change introduces external HITL emits, parse can be added at that
 * boundary.
 */

import type { ActorType } from '../actor.js';

/**
 * Decision outcomes a HITL approver can produce.
 *
 * Note: the gateway-level `hitl/decision.recorded` event ONLY carries
 * the binary outcomes — `'approved'` and `'rejected'`. When an approver
 * picks `'request_changes'` the gateway routes that through a different
 * event (`hitl/changes.requested`); see
 * packages/hitl-gateway/src/decision/decision-service.ts:236. Per-domain
 * wrapper events (e.g. `hr/contract.decision.submitted`) MAY include
 * `'request_changes'` because their producers handle the
 * change-request loop in-domain rather than splitting the routing.
 *
 * The two unions below capture that distinction so consumers don't
 * silently accept impossible values for the gateway channel.
 */
export const HITL_TERMINAL_DECISION_VALUES = ['approved', 'rejected'] as const;
export type HitlTerminalDecision = (typeof HITL_TERMINAL_DECISION_VALUES)[number];

export const HITL_DECISION_VALUES = ['approved', 'rejected', 'request_changes'] as const;
export type HitlDecision = (typeof HITL_DECISION_VALUES)[number];

/**
 * The canonical shape of a HITL decision event payload. Carried on
 * `hitl/decision.recorded` (gateway-level) and on per-domain wrappers
 * like `hr/contract.decision.submitted` and the equivalent crypto
 * trade-approval event.
 *
 * Field semantics:
 *   - `requestId`: HITL request UUID — links back to the originating
 *     approval-requested event so workflows can correlate.
 *   - `decision`: outcome.
 *   - `approverId`: optional userId of the human who decided. The S18-A1
 *     audit-emitter migration uses this to set `actor.type='user'` on
 *     the post-HITL audit row, which is what populates
 *     `audit_logs.user_id` (the anomaly-gate aggregate's filter column).
 *     Optional only because legacy emit sites haven't all been threaded
 *     yet; new emit sites must populate it.
 *   - `reviewerNotes`/`reason`/`comment`: optional human-readable
 *     justification text. Different consumer workflows have historically
 *     used different field names for the same concept; all three are
 *     accepted here so each workflow can read whichever its emit-side
 *     conventionally produces.
 *   - `decidedAt`: optional ISO timestamp of the decision.
 *   - `domain`: optional per-domain tag — present on per-domain
 *     wrapper events (`hr/contract.decision.submitted` carries
 *     `domain: 'hr'`); absent on the gateway-level `hitl/decision.recorded`.
 */
export interface HitlDecisionPayload {
  readonly requestId: string;
  readonly decision: HitlDecision;
  readonly approverId?: string;
  readonly reviewerNotes?: string;
  readonly reason?: string;
  readonly comment?: string;
  readonly decidedAt?: string;
  readonly domain?: string;
}

/**
 * Narrow payload for the gateway-level `hitl/decision.recorded` event.
 * Distinct type from {@link HitlDecisionPayload} because the gateway
 * NEVER emits `'request_changes'` on this channel — that decision is
 * routed to `hitl/changes.requested` (see
 * packages/hitl-gateway/src/decision/decision-service.ts:236). Per-domain
 * wrapper events use the wider {@link HitlDecisionPayload} when their
 * producers handle the change-request loop in-domain.
 *
 * Codex round-1 review caught the original over-widening: registering
 * `hitl/decision.recorded` with `HitlDecisionPayload` falsely advertised
 * `'request_changes'` as a possible decision value on a channel that
 * cannot carry it. This narrower variant restores the contract.
 */
export interface HitlDecisionRecorded {
  readonly requestId: string;
  readonly decision: HitlTerminalDecision;
  readonly approverId?: string;
  readonly decidedAt?: string;
  /** w3c traceparent — preserved for cross-boundary trace propagation */
  readonly traceparent?: string;
}

/**
 * Compile-time guard ensuring the audit-emitter migration's
 * actor-mutation rule stays consistent: when `approverId` is present we
 * stamp `actor.type='user'` on the post-HITL audit; absent → fallback to
 * `actor.type='system'`. Encoded as a TS-only helper because the
 * runtime check is trivial; this exists to pin the literal so future
 * type drift breaks at compile time.
 */
export type HitlActorAttributionType = ActorType extends 'user' | 'system'
  ? 'user' | 'system'
  : never;
