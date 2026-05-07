/**
 * S18-A2: cross-transport dedupe store (PER-INSTANCE scope).
 *
 * Purpose: during the `WS_TRANSPORT_MODE=dual` cutover window each
 * ws-server instance receives every event from BOTH the legacy LPUSH
 * list AND the new Streams transport. THIS instance must fan out
 * exactly once per logical event regardless of which transport
 * delivered it first.
 *
 * Scope correction (post-A2 round-2 review): the dedupe key is
 * scoped to the OWNING ws-server instance — `ws:dedupe:<instanceId>:
 * <eventId>`. Earlier draft used a global `ws:dedupe:<eventId>` key
 * which broke the AD-S18-2 broadcast invariant: instance A would
 * claim the SET key, then instance B reading the same XADD entry
 * via its own per-instance consumer group would find the key
 * already set and SKIP publish — only one of N instances actually
 * fanned out.
 *
 * The scope we want is per-(instance, eventId): each instance
 * dedupes its OWN cross-transport arrivals; instances do not
 * dedupe each other.
 *
 * Mechanism:
 *   `SET ws:dedupe:<instanceId>:<eventId> 1 NX EX 3600`
 *   - First writer wins within this instance's keyspace
 *   - 1-hour TTL bounds memory; well above any plausible inter-
 *     transport delivery skew (Inngest retries cap at minutes)
 *
 * Why a thin wrapper instead of inlining the WsRedisClient.set call:
 *   1. Tests can stub the dedupe surface without spinning up the
 *      full @aptivo/redis client.
 *   2. The key-prefix discipline (`ws:dedupe:<instanceId>:`) is
 *      centralized so a future namespace migration is one file edit.
 *   3. Single seam for the future "cross-instance dedupe ring is
 *      down — fall back to in-memory ring" hardening (S19+).
 */

import type { WsRedisClient } from '@aptivo/redis';

const DEDUPE_KEY_PREFIX = 'ws:dedupe:';

/**
 * Default TTL — 1 hour. Bounds memory; well above the tail of
 * Inngest's retry window. Tests can override via the factory option
 * for fast-clock fixtures.
 */
const DEFAULT_TTL_SECONDS = 3600;

export interface DedupeStore {
  /**
   * Returns `true` if this is the FIRST observation of `eventId`
   * (the caller should fan out to clients). Returns `false` on
   * duplicate (the caller should skip — another transport already
   * fanned out, or this is an Inngest retry).
   */
  isFirstObservation(eventId: string): Promise<boolean>;
}

export interface DedupeStoreOptions {
  /**
   * The owning ws-server instance ID. The dedupe key is scoped to
   * this instance so cross-instance broadcasts aren't suppressed (the
   * AD-S18-2 invariant). Required.
   *
   * In tests where the production wiring isn't relevant, callers can
   * pass any non-empty string; the key prefix isolation is the same
   * regardless of value.
   */
  readonly instanceId: string;
  readonly ttlSeconds?: number;
  /**
   * Optional logger for fail-open behaviour: when the Redis SET call
   * itself throws, we fail OPEN (treat as first observation) so a
   * Redis hiccup doesn't lose events. The structured warn surfaces
   * the failure to ops; in production a sustained outage is
   * accompanied by other failure signals from the streams + list
   * subscribers.
   */
  readonly logger?: { warn(event: string, ctx?: Record<string, unknown>): void };
}

export function createDedupeStore(
  redis: WsRedisClient,
  options: DedupeStoreOptions,
): DedupeStore {
  if (!options.instanceId || options.instanceId.trim() === '') {
    throw new Error(
      'createDedupeStore: instanceId is required. ' +
      'Per-instance scoping prevents cross-instance fan-out suppression — caught by ' +
      'A2 round-2 multi-model review.',
    );
  }
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const logger = options.logger;
  const instanceId = options.instanceId;

  return {
    async isFirstObservation(eventId) {
      const key = `${DEDUPE_KEY_PREFIX}${instanceId}:${eventId}`;
      try {
        // SET NX EX — returns true on first writer, false on duplicate
        const setOk = await redis.set(key, '1', {
          onlyIfNotExists: true,
          expirySeconds: ttl,
        });
        return setOk;
      } catch (cause) {
        // Fail OPEN: a Redis SET failure shouldn't suppress fan-out.
        // The alternative (fail closed → drop the event) is the worse
        // failure mode because lost-event-during-Redis-hiccup is
        // user-visible while a duplicate fan-out is at worst a
        // re-render of the same UI state.
        logger?.warn('ws_dedupe_store_failed', {
          eventId,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
        return true;
      }
    },
  };
}
