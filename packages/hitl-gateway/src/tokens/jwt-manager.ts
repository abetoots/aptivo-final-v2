/**
 * HITL-03/04: JWT Token Generation & Verification
 * @task HITL-03, HITL-04
 * @frd FR-CORE-HITL-001
 * @spec docs/04-specs/platform-core/hitl-gateway.md
 *
 * Implements:
 * - JWT+JTI for replay prevention (pluggable ReplayStore — CF-03)
 * - HS256 signing with jose library
 * - Token hash storage (SHA-256, never store raw tokens)
 * - Audience/issuer claim binding
 * - Channel binding
 * - Key rotation (dual-key validation period)
 * - Expiry enforcement (default 15 min, hard cap 1 hour)
 */

import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { Result } from '@aptivo/types';
import { InMemoryReplayStore } from '../replay/in-memory-replay-store.js';
import type { ReplayStore } from '../replay/replay-store.js';
import type {
  HitlTokenPayload,
  TokenGenerationOptions,
  TokenGenerationResult,
  TokenRejectionReason,
} from './token-types.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SECONDS = 900; // 15 minutes
const MAX_TTL_SECONDS = 3600;    // 1 hour hard cap
const MIN_SECRET_LENGTH = 32;
const ALGORITHM = 'HS256';

// ---------------------------------------------------------------------------
// default replay store (backward compat for tests that don't inject one)
// ---------------------------------------------------------------------------

const defaultReplayStore = new InMemoryReplayStore();

/** clears the default JTI store (test utility — backward compat with SP-11) */
export function clearJtiStore(): void {
  defaultReplayStore.clear();
}

// ---------------------------------------------------------------------------
// token hashing
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hash of a token string.
 * This hash is what gets stored in the DB — never the raw token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// secret encoding
// ---------------------------------------------------------------------------

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// token generation
// ---------------------------------------------------------------------------

/**
 * Generates a signed HITL JWT with JTI, audience, issuer, and channel binding.
 *
 * @returns Result with token, tokenHash (for DB), JTI, and expiresAt
 */
export async function generateHitlToken(
  options: TokenGenerationOptions,
  secret: string,
): Promise<Result<TokenGenerationResult, Error>> {
  if (secret.length < MIN_SECRET_LENGTH) {
    return Result.err(new Error(`Signing secret must be at least ${MIN_SECRET_LENGTH} characters`));
  }

  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (ttl <= 0 || ttl > MAX_TTL_SECONDS) {
    return Result.err(new Error(`TTL must be between 1 and ${MAX_TTL_SECONDS} seconds`));
  }

  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1_000);
  const exp = now + ttl;

  const token = await new SignJWT({
    requestId: options.requestId,
    action: options.action,
    channel: options.channel,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setJti(jti)
    .setAudience(options.audience)
    .setIssuer(options.issuer)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(encodeSecret(secret));

  return Result.ok({
    token,
    tokenHash: hashToken(token),
    jti,
    expiresAt: new Date(exp * 1_000),
  });
}

// ---------------------------------------------------------------------------
// token verification
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  /** expected audience claim */
  audience: string;
  /** expected issuer claim */
  issuer: string;
}

/**
 * Verifies a HITL JWT: signature, expiry, audience, issuer, and JTI replay.
 *
 * Supports key rotation by accepting multiple secrets. The token is verified
 * against each secret in order; the first successful verification wins.
 *
 * @param token The JWT string
 * @param secrets One or more signing secrets (for key rotation, pass [newKey, oldKey])
 * @param options Audience and issuer requirements
 * @param replayStore Optional replay store for JTI tracking (defaults to in-memory)
 * @returns Result with the decoded payload or a rejection reason
 */
export async function verifyHitlToken(
  token: string,
  secrets: string | string[],
  options: VerifyOptions,
  replayStore: ReplayStore = defaultReplayStore,
): Promise<Result<HitlTokenPayload, { reason: TokenRejectionReason; message: string }>> {
  const secretList = Array.isArray(secrets) ? secrets : [secrets];

  if (secretList.length === 0) {
    return Result.err({ reason: 'invalid-signature', message: 'No signing secrets provided' });
  }

  // try each secret (supports dual-key rotation)
  let lastError: unknown;
  for (const secret of secretList) {
    try {
      const { payload } = await jwtVerify(token, encodeSecret(secret), {
        audience: options.audience,
        issuer: options.issuer,
        algorithms: [ALGORITHM],
      });

      // extract custom claims
      const jti = payload.jti;
      if (!jti) {
        return Result.err({ reason: 'malformed', message: 'Token missing JTI claim' });
      }

      // jti replay check via pluggable store
      const remaining = (payload.exp ?? 0) - Math.floor(Date.now() / 1_000);
      const ttl = Math.max(remaining, 1); // at least 1s TTL
      const claim = await replayStore.claimOnce(jti, ttl);
      if (!claim.ok) {
        const reason = claim.reason === 'store-error' ? 'replayed-jti' : 'replayed-jti';
        const message = claim.reason === 'store-error'
          ? 'Replay store error — fail-closed rejection'
          : `JTI ${jti} has already been consumed`;
        return Result.err({ reason, message });
      }

      const result: HitlTokenPayload = {
        requestId: payload.requestId as string,
        action: payload.action as string,
        channel: payload.channel as string,
        exp: payload.exp!,
        iat: payload.iat!,
        jti,
        aud: (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) as string,
        iss: payload.iss!,
      };

      return Result.ok(result);
    } catch (err) {
      lastError = err;
      // if it's a claim error (audience/issuer/expiry), don't try other keys
      if (err instanceof joseErrors.JWTClaimValidationFailed) {
        break;
      }
      if (err instanceof joseErrors.JWTExpired) {
        break;
      }
      // signature error — try next key
      continue;
    }
  }

  // map jose errors to our rejection reasons
  return Result.err(mapJoseError(lastError));
}

function mapJoseError(err: unknown): { reason: TokenRejectionReason; message: string } {
  if (err instanceof joseErrors.JWTExpired) {
    return { reason: 'expired', message: 'Token has expired' };
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    const msg = (err as Error).message;
    if (msg.includes('"aud"')) {
      return { reason: 'invalid-audience', message: `Audience claim validation failed: ${msg}` };
    }
    if (msg.includes('"iss"')) {
      return { reason: 'invalid-issuer', message: `Issuer claim validation failed: ${msg}` };
    }
    return { reason: 'malformed', message: `Claim validation failed: ${msg}` };
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    return { reason: 'invalid-signature', message: 'JWT signature verification failed' };
  }
  return { reason: 'malformed', message: `Token verification failed: ${String(err)}` };
}
