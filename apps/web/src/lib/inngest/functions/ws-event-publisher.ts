/**
 * S17-WS-PUB + S18-A2: Inngest → Redis publisher for WebSocket
 * fan-out, with multi-instance support via TCP Redis Streams.
 *
 * Reads selected platform events (workflow + HITL today; ticket
 * events arrive with Epic 4) and publishes them as `EventFrame`
 * envelopes. Two transports, mode-selected via `WS_TRANSPORT_MODE`:
 *
 *   - `list` (S17 default): LPUSH onto the `ws:events` list. Single-
 *     consumer per item — broken multi-instance fan-out, but works
 *     against Upstash REST.
 *   - `streams` (S18-A2 target): XADD onto the `ws:events` stream.
 *     Per-instance consumer groups in apps/ws-server give every
 *     instance its own cursor → broadcast fan-out (per AD-S18-2).
 *   - `dual` (S18-A2 cutover): writes to BOTH for a 24h window.
 *     Subscribers read both transports and dedupe by `eventId` via
 *     the shared Redis-SET dedupe ring (1h TTL). After 24h, ops
 *     flips to `streams`. Default zero-downtime cutover path.
 *
 * Why list-based was the S17 only path: Upstash Redis (this repo's
 * REST client) does not support persistent SUBSCRIBE connections or
 * Streams. A list with LPUSH + RPOP gave FIFO semantics over plain
 * HTTP but couldn't fan out to multiple ws-server instances. S18 adds
 * TCP Redis (ioredis-backed) for the streams path; the list path
 * stays for environments still on Upstash REST.
 *
 * Dedupe is the subscriber's responsibility (eventId ring + Redis
 * SET during cutover) — the publisher writes an envelope per Inngest
 * invocation, and Inngest's own retry semantics may cause the same
 * logical event to land in either transport more than once.
 */

import { randomUUID } from 'node:crypto';
import type { Inngest } from 'inngest';
import type { EventFrame } from '@aptivo/types';
import type { WsRedisClient } from '@aptivo/redis';

// ---------------------------------------------------------------------------
// transport surface — `WsPublisherRedis` is the legacy LPUSH-only
// shape (S17, kept for back-compat); `WsRedisClient` from @aptivo/redis
// is the streams-capable shape used in `dual` and `streams` modes.
// ---------------------------------------------------------------------------

export interface WsPublisherRedis {
  lpush(key: string, value: string): Promise<number>;
}

/**
 * Transport mode selected by `WS_TRANSPORT_MODE` env var. Default
 * `list` preserves S17 behaviour. `dual` is the recommended
 * production cutover path (zero-downtime); `streams` is the post-
 * cutover steady state once ops verifies fan-out via the staging
 * smoke test.
 */
export type WsTransportMode = 'list' | 'dual' | 'streams';

/**
 * MAXLEN cap on the streams transport. Per AD-S18-2, ~50000 entries
 * bounds memory while leaving plenty of headroom for retry storms.
 */
export const WS_STREAM_MAXLEN = 50_000;
export const WS_STREAM_NAME_DEFAULT = 'ws:events';

// ---------------------------------------------------------------------------
// envelope helpers
// ---------------------------------------------------------------------------

/**
 * Builds a frozen-v1.0 EventFrame envelope. Pure — exposed for unit
 * tests so the topic-derivation logic can be exercised without
 * spinning up Inngest.
 */
export function buildEnvelope(input: {
  topic: string;
  eventId: string;
  data: unknown;
  now?: () => Date;
}): EventFrame {
  const now = input.now ?? (() => new Date());
  return {
    type: 'event',
    topic: input.topic,
    eventId: input.eventId,
    timestamp: now().toISOString(),
    data: input.data,
  };
}

// ---------------------------------------------------------------------------
// per-event handler config
// ---------------------------------------------------------------------------

interface PublisherDescriptor {
  /** Inngest function id — must be globally unique. */
  readonly id: string;
  /** Inngest event name to subscribe to. */
  readonly event: string;
  /** Derives the WS topic from the event payload (e.g. `workflow/<id>`). */
  readonly toTopic: (data: Record<string, unknown>) => string;
}

const DESCRIPTORS: readonly PublisherDescriptor[] = [
  // workflow/orchestration: parents subscribe to their child progress
  {
    id: 'ws-publish-workflow-spawned',
    event: 'workflow/child.spawned',
    toTopic: (d) => `workflow/${d['parentWorkflowId']}`,
  },
  {
    id: 'ws-publish-workflow-completed',
    event: 'workflow/child.completed',
    toTopic: (d) => `workflow/${d['parentWorkflowId']}`,
  },
  // HITL multi-approver lifecycle
  {
    id: 'ws-publish-hitl-requested',
    event: 'hitl/multi.approval.requested',
    toTopic: (d) => `hitl/${d['requestId']}`,
  },
  {
    id: 'ws-publish-hitl-finalized',
    event: 'hitl/multi.decision.finalized',
    toTopic: (d) => `hitl/${d['requestId']}`,
  },
  {
    id: 'ws-publish-hitl-changes',
    event: 'hitl/changes.requested',
    toTopic: (d) => `hitl/${d['requestId']}`,
  },
];

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export interface WsEventPublisherDeps {
  readonly inngest: Inngest;
  /**
   * Legacy LPUSH transport. Required when `mode` is `list` or
   * `dual`. Optional when `mode` is `streams`-only.
   */
  readonly redis?: WsPublisherRedis;
  /**
   * Streams transport (TCP Redis via @aptivo/redis). Required when
   * `mode` is `streams` or `dual`. Optional when `mode` is `list`.
   */
  readonly streams?: WsRedisClient;
  /**
   * Transport mode. Default `list` preserves S17 behaviour. `dual`
   * writes both transports for the cutover window; `streams` is the
   * post-cutover steady state. Typically derived from
   * `process.env.WS_TRANSPORT_MODE` at the composition root.
   */
  readonly mode?: WsTransportMode;
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void };
  /** Redis list key (LPUSH path). Default `ws:events`. */
  readonly queueKey?: string;
  /** Redis stream name (XADD path). Default `ws:events`. */
  readonly streamName?: string;
  /** Test-only override; defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

const DEFAULT_QUEUE_KEY = 'ws:events';

/**
 * Returns one Inngest function per WS-relevant platform event. Each
 * function publishes a single envelope on success; on Redis error,
 * throws so Inngest retries the function (default 3 retries with
 * exponential backoff). The structured warn is emitted on every
 * failure attempt so ops can see throughput drops in logs.
 *
 * Mode semantics (controlled by `deps.mode`):
 *   - `list`: LPUSH only (S17 path; back-compat)
 *   - `dual`: LPUSH + XADD (cutover window; subscribers dedupe by
 *     eventId via shared Redis SET ring)
 *   - `streams`: XADD only (post-cutover steady state)
 *
 * In `dual` mode, a failure on either transport throws and Inngest
 * retries — the subscriber's eventId dedupe handles the case where
 * the first transport succeeded and the retry attempts it again.
 * Both transports are awaited sequentially (LPUSH first); reordering
 * to parallel-write is a S20+ optimization once production data
 * shows the latency matters.
 */
export function createWsEventPublisherFunctions(deps: WsEventPublisherDeps) {
  const mode: WsTransportMode = deps.mode ?? 'list';
  const queueKey = deps.queueKey ?? DEFAULT_QUEUE_KEY;
  const streamName = deps.streamName ?? WS_STREAM_NAME_DEFAULT;

  // Validate the deps shape against the requested mode at factory
  // time so misconfiguration fails loudly at startup rather than on
  // the first event.
  if ((mode === 'list' || mode === 'dual') && !deps.redis) {
    throw new Error(
      `ws-event-publisher: mode='${mode}' requires deps.redis (LPUSH transport)`,
    );
  }
  if ((mode === 'streams' || mode === 'dual') && !deps.streams) {
    throw new Error(
      `ws-event-publisher: mode='${mode}' requires deps.streams (XADD transport)`,
    );
  }

  return DESCRIPTORS.map((desc) =>
    deps.inngest.createFunction(
      { id: desc.id, retries: 3 },
      { event: desc.event },
      async ({ event, step }) => {
        const data = (event.data ?? {}) as Record<string, unknown>;
        const topic = desc.toTopic(data);
        // Inngest assigns event.id as a globally-unique ULID per
        // delivered event — perfect for the subscriber's dedupe ring.
        // Multi-model review (S17_WS_PUB_MULTI_REVIEW) flagged that the
        // earlier `${event}:${Date.now()}` fallback collides at sub-ms
        // throughput, so a missing event.id falls back to randomUUID
        // instead — still unique, never aliases two distinct events.
        const eventId = ((event as { id?: string }).id ?? randomUUID());

        const envelope = buildEnvelope({ topic, eventId, data, now: deps.now });
        const envelopeJson = JSON.stringify(envelope);

        await step.run('publish-to-redis', async () => {
          try {
            // `list` and `dual` modes write the LPUSH transport first
            // for ordering parity with S17 — subscribers running
            // older code paths see the event via RPOP without delay.
            if (mode === 'list' || mode === 'dual') {
              await deps.redis!.lpush(queueKey, envelopeJson);
            }
            if (mode === 'streams' || mode === 'dual') {
              // Stream entries carry the structured envelope as a
              // single field for symmetry with the list payload —
              // subscribers parse JSON regardless of transport. The
              // alternative (one stream field per envelope key) would
              // bloat the on-the-wire shape and complicate dedupe.
              await deps.streams!.xadd(
                streamName,
                { envelope: envelopeJson, eventId },
                { maxLen: WS_STREAM_MAXLEN },
              );
            }
          } catch (cause) {
            deps.logger.warn('ws_event_publish_failed', {
              eventId,
              topic,
              event: desc.event,
              mode,
              cause: cause instanceof Error ? cause.message : String(cause),
            });
            throw cause; // propagate so Inngest retries
          }
        });

        return { topic, eventId, queueKey, mode };
      },
    ),
  );
}
