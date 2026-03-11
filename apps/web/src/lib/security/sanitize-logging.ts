/**
 * INT-06: PII-safe logging sanitizer
 * @task INT-06
 * @warning S2-W2, S2-W3
 *
 * sanitizes objects before logging to prevent pii leakage.
 * fields matching known pii patterns are replaced with '[REDACTED]'.
 * query parameter values can be hashed for correlation without exposure.
 */

import { createHash } from 'node:crypto';

// s6-cf-04: exact field name matching to avoid false positives
const PII_FIELDS = new Set([
  'email',
  'phone',
  'ssn',
  'address',
  'name',
  'password',
  'token',
  'secret',
  'authorization',
  'credit_card',
  'creditcard',
  'dateofbirth',
  'date_of_birth',
]);

const REDACTED = '[REDACTED]';

/**
 * checks if a field name exactly matches a known pii field (case-insensitive).
 */
function isPiiField(fieldName: string): boolean {
  return PII_FIELDS.has(fieldName.toLowerCase());
}

/**
 * deep clones an object and replaces pii field values with '[REDACTED]'.
 * matches field names case-insensitively against known pii patterns.
 */
export function sanitizeForLogging(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(obj) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiField(key)) {
        result[key] = REDACTED;
      } else if (val !== null && typeof val === 'object') {
        result[key] = sanitizeValue(val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  return value;
}

/**
 * produces a sha-256 hash of a query parameter value for correlation
 * without exposing the original pii value in logs.
 */
export function hashQueryParam(value: string, salt: string = ''): string {
  return createHash('sha256')
    .update(salt + value)
    .digest('hex');
}
