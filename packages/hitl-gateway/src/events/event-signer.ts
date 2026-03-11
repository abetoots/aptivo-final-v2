/**
 * SP-14 / CF-03: Event Authenticity & Anti-Replay
 * @task CF-03
 * @frd FR-CORE-HITL-001, FR-CORE-HITL-006
 * @spec docs/04-specs/platform-core/hitl-gateway.md
 *
 * Implements:
 * - HMAC-SHA256 event signing with timestamp + nonce
 * - Signature verification with freshness check
 * - Nonce tracking via pluggable ReplayStore (CF-03)
 * - Context binding (payload contains requestId/workflowId)
 *
 * Two verification entry points:
 * - verifyEventSignature() — synchronous, uses default InMemoryReplayStore
 * - verifyEventSignatureAsync() — async, accepts any ReplayStore (Redis, etc.)
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Result } from '@aptivo/types';
import { InMemoryReplayStore } from '../replay/in-memory-replay-store.js';
import type { ReplayStore } from '../replay/replay-store.js';

import type { SignedEvent, RejectionReason } from './event-types.js';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1_000; // 5 minutes
const MIN_SECRET_LENGTH = 32;

// ---------------------------------------------------------------------------
// default replay store (backward compat for tests that don't inject one)
// ---------------------------------------------------------------------------

const defaultReplayStore = new InMemoryReplayStore();

/** clears the default nonce store (test utility — backward compat with SP-14) */
export function clearNonceStore(): void {
  defaultReplayStore.clear();
}

// ---------------------------------------------------------------------------
// signing
// ---------------------------------------------------------------------------

/**
 * Signs a payload with HMAC-SHA256, adding timestamp and nonce.
 *
 * The payload should include context-binding fields (requestId, workflowId, etc.)
 * so that the signature covers the full context.
 *
 * @param payload - the event data to sign (must be JSON-serializable)
 * @param secret - HMAC signing secret (>= 32 chars)
 */
export function signEvent<T>(
  payload: T,
  secret: string,
): Result<SignedEvent<T>, Error> {
  if (secret.length < MIN_SECRET_LENGTH) {
    return Result.err(new Error(`Secret must be at least ${MIN_SECRET_LENGTH} characters`));
  }

  const timestamp = new Date().toISOString();
  const nonce = randomUUID();

  const signature = computeSignature(payload, timestamp, nonce, secret);

  return Result.ok({ payload, signature, timestamp, nonce });
}

// ---------------------------------------------------------------------------
// verification (sync — backward compat, uses default InMemoryReplayStore)
// ---------------------------------------------------------------------------

/**
 * Verifies a signed event: checks signature, timestamp freshness, and nonce uniqueness.
 * Uses the default InMemoryReplayStore for nonce tracking.
 *
 * For Redis-backed replay stores, use verifyEventSignatureAsync().
 *
 * @param event - the signed event envelope
 * @param secret - HMAC signing secret
 * @param maxAgeMs - max acceptable age for the timestamp (default: 5 minutes)
 * @returns Result with the original payload on success, or rejection reason on failure
 */
export function verifyEventSignature<T>(
  event: SignedEvent<T>,
  secret: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Result<T, { reason: RejectionReason; message: string }> {
  const preCheck = verifyStructureAndSignature(event, secret, maxAgeMs);
  if (preCheck !== null) return preCheck;

  // anti-replay: sync claim via default in-memory store
  const eventTime = new Date(event.timestamp).getTime();
  const remainingMs = maxAgeMs - (Date.now() - eventTime);
  const ttlSeconds = Math.max(Math.ceil(remainingMs / 1_000), 1);

  const claim = defaultReplayStore.claim(event.nonce, ttlSeconds);
  if (!claim.ok) {
    return Result.err({
      reason: 'replayed-nonce',
      message: `Nonce ${event.nonce} has already been used`,
    });
  }

  return Result.ok(event.payload);
}

// ---------------------------------------------------------------------------
// verification (async — supports any ReplayStore including Redis)
// ---------------------------------------------------------------------------

/**
 * Async version of verifyEventSignature. Supports any ReplayStore implementation,
 * including RedisReplayStore for multi-instance deployment.
 *
 * @param event - the signed event envelope
 * @param secret - HMAC signing secret
 * @param maxAgeMs - max acceptable age for the timestamp (default: 5 minutes)
 * @param replayStore - replay store for nonce tracking (defaults to in-memory)
 * @returns Result with the original payload on success, or rejection reason on failure
 */
export async function verifyEventSignatureAsync<T>(
  event: SignedEvent<T>,
  secret: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  replayStore: ReplayStore = defaultReplayStore,
): Promise<Result<T, { reason: RejectionReason; message: string }>> {
  const preCheck = verifyStructureAndSignature(event, secret, maxAgeMs);
  if (preCheck !== null) return preCheck;

  // anti-replay: async claim via injected store
  const eventTime = new Date(event.timestamp).getTime();
  const remainingMs = maxAgeMs - (Date.now() - eventTime);
  const ttlSeconds = Math.max(Math.ceil(remainingMs / 1_000), 1);

  const claim = await replayStore.claimOnce(event.nonce, ttlSeconds);
  if (!claim.ok) {
    const message = claim.reason === 'store-error'
      ? 'Replay store error — fail-closed rejection'
      : `Nonce ${event.nonce} has already been used`;
    return Result.err({ reason: 'replayed-nonce', message });
  }

  return Result.ok(event.payload);
}

// ---------------------------------------------------------------------------
// shared pre-checks (structure, signature, freshness)
// ---------------------------------------------------------------------------

function verifyStructureAndSignature<T>(
  event: SignedEvent<T>,
  secret: string,
  maxAgeMs: number,
): Result<never, { reason: RejectionReason; message: string }> | null {
  // validate structure
  if (!event.payload || !event.signature || !event.timestamp || !event.nonce) {
    return Result.err({
      reason: 'malformed-event',
      message: 'Missing required fields: payload, signature, timestamp, nonce',
    });
  }

  // verify signature (timing-safe)
  const expectedSig = computeSignature(event.payload, event.timestamp, event.nonce, secret);
  const sigBuf = Buffer.from(event.signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return Result.err({
      reason: 'invalid-signature',
      message: 'HMAC signature verification failed',
    });
  }

  // check timestamp freshness
  const eventTime = new Date(event.timestamp).getTime();
  const now = Date.now();
  if (isNaN(eventTime) || now - eventTime > maxAgeMs) {
    return Result.err({
      reason: 'expired-timestamp',
      message: `Event timestamp expired (max age: ${maxAgeMs}ms)`,
    });
  }

  return null; // all checks passed
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function computeSignature<T>(payload: T, timestamp: string, nonce: string, secret: string): string {
  const message = JSON.stringify({ payload, timestamp, nonce });
  return createHmac('sha256', secret).update(message).digest('hex');
}
