/**
 * S17-WS-PUB: Inngest → Redis publisher for WebSocket fan-out.
 *
 * Reads selected platform events (workflow + HITL today; ticket
 * events arrive with Epic 4) and publishes them as `EventFrame`
 * envelopes onto a single Redis list (`ws:events` by default). The
 * `apps/ws-server` polling subscriber drains the list and feeds each
 * envelope into its in-process EventBridge for fan-out to subscribed
 * clients. Closes Sprint-16 enablement gate #6.
 *
 * Why list-based and not pub/sub: Upstash Redis (this repo's REST
 * client) does not support persistent SUBSCRIBE connections. A list
 * with LPUSH (publisher) + RPOP (subscriber polling) gives FIFO
 * semantics that work over plain HTTP. Single-instance ws-server
 * fan-out is correct; multi-instance horizontal scaling is a known
 * limitation tracked for S18.
 *
 * Dedupe is the subscriber's responsibility (eventId ring) — the
 * publisher writes an envelope per Inngest invocation, and Inngest's
 * own retry semantics may cause the same logical event to land in
 * the queue more than once.
 */

import { randomUUID } from 'node:crypto';
import type { Inngest } from 'inngest';
import type { EventFrame } from '@aptivo/types';

// ---------------------------------------------------------------------------
// thin Redis surface — only what the publisher uses, so tests can stub
// without pulling the full @upstash/redis client shape
// ---------------------------------------------------------------------------

export interface WsPublisherRedis {
  lpush(key: string, value: string): Promise<number>;
}

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
  readonly redis: WsPublisherRedis;
  readonly logger: { warn(event: string, ctx?: Record<string, unknown>): void };
  /** Redis list key. Default `ws:events`. */
  readonly queueKey?: string;
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
 */
export function createWsEventPublisherFunctions(deps: WsEventPublisherDeps) {
  const queueKey = deps.queueKey ?? DEFAULT_QUEUE_KEY;
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

        await step.run('publish-to-redis', async () => {
          try {
            await deps.redis.lpush(queueKey, JSON.stringify(envelope));
          } catch (cause) {
            deps.logger.warn('ws_event_publish_failed', {
              eventId,
              topic,
              event: desc.event,
              cause: cause instanceof Error ? cause.message : String(cause),
            });
            throw cause; // propagate so Inngest retries
          }
        });

        return { topic, eventId, queueKey };
      },
    ),
  );
}
