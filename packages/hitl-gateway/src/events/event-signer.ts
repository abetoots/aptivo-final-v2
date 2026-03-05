/**
 * SP-14: Event Authenticity & Anti-Replay
 * @spike SP-14
 * @frd FR-CORE-HITL-001, FR-CORE-HITL-006
 * @add ADD §4.2 (Event Security)
 * @warnings S7-W10, S7-W11
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-14
 *
 * Implements:
 * - Event signing (HMAC-SHA256)
 * - Timestamp + nonce for anti-replay
 * - Context binding (event bound to specific workflow)
 */

import { Result } from '@aptivo/types';

import type { SignedEvent } from './event-types.js';

export async function signEvent<T>(
  _payload: T,
  _secret: string,
): Promise<Result<SignedEvent<T>, Error>> {
  // TODO: Implement in SP-14 spike execution
  throw new Error('Not implemented — SP-14 spike pending');
}

export async function verifyEventSignature<T>(
  _event: SignedEvent<T>,
  _secret: string,
  _maxAgeMs?: number,
): Promise<Result<T, Error>> {
  // TODO: Implement in SP-14 spike execution
  throw new Error('Not implemented — SP-14 spike pending');
}
