/**
 * S17-WS-PUB: ws-server Redis-list subscriber.
 *
 * Drains the `ws:events` Redis list (default; configurable) on a
 * polling loop and feeds each envelope into the in-process
 * EventBridge. Companion to the apps/web Inngest publisher
 * (`apps/web/src/lib/inngest/functions/ws-event-publisher.ts`); see
 * that file for the rationale on list-vs-pub-sub.
 *
 * Dedupe: Inngest may retry a publish, so the same `eventId` can land
 * in the queue multiple times. The subscriber keeps a small bounded
 * ring of recently-seen IDs and drops duplicates before calling
 * `bridge.publish`. Ring size defaults to 1024 entries — at 50 RPS
 * that's ~20s of dedupe coverage, well above any normal Inngest
 * retry window.
 *
 * Lifecycle: `start()` schedules the first tick; `stop()` clears the
 * timer and waits for any in-flight tick to settle. The owning ws
 * server invokes `stop()` from its graceful-shutdown path so SIGTERM
 * doesn't leave a poll in flight.
 *
 * Multi-instance ws-server caveat: list semantics are single-consumer
 * per item. Two ws-server instances polling the same list would each
 * see only their share of envelopes — broken fan-out. S17 ships
 * single-instance ws-server only; multi-instance scaling requires
 * either a real pub/sub backend or per-instance fan-out queues
 * (tracked for S18).
 */

import type { EventFrame } from '@aptivo/types';
import { EventFrameSchema } from '@aptivo/types';
import type { EventBridge } from './event-bridge.js';
import type { DedupeStore } from './redis-dedupe-store.js';

// ---------------------------------------------------------------------------
// thin Redis surface — same shape as @upstash/redis `rpop` (string return)
// or `rpop(key, count)` (array return). Implementations either work.
// ---------------------------------------------------------------------------

export interface WsSubscriberRedis {
  /**
   * Removes and returns up to `count` items from the tail of `key`.
   * Tail (RPOP) so we read in the order they were pushed via LPUSH,
   * giving FIFO semantics.
   */
  rpop(key: string, count?: number): Promise<string | string[] | null>;
}

// ---------------------------------------------------------------------------
// dedupe ring
// ---------------------------------------------------------------------------

interface DedupeRing {
  readonly seen: (eventId: string) => boolean;
}

function createDedupeRing(capacity: number): DedupeRing {
  // Set keeps insertion order; eviction = remove first key when full.
  const ring = new Set<string>();
  return {
    seen(eventId) {
      if (ring.has(eventId)) return true;
      ring.add(eventId);
      if (ring.size > capacity) {
        const oldest = ring.values().next().value;
        if (oldest !== undefined) ring.delete(oldest);
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// subscriber
// ---------------------------------------------------------------------------

export interface RedisSubscriberDeps {
  readonly redis: WsSubscriberRedis;
  readonly bridge: EventBridge;
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void };
  /** Redis list key. Must match the publisher's `queueKey`. Default `ws:events`. */
  readonly queueKey?: string;
  /** Polling interval when the queue is empty. Default 100ms. */
  readonly pollIntervalMs?: number;
  /** Items to drain per poll tick. Default 32. */
  readonly batchSize?: number;
  /** EventId ring size for the per-process dedupe ring. Default 1024. */
  readonly dedupeRingSize?: number;
  /**
   * Optional cross-transport dedupe store. When the ws-server runs in
   * `dual` mode (S18-A2 cutover) the SAME `DedupeStore` instance is
   * passed here AND to the streams subscriber so an event arriving via
   * either transport collapses to one fan-out. The local in-process
   * ring still runs first (cheap fast path); the shared SET ring is
   * consulted only when the ring misses. Without this wiring, dual
   * mode silently double-fanned-out every event — caught by Codex +
   * Gemini A2 round-1 review.
   */
  readonly dedupeStore?: DedupeStore;
}

export interface RedisSubscriber {
  start(): void;
  stop(): Promise<void>;
}

const DEFAULTS = {
  queueKey: 'ws:events',
  pollIntervalMs: 100,
  batchSize: 32,
  dedupeRingSize: 1024,
} as const;

export function createRedisSubscriber(deps: RedisSubscriberDeps): RedisSubscriber {
  const queueKey = deps.queueKey ?? DEFAULTS.queueKey;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULTS.pollIntervalMs;
  const batchSize = deps.batchSize ?? DEFAULTS.batchSize;
  const dedupeRing = createDedupeRing(deps.dedupeRingSize ?? DEFAULTS.dedupeRingSize);

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  function parseEnvelope(raw: string): EventFrame | null {
    try {
      const parsed = JSON.parse(raw);
      const result = EventFrameSchema.safeParse(parsed);
      if (!result.success) {
        deps.logger.warn('ws_subscriber_invalid_envelope', {
          error: result.error.message,
        });
        return null;
      }
      return result.data;
    } catch (cause) {
      deps.logger.warn('ws_subscriber_parse_failed', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    let drained = 0;
    try {
      const result = await deps.redis.rpop(queueKey, batchSize);
      if (result == null) return;
      const items = Array.isArray(result) ? result : [result];
      for (const raw of items) {
        const envelope = parseEnvelope(raw);
        if (!envelope) continue;
        if (dedupeRing.seen(envelope.eventId)) continue;
        // dual-mode cross-transport dedupe: when the ws-server runs both
        // transports (list + streams) the shared SET ring is the only
        // way to suppress the same eventId arriving via both paths. The
        // streams subscriber consults the same store; whichever transport
        // observes the event first wins, the other skips publish.
        if (deps.dedupeStore) {
          const isFirst = await deps.dedupeStore.isFirstObservation(envelope.eventId);
          if (!isFirst) continue;
        }
        deps.bridge.publish(envelope);
        drained++;
      }
    } catch (cause) {
      deps.logger.warn('ws_subscriber_poll_failed', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      if (!stopped) {
        // back-to-back drain when the queue had items so we don't pace
        // out under burst; idle interval otherwise.
        const next = drained === batchSize ? 0 : pollIntervalMs;
        timer = setTimeout(() => {
          inFlight = tick();
        }, next);
      }
    }
  }

  return {
    start() {
      if (timer != null) return; // already started
      stopped = false;
      timer = setTimeout(() => {
        inFlight = tick();
      }, 0);
    },
    async stop() {
      stopped = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      // wait for any tick that started before `stopped` flipped
      await inFlight.catch(() => undefined);
    },
  };
}
