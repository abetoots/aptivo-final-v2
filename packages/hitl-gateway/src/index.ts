/**
 * @aptivo/hitl-gateway — HITL security mitigations
 *
 * Provides JWT token security (SP-11) and event authenticity (SP-14)
 * for the Human-in-the-Loop subsystem.
 *
 * @see docs/06-sprints/sprint-0-technical-spikes.md
 */

export {
  generateHitlToken,
  verifyHitlToken,
  hashToken,
} from './tokens/index.js';

export type {
  HitlTokenPayload,
  TokenGenerationResult,
} from './tokens/index.js';

export {
  signEvent,
  verifyEventSignature,
} from './events/index.js';

export type { SignedEvent } from './events/index.js';
