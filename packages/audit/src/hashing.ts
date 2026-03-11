/**
 * AUD-02: Audit hash computation
 * @task AUD-02
 *
 * Pure function — computes SHA-256 of previousHash + stringified event data.
 * Forms the tamper-evident chain: each audit record's hash depends on
 * the previous record's hash.
 */

import { createHash } from 'node:crypto';

/**
 * Compute tamper-evident audit hash.
 *
 * hash = sha256(previousHash + JSON.stringify(eventData))
 *
 * For the first event in a chain, previousHash is the chain's genesis hash.
 */
export function computeAuditHash(
  previousHash: string,
  eventData: Record<string, unknown>,
): string {
  const payload = previousHash + JSON.stringify(eventData);
  return createHash('sha256').update(payload).digest('hex');
}
