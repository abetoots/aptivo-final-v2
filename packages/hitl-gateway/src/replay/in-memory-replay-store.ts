/**
 * CF-03: In-Memory Replay Store
 * @task CF-03
 *
 * Map-based implementation with setTimeout cleanup.
 * Suitable for tests and single-instance deployments.
 *
 * Provides both sync and async claim paths:
 * - `claim()` — synchronous, used by sync callers (verifyEventSignature)
 * - `claimOnce()` — async (ReplayStore interface), used by async callers
 */

import type { ClaimResult, ReplayStore } from './replay-store.js';

export class InMemoryReplayStore implements ReplayStore {
  private readonly claimed = new Map<string, NodeJS.Timeout>();

  /**
   * Synchronous claim — used by sync callers.
   * Semantically identical to claimOnce but without the Promise wrapper.
   */
  claim(key: string, ttlSeconds: number): ClaimResult {
    if (this.claimed.has(key)) {
      return { ok: false, reason: 'duplicate' };
    }

    // auto-cleanup after TTL
    const timer = setTimeout(() => {
      this.claimed.delete(key);
    }, ttlSeconds * 1_000);

    // don't block process exit
    if (timer.unref) timer.unref();

    this.claimed.set(key, timer);
    return { ok: true };
  }

  /** async interface (ReplayStore contract) — delegates to sync claim */
  async claimOnce(key: string, ttlSeconds: number): Promise<ClaimResult> {
    return this.claim(key, ttlSeconds);
  }

  /** clears all claimed keys and timers (test utility) */
  clear(): void {
    for (const timer of this.claimed.values()) {
      clearTimeout(timer);
    }
    this.claimed.clear();
  }

  /** returns the number of currently claimed keys */
  get size(): number {
    return this.claimed.size;
  }
}
