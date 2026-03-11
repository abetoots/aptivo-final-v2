/**
 * AUD-02: PII masking for audit metadata
 * @task AUD-02
 * @frd FR-CORE-AUD-001 ("Sensitive PII in metadata is automatically masked")
 *
 * Config-driven field-level masking applied recursively to metadata
 * before audit write. Two modes:
 * - redact: replace value with '[REDACTED]'
 * - hash: replace value with sha256(salt + value) for correlation
 */

import { createHash } from 'node:crypto';
import type { MaskingConfig } from './types.js';

/**
 * Mask PII fields in audit metadata.
 * Returns a new object — does not mutate the input.
 */
export function maskMetadata(
  metadata: Record<string, unknown> | null | undefined,
  config: MaskingConfig,
): Record<string, unknown> | null {
  if (!metadata) return null;
  return maskObject(metadata, config);
}

function maskObject(
  obj: Record<string, unknown>,
  config: MaskingConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (config.redactFields.some((f) => lowerKey === f.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (config.hashFields.some((f) => lowerKey === f.toLowerCase())) {
      result[key] = hashValue(String(value), config.hashSalt);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // recurse into nested objects
      result[key] = maskObject(value as Record<string, unknown>, config);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function hashValue(value: string, salt: string): string {
  return createHash('sha256').update(salt + value).digest('hex');
}
