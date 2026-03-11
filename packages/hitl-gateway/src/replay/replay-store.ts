/**
 * CF-03: Replay Store Interface
 * @task CF-03
 * @condition C1 (Go/No-Go)
 * @see docs/06-sprints/sprint-2-plan.md §CF-03
 *
 * Pluggable replay prevention for JTI (SP-11) and nonce (SP-14) tracking.
 * In-memory for tests/single-instance; Redis SETNX + TTL for multi-instance.
 */

/**
 * Atomically claims a key for replay prevention.
 * First claim succeeds; duplicates are rejected.
 * TTL ensures auto-cleanup after the security window closes.
 * Fail-closed: store errors return ok:false with reason 'store-error'.
 */
export interface ReplayStore {
  claimOnce(
    key: string,
    ttlSeconds: number,
  ): Promise<ClaimResult>;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate' | 'store-error' };
