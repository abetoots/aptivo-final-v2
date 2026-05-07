/**
 * S18-A2: cross-transport dedupe store.
 *
 * During the `WS_TRANSPORT_MODE=dual` cutover window, each ws-server
 * instance receives every event from BOTH the legacy LPUSH list AND
 * the new Streams transport. The subscriber MUST fan out exactly
 * once per logical event regardless of which transport delivered it
 * first.
 *
 * Mechanism:
 *   `SET ws:dedupe:<eventId> 1 NX EX 3600`
 *   - First writer wins (NX → only-if-not-exists)
 *   - 1-hour TTL bounds memory; well above any plausible inter-
 *     transport delivery skew (Inngest retries cap at minutes)
 *
 * Cross-process semantics: the SET runs in TCP Redis, shared across
 * all ws-server instances + both subscribers within each instance.
 * So even with two ws-server instances each running BOTH transports,
 * the dedupe is global per-eventId.
 *
 * Why a thin wrapper instead of inlining the WsRedisClient.set call:
 *   1. Tests can stub the dedupe surface without spinning up the
 *      full @aptivo/redis client.
 *   2. The key-prefix discipline (`ws:dedupe:`) is centralized so a
 *      future migration to a different namespace is a one-file edit.
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
  options: DedupeStoreOptions = {},
): DedupeStore {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const logger = options.logger;

  return {
    async isFirstObservation(eventId) {
      const key = `${DEDUPE_KEY_PREFIX}${eventId}`;
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
