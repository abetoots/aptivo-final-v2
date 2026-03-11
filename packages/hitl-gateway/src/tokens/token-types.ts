/**
 * HITL Token Type Definitions
 * @spike SP-11
 * @add ADD §4.1 (Token Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-11
 */

/** JWT claims for HITL approval tokens */
export interface HitlTokenPayload {
  /** approval request ID — binds token to specific request */
  requestId: string;
  /** action the token authorises (e.g. 'approve', 'reject') */
  action: string;
  /** delivery channel (e.g. 'email', 'slack', 'web') */
  channel: string;
  /** standard JWT expiration (epoch seconds) */
  exp: number;
  /** standard JWT issued-at (epoch seconds) */
  iat: number;
  /** JWT ID — unique per token, used for replay prevention */
  jti: string;
  /** audience claim — bound to request type */
  aud: string;
  /** issuer claim — identifies the issuing service */
  iss: string;
}

export interface TokenGenerationOptions {
  requestId: string;
  action: string;
  channel: string;
  /** audience claim (e.g. 'hitl-approval') */
  audience: string;
  /** issuer claim (e.g. 'aptivo-hitl-gateway') */
  issuer: string;
  /** TTL in seconds (default 900 = 15 min) */
  ttlSeconds?: number;
}

export interface TokenGenerationResult {
  /** the signed JWT string */
  token: string;
  /** SHA-256 hash of the token (for DB storage, never store raw) */
  tokenHash: string;
  /** the JTI claim value */
  jti: string;
  /** when the token expires */
  expiresAt: Date;
}

export type TokenRejectionReason =
  | 'expired'
  | 'invalid-signature'
  | 'invalid-audience'
  | 'invalid-issuer'
  | 'replayed-jti'
  | 'malformed';
