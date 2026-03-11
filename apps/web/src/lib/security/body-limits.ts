/**
 * INT-06: body size limits and HMAC verification
 * @task INT-06
 * @warning S1-W11, S1-W12, T1-W28
 *
 * provides constants and utilities for request body validation:
 * - size limits for webhook and api payloads
 * - json nesting depth checks to prevent stack overflow attacks
 * - hmac signature verification with timing-safe comparison
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// maximum body size for incoming webhook payloads (256kb)
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

// maximum body size for api request payloads (1mb)
export const API_MAX_BODY_BYTES = 1024 * 1024;

// maximum json nesting depth to prevent stack overflow
export const MAX_JSON_DEPTH = 10;

/**
 * checks whether a json value's nesting depth is within the allowed limit.
 * returns true if within limits, false if exceeds maxDepth.
 */
export function checkJsonDepth(
  value: unknown,
  maxDepth: number = MAX_JSON_DEPTH,
): boolean {
  return measureDepth(value, 0, maxDepth);
}

function measureDepth(value: unknown, current: number, max: number): boolean {
  if (current > max) return false;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!measureDepth(item, current + 1, max)) return false;
    }
    return true;
  }

  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (!measureDepth((value as Record<string, unknown>)[key], current + 1, max)) {
        return false;
      }
    }
    return true;
  }

  return true;
}

/**
 * verifies an hmac signature using timing-safe comparison.
 * prevents timing attacks by always comparing the full digest.
 */
export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = 'sha256',
): boolean {
  try {
    const expected = createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');

    // ensure both buffers have the same length for timingSafeEqual
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * checks whether a body's byte size is within the specified limit.
 * uses Buffer.byteLength for strings (utf-8 aware), .length for buffers.
 */
export function isBodyWithinLimit(
  body: string | Buffer,
  limitBytes: number,
): boolean {
  const size = typeof body === 'string'
    ? Buffer.byteLength(body, 'utf8')
    : body.length;
  return size <= limitBytes;
}
