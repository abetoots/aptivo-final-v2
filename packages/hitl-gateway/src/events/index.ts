/**
 * HITL Event Security — barrel export
 * @spike SP-14
 * @task CF-03
 */

export {
  signEvent,
  verifyEventSignature,
  verifyEventSignatureAsync,
  clearNonceStore,
} from './event-signer.js';
export type { SignedEvent, RejectionReason } from './event-types.js';
