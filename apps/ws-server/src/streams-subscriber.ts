/**
 * S18-A2: ws-server Redis-Streams subscriber.
 *
 * Companion to the apps/web Streams publisher
 * (apps/web/src/lib/inngest/functions/ws-event-publisher.ts in
 * `streams` or `dual` mode). Reads from the `ws:events` stream via
 * XREADGROUP and feeds each envelope into the in-process EventBridge.
 *
 * Per AD-S18-2: each ws-server instance creates its OWN consumer
 * group, NOT a shared group. XREADGROUP with a shared group is
 * work-distribution; per-instance groups give every instance its own
 * cursor against the single stream → broadcast fan-out (the
 * load-bearing claim of A2).
 *
 * Group naming: `ws-instance-<WS_INSTANCE_ID>` where WS_INSTANCE_ID
 * comes from the env var of the same name. When env is missing, the
 * subscriber refuses to boot rather than silently joining a shared
 * group.
 *
 * Lifecycle on boot:
 *   1. xgroupCreate(stream, 'ws-instance-<id>', '$')
 *      MKSTREAM is implicit so first-instance startup before any
 *      XADD doesn't fail. `$` cursor means "deliver only entries
 *      added AFTER this group was created" — per AD-S18-2, lost-
 *      while-down events are NOT replayed (same single-instance
 *      trade-off as S17, no XAUTOCLAIM).
 *   2. start() schedules the first tick.
 *
 * Each tick:
 *   1. XREADGROUP with COUNT=batchSize, BLOCK=blockMs
 *   2. For each entry: parse envelope, consult dedupeStore
 *      (cross-transport dedupe via Redis SET NX EX), bridge.publish
 *      on first observation
 *   3. Loop continues unless stop() flipped the running flag
 *
 * Note on PEL/ACK semantics (post-A2 round-1 review): XREADGROUP does
 * NOT auto-ack. Without explicit XACK calls, the Pending Entry List
 * (PEL) for healthy groups grows unbounded, eventually exhausting
 * Redis memory. Per AD-S18-2 ws-server uses at-most-once delivery
 * (lost-during-crash events accept the same trade-off as the S17 list
 * subscriber), so we pass `NOACK` to XREADGROUP instead of XACK-ing
 * each entry — Redis skips the PEL entirely. The earlier draft of
 * this file claimed "auto-acked"; that was wrong, and Codex+Gemini
 * round-1 multi-model review caught it before TCP Redis went live.
 *
 * Cleanup: stop() clears the polling timer + awaits any in-flight
 * tick. Group cleanup (XGROUP DESTROY for orphaned groups) is the
 * runbook procedure — not done automatically on normal stop because
 * a managed restart should resume the same group on next boot.
 */

import type { EventFrame } from '@aptivo/types';
import { EventFrameSchema } from '@aptivo/types';
import type { WsRedisClient } from '@aptivo/redis';
import type { EventBridge } from './event-bridge.js';
import type { DedupeStore } from './redis-dedupe-store.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface StreamsSubscriberDeps {
  /** TCP-Redis client (XADD producer side runs in apps/web; this side reads via XREADGROUP) */
  readonly redis: WsRedisClient;
  /** Cross-transport dedupe store (SET NX EX). Required: single-source of truth for "is this the first observation of eventId". */
  readonly dedupeStore: DedupeStore;
  readonly bridge: EventBridge;
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void; info?(event: string, ctx?: Record<string, unknown>): void };
  /**
   * `WS_INSTANCE_ID` — must be unique per ws-server process. Group
   * name is derived as `ws-instance-<instanceId>`. When env is
   * missing the factory throws; silent default would partition
   * traffic across instances (the bug we're fixing).
   */
  readonly instanceId: string;
  /** Stream name. Must match the publisher's `streamName`. Default `ws:events`. */
  readonly streamName?: string;
  /** Number of entries per XREADGROUP call. Default 32. */
  readonly batchSize?: number;
  /** BLOCK timeout (ms) on XREADGROUP. Default 100ms. */
  readonly blockMs?: number;
  /** Polling interval when the stream is empty. Default 100ms (mirrors list subscriber). */
  readonly idleIntervalMs?: number;
}

export interface StreamsSubscriber {
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const DEFAULTS = {
  streamName: 'ws:events',
  batchSize: 32,
  blockMs: 100,
  idleIntervalMs: 100,
} as const;

export function createStreamsSubscriber(deps: StreamsSubscriberDeps): StreamsSubscriber {
  if (!deps.instanceId || deps.instanceId.trim() === '') {
    throw new Error(
      'createStreamsSubscriber: instanceId is required. ' +
      'Set WS_INSTANCE_ID per process; missing or empty values would partition traffic ' +
      'across instances (the AD-S18-2 broadcast-fan-out invariant requires per-instance groups).',
    );
  }

  const streamName = deps.streamName ?? DEFAULTS.streamName;
  const groupName = `ws-instance-${deps.instanceId}`;
  const batchSize = deps.batchSize ?? DEFAULTS.batchSize;
  const blockMs = deps.blockMs ?? DEFAULTS.blockMs;
  const idleIntervalMs = deps.idleIntervalMs ?? DEFAULTS.idleIntervalMs;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  function parseEnvelope(raw: string): EventFrame | null {
    try {
      const parsed = JSON.parse(raw);
      const result = EventFrameSchema.safeParse(parsed);
      if (!result.success) {
        deps.logger.warn('ws_streams_invalid_envelope', {
          error: result.error.message,
        });
        return null;
      }
      return result.data;
    } catch (cause) {
      deps.logger.warn('ws_streams_parse_failed', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    let delivered = 0;
    try {
      const result = await deps.redis.xreadgroup(streamName, groupName, 'consumer-default', {
        count: batchSize,
        blockMs,
        // NOACK — at-most-once per AD-S18-2; without it the PEL
        // grows unbounded for healthy groups (Codex+Gemini A2 R1).
        noAck: true,
      });
      if (result === null || result.entries.length === 0) return;

      for (const entry of result.entries) {
        // Stream entry shape (per the publisher in slice 2):
        //   data: { envelope: <json string>, eventId: <ulid|uuid> }
        const envelopeJson = entry.data['envelope'];
        if (typeof envelopeJson !== 'string') {
          deps.logger.warn('ws_streams_missing_envelope_field', {
            entryId: entry.id,
            keys: Object.keys(entry.data),
          });
          continue;
        }
        const envelope = parseEnvelope(envelopeJson);
        if (!envelope) continue;

        // cross-transport dedupe — see redis-dedupe-store.ts for the
        // SET NX EX rationale. Returns true on first observation.
        const isFirst = await deps.dedupeStore.isFirstObservation(envelope.eventId);
        if (!isFirst) continue;

        deps.bridge.publish(envelope);
        delivered++;
      }
    } catch (cause) {
      deps.logger.warn('ws_streams_poll_failed', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      if (!stopped) {
        // back-to-back drain when the batch was full so we don't pace
        // out under burst; idle interval otherwise.
        const next = delivered === batchSize ? 0 : idleIntervalMs;
        timer = setTimeout(() => {
          inFlight = tick();
        }, next);
      }
    }
  }

  return {
    async start() {
      if (timer != null) return; // already started
      stopped = false;
      // create the group — idempotent (BUSYGROUP swallowed inside the
      // tcp impl). MKSTREAM is implicit so we don't crash on first
      // boot before any XADD.
      try {
        await deps.redis.xgroupCreate(streamName, groupName, '$');
        deps.logger.info?.('ws_streams_group_ready', { stream: streamName, group: groupName });
      } catch (cause) {
        // Group create failure is fatal — without the group we can't
        // call XREADGROUP. Surface to the bootstrap so the process
        // exits and an orchestrator restart kicks in.
        deps.logger.warn('ws_streams_group_create_failed', {
          stream: streamName,
          group: groupName,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
        throw cause;
      }
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
      await inFlight.catch(() => undefined);
    },
  };
}
