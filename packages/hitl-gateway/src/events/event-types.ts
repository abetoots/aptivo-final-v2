/**
 * HITL Event Security Type Definitions
 * @spike SP-14
 * @frd FR-CORE-HITL-001, FR-CORE-HITL-006
 * @add ADD §4.2 (Event Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-14
 */

/** a signed event envelope wrapping an arbitrary payload */
export interface SignedEvent<T = unknown> {
  payload: T;
  signature: string;
  timestamp: string; // ISO-8601
  nonce: string;
}

/** reasons a signed event can be rejected */
export type RejectionReason =
  | 'invalid-signature'
  | 'expired-timestamp'
  | 'replayed-nonce'
  | 'malformed-event';
