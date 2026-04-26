/**
 * S17-WS-PUB: end-to-end fan-out integration test
 * @task S17-WS-PUB
 *
 * Round-trips a publish through a stub Redis (in-memory list) shared
 * between an apps/web-style publisher and the ws-server subscriber:
 *
 *   build envelope → lpush(ws:events) → subscriber.rpop → bridge.publish
 *
 * Real WebSocket fan-out is covered by `server.integration.test.ts`;
 * this file proves the cross-process plumbing works end-to-end with
 * the same envelope shape both sides agree on.
 *
 * Real Upstash Redis is not exercised here — the contract under test
 * is "publisher writes envelope, subscriber reads envelope, bridge
 * fans out", which is independent of the transport.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRedisSubscriber,
  type WsSubscriberRedis,
} from '../src/redis-subscriber.js';
import type { EventBridge } from '../src/event-bridge.js';
import type { EventFrame } from '@aptivo/types';

/**
 * Minimal in-memory Redis stub implementing only LPUSH (publisher
 * side) and RPOP-by-count (subscriber side). Both sides hit the same
 * underlying list — exactly the production layout.
 */
function createInMemoryRedisQueue() {
  const lists = new Map<string, string[]>();
  return {
    publisher: {
      lpush(key: string, value: string): Promise<number> {
        const list = lists.get(key) ?? [];
        list.unshift(value);
        lists.set(key, list);
        return Promise.resolve(list.length);
      },
    },
    subscriber: {
      rpop(key: string, count?: number): Promise<string | string[] | null> {
        const list = lists.get(key);
        if (!list || list.length === 0) return Promise.resolve(null);
        if (count == null) {
          return Promise.resolve(list.pop() ?? null);
        }
        const out: string[] = [];
        for (let i = 0; i < count; i++) {
          const v = list.pop();
          if (v === undefined) break;
          out.push(v);
        }
        return Promise.resolve(out.length > 0 ? out : null);
      },
    } satisfies WsSubscriberRedis,
    snapshot: (key: string) => [...(lists.get(key) ?? [])],
  };
}

function makeBridge(): EventBridge & { published: EventFrame[] } {
  const published: EventFrame[] = [];
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    publish: (event) => {
      published.push(event);
    },
    connectionCount: () => 0,
    published,
  };
}

describe('S17-WS-PUB: publisher → Redis → subscriber → bridge integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a single envelope from publisher.lpush to bridge.publish', async () => {
    const queue = createInMemoryRedisQueue();
    const bridge = makeBridge();
    const sub = createRedisSubscriber({
      redis: queue.subscriber,
      bridge,
      logger: { warn: vi.fn() },
      pollIntervalMs: 50,
    });

    sub.start();

    const envelope: EventFrame = {
      type: 'event',
      topic: 'workflow/wf-42',
      eventId: '01HW1ABCD',
      timestamp: '2026-04-26T10:00:00.000+00:00',
      data: { parentWorkflowId: 'wf-42', childWorkflowId: 'wf-43' },
    };
    await queue.publisher.lpush('ws:events', JSON.stringify(envelope));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);

    expect(bridge.published).toEqual([envelope]);
    expect(queue.snapshot('ws:events')).toEqual([]);

    await sub.stop();
  });

  it('preserves FIFO order across multiple publishes', async () => {
    const queue = createInMemoryRedisQueue();
    const bridge = makeBridge();
    const sub = createRedisSubscriber({
      redis: queue.subscriber,
      bridge,
      logger: { warn: vi.fn() },
      pollIntervalMs: 50,
    });

    sub.start();

    for (let i = 1; i <= 3; i++) {
      await queue.publisher.lpush('ws:events', JSON.stringify({
        type: 'event',
        topic: `hitl/req-${i}`,
        eventId: `evt-${i}`,
        timestamp: '2026-04-26T10:00:00.000+00:00',
        data: { requestId: `req-${i}` },
      }));
    }

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);

    expect(bridge.published.map((e) => e.eventId)).toEqual(['evt-1', 'evt-2', 'evt-3']);
    await sub.stop();
  });

  it('a duplicate publish (Inngest retry) results in a single bridge.publish call', async () => {
    const queue = createInMemoryRedisQueue();
    const bridge = makeBridge();
    const sub = createRedisSubscriber({
      redis: queue.subscriber,
      bridge,
      logger: { warn: vi.fn() },
      pollIntervalMs: 50,
    });

    sub.start();

    const envelope = {
      type: 'event' as const,
      topic: 'hitl/req-9',
      eventId: 'duplicate-id',
      timestamp: '2026-04-26T10:00:00.000+00:00',
      data: { requestId: 'req-9' },
    };
    await queue.publisher.lpush('ws:events', JSON.stringify(envelope));
    await queue.publisher.lpush('ws:events', JSON.stringify(envelope));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);

    expect(bridge.published).toHaveLength(1);
    await sub.stop();
  });
});
