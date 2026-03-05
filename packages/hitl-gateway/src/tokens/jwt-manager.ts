/**
 * SP-11: HITL JWT Token Security
 * @spike SP-11
 * @add ADD §4.1 (Token Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-11
 *
 * Implements:
 * - JWT+JTI for replay prevention
 * - Token hash storage (never store raw tokens)
 * - Key rotation support
 */

import { Result } from '@aptivo/types';

import type { HitlTokenPayload, TokenGenerationResult } from './token-types.js';

export async function generateHitlToken(
  _payload: Omit<HitlTokenPayload, 'exp' | 'jti'>,
  _secret: string,
  _ttlSeconds: number,
): Promise<Result<TokenGenerationResult, Error>> {
  // TODO: Implement in SP-11 spike execution
  throw new Error('Not implemented — SP-11 spike pending');
}

export async function verifyHitlToken(
  _token: string,
  _secret: string,
): Promise<Result<HitlTokenPayload, Error>> {
  // TODO: Implement in SP-11 spike execution
  throw new Error('Not implemented — SP-11 spike pending');
}

export function hashToken(_token: string): string {
  // TODO: Implement SHA-256 hash in SP-11
  throw new Error('Not implemented — SP-11 spike pending');
}
