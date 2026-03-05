/**
 * HITL Token Type Definitions
 * @spike SP-11
 * @add ADD §4.1 (Token Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-11
 */

export interface HitlTokenPayload {
  requestId: string;
  action: string;
  exp: number;
  jti: string;
}

export interface TokenGenerationResult {
  token: string;
  tokenHash: string;
  jti: string;
  expiresAt: Date;
}
