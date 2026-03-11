/**
 * SP-06: MCP Server Security — Scoped Token Generation
 * @spike SP-06
 * @add ADD §5.1 (MCP Trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 *
 * HMAC-SHA256 signed tokens with server binding, permissions, and TTL.
 * No external JWT libraries — uses Node crypto for spike simplicity.
 */

import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

export interface ScopedTokenOptions {
  /** server this token is bound to */
  serverId: string;
  /** list of permitted operations */
  permissions: string[];
  /** time-to-live in seconds (max 3600 = 1hr) */
  ttlSeconds: number;
}

export interface ScopedTokenPayload {
  serverId: string;
  permissions: string[];
  issuedAt: number;
  expiresAt: number;
}

const MAX_TTL_SECONDS = 3_600; // 1 hour hard cap

/**
 * Generates an HMAC-SHA256 signed scoped token.
 *
 * Format: base64url(payload).base64url(signature)
 *
 * @param options - token scope configuration
 * @param signingKey - HMAC signing key (must be >= 32 chars)
 * @throws if TTL exceeds 1 hour or signing key is too short
 */
export function generateScopedToken(
  options: ScopedTokenOptions,
  signingKey: string,
): string {
  if (signingKey.length < 32) {
    throw new Error('Signing key must be at least 32 characters');
  }
  if (options.ttlSeconds <= 0 || options.ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`TTL must be between 1 and ${MAX_TTL_SECONDS} seconds`);
  }

  const now = Math.floor(Date.now() / 1_000);
  const payload: ScopedTokenPayload = {
    serverId: options.serverId,
    permissions: options.permissions,
    issuedAt: now,
    expiresAt: now + options.ttlSeconds,
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64, signingKey);

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a scoped token.
 *
 * @returns the decoded payload, or null if invalid/expired/wrong signature
 */
export function verifyScopedToken(
  token: string,
  signingKey: string,
): ScopedTokenPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1 || dotIdx === token.length - 1) return null;

  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = sign(payloadB64, signingKey);

  // constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as ScopedTokenPayload;
    const now = Math.floor(Date.now() / 1_000);
    if (payload.expiresAt <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sign(data: string, key: string): string {
  return toBase64Url(
    createHmac('sha256', key).update(data).digest('base64'),
  );
}

function toBase64Url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function fromBase64Url(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return cryptoTimingSafeEqual(bufA, bufB);
}
