/**
 * S18-B3 / AD-S18-6: cross-instance dedupe primitive for budget side-effects.
 *
 * Multi-instance apps/web context: N web workers each receive
 * spend-bearing requests, each calls `checkBudget`, and each can
 * detect the same threshold crossing inside the same minute. Without
 * a shared dedupe primitive, every worker would fire the notification
 * → users get N copies. The same shape applies to HITL escalation
 * triggering (one chain per crossing, not N).
 *
 * Scope (post-A2 round-2 lesson): unlike the ws-server's DedupeStore
 * which is PER-INSTANCE (each ws-server fans out to its own clients),
 * the budget dedupe is GLOBAL per `(departmentId, period, threshold)`.
 * Web workers are stateless replicas of the same logical service —
 * we want exactly ONE notification per crossing across the entire
 * cluster, not one per worker.
 *
 * Mechanism: `SET budget:dedupe:<deptId>:<period>:<threshold> 1 NX EX <ttl>`.
 * Returns `true` for the first writer (caller fires the side-effect)
 * and `false` for every subsequent writer in the TTL window.
 *
 * TTL choice: bounded by remaining seconds in the current period
 * (typically calendar month). After the period rolls over, the next
 * threshold crossing in the new period writes a new key whose TTL is
 * the new period's remainder.
 *
 * Fail-OPEN policy: a Redis SET failure returns `true` (caller fires
 * the side-effect anyway). Worse failure mode is "Redis hiccup
 * suppressed every notification for a period" vs "Redis hiccup caused
 * one extra notification" — the former is silent and user-invisible,
 * the latter is noisy but recoverable. Same trade-off as the ws-
 * server's DedupeStore.
 *
 * Why a thin wrapper instead of inlining a Redis SET:
 *   - Tests can stub the dedupe surface without spinning up Redis.
 *   - Key-prefix discipline (`budget:dedupe:`) is centralized so a
 *     future namespace migration is a one-file edit.
 *   - This is the load-bearing template that S18-C1c (ticket
 *     escalation notifications) replicates per AD-S18-6 — keeping the
 *     pattern in a single home prevents drift between budget +
 *     ticket-escalation copies.
 */

// ---------------------------------------------------------------------------
// minimal Redis surface we depend on — strict subset of @aptivo/redis
// WsRedisClient.set + Upstash REST `set(key, value, opts)`. Either
// implementation can adapt to this.
// ---------------------------------------------------------------------------

export interface BudgetDedupeRedis {
  set(
    key: string,
    value: string,
    options: { onlyIfNotExists: true; expirySeconds: number },
  ): Promise<boolean>;
  /**
   * Release a dedupe slot so a retry can succeed. Called when the
   * side-effect that the caller intended to perform (notification
   * send, HITL chain trigger) failed; without releasing, a transient
   * adapter outage at the first crossing would suppress notifications
   * for the entire period (Codex B3 R1 finding).
   */
  del(key: string): Promise<number>;
}

const DEDUPE_KEY_PREFIX = 'budget:dedupe:';

/**
 * Three values capture the three independent dedupe pipelines that
 * share this primitive:
 *   - `warning`: 80%-of-limit notification (one per period)
 *   - `exceeded`: 100%-of-limit notification (one per period)
 *   - `escalation`: HITL exception chain trigger (one per period)
 *
 * Each is a separate key in Redis, so the three pipelines never
 * collide. The `escalation` tag specifically prevents the HITL
 * service from racing the `exceeded` notification — they share the
 * same crossing event but produce different side-effects, so they
 * need independent dedupe slots.
 */
export type BudgetThreshold = 'warning' | 'exceeded' | 'escalation';

export interface BudgetDedupeStore {
  /**
   * Returns `true` on the FIRST observation of `(deptId, period, threshold)`
   * across the cluster (caller fires the side-effect). Returns `false`
   * when the key was already claimed within the TTL.
   *
   * Callers MUST release the slot via `releaseSlot` if their
   * downstream side-effect fails — otherwise a transient outage at
   * the first crossing event suppresses notifications for the whole
   * period.
   */
  shouldFire(input: {
    deptId: string;
    period: string;
    threshold: BudgetThreshold;
  }): Promise<boolean>;

  /**
   * Release a previously-claimed slot so a retry by another replica
   * (or the next call from the same replica) can succeed. Idempotent;
   * returns silently if the key isn't set.
   *
   * Race-window note: between `shouldFire` returning `true` and
   * `releaseSlot` running on failure, other replicas observing the
   * same crossing will see the key set and skip. After `releaseSlot`
   * the next observer wins. The window is bounded by
   * (adapter_call_latency + del_latency); for normal Novu/SMTP
   * latencies this is sub-second, far below the period TTL. Worst
   * case: adapter outage causes one suppressed observation per
   * release-window per replica until the adapter recovers.
   */
  releaseSlot(input: {
    deptId: string;
    period: string;
    threshold: BudgetThreshold;
  }): Promise<void>;
}

export interface BudgetDedupeStoreOptions {
  /**
   * Resolves the TTL (seconds) for a given (deptId, period, threshold).
   * Default is 24h — enough to span a typical period roll-over while
   * bounding key memory if periods are mis-formatted.
   *
   * Production callers should pass a function that returns the
   * remaining seconds in `period` so the key auto-expires precisely
   * when a new period begins.
   */
  readonly resolveTtlSeconds?: (input: {
    deptId: string;
    period: string;
    threshold: BudgetThreshold;
  }) => number;

  readonly logger?: { warn(event: string, ctx?: Record<string, unknown>): void };
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export function createBudgetDedupeStore(
  redis: BudgetDedupeRedis,
  options: BudgetDedupeStoreOptions = {},
): BudgetDedupeStore {
  const resolveTtlSeconds = options.resolveTtlSeconds ?? (() => DEFAULT_TTL_SECONDS);
  const logger = options.logger;

  function buildKey(input: { deptId: string; period: string; threshold: BudgetThreshold }): string {
    return `${DEDUPE_KEY_PREFIX}${input.deptId}:${input.period}:${input.threshold}`;
  }

  return {
    async shouldFire(input) {
      const key = buildKey(input);
      const ttlSeconds = resolveTtlSeconds(input);
      try {
        return await redis.set(key, '1', {
          onlyIfNotExists: true,
          expirySeconds: ttlSeconds,
        });
      } catch (cause) {
        // Fail OPEN — see file header. A Redis hiccup that suppressed
        // every threshold notification would be worse than one extra.
        logger?.warn('budget_dedupe_store_failed', {
          ...input,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
        return true;
      }
    },

    async releaseSlot(input) {
      const key = buildKey(input);
      try {
        await redis.del(key);
      } catch (cause) {
        // Release-failure is logged but not propagated. Worst case:
        // the slot stays claimed until TTL — the same suppression
        // mode the original lossy design had, but only on a Redis
        // outage. The CALLER already failed once; suppressing one
        // more retry until next period is acceptable degradation.
        logger?.warn('budget_dedupe_release_failed', {
          ...input,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// period helpers — exposed for use by services that also need to
// compute the current period in a single source of truth.
// ---------------------------------------------------------------------------

/**
 * Calendar-month period key formatted as `YYYY-MM` (UTC). Different
 * months are different periods; the dedupe key naturally rolls over
 * when the month does.
 */
export function currentMonthPeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Seconds until the start of the next calendar month (UTC). Use as
 * `resolveTtlSeconds` in production so the dedupe key expires exactly
 * when the period rolls over — no carry-over of suppression into the
 * new period.
 */
export function secondsUntilNextMonth(now: Date = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(60, Math.floor((next.getTime() - now.getTime()) / 1000));
}
