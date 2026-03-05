/**
 * HITL Event Security Type Definitions
 * @spike SP-14
 * @frd FR-CORE-HITL-001, FR-CORE-HITL-006
 * @add ADD §4.2 (Event Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-14
 */

export interface SignedEvent<T = unknown> {
  payload: T;
  signature: string;
  timestamp: string;
  nonce: string;
}
