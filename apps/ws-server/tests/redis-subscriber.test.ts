/**
 * S17-WS-PUB: ws-server Redis subscriber unit tests
 * @task S17-WS-PUB
 *
 * Verifies the polling drain, dedupe ring, envelope parsing, and
 * lifecycle (start / stop). Real Redis is exercised in the
 * publisher.integration.test.ts end-to-end test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRedisSubscriber,
  type WsSubscriberRedis,
} from '../src/redis-subscriber.js';
import type { EventBridge } from '../src/event-bridge.js';
import type { EventFrame } from '@aptivo/types';

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

function makeRedis(items: string[]): WsSubscriberRedis {
  return {
    rpop: vi.fn(async (_key: string, count?: number) => {
      if (items.length === 0) return null;
      if (count == null) return items.shift() ?? null;
      const out = items.splice(0, count);
      return out.length > 0 ? out : null;
    }),
  };
}

const validEnvelope = (eventId: string, topic = 'workflow/wf-1'): string =>
  JSON.stringify({
    type: 'event',
    topic,
    eventId,
    timestamp: '2026-04-26T10:00:00.000+00:00',
    data: { foo: 'bar' },
  });

describe('S17-WS-PUB: createRedisSubscriber', () => {
  let bridge: ReturnType<typeof makeBridge>;
  let logger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bridge = makeBridge();
    logger = { warn: vi.fn() };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drains the queue and forwards each envelope to the bridge', async () => {
    const redis = makeRedis([validEnvelope('e1'), validEnvelope('e2')]);
    const sub = createRedisSubscriber({ redis, bridge, logger, pollIntervalMs: 50 });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);

    expect(bridge.published.map((e) => e.eventId)).toEqual(['e1', 'e2']);
    await sub.stop();
  });

  it('deduplicates by eventId — same envelope published twice → one fan-out', async () => {
    const redis = makeRedis([validEnvelope('e1'), validEnvelope('e1')]);
    const sub = createRedisSubscriber({ redis, bridge, logger });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(bridge.published).toHaveLength(1);
    await sub.stop();
  });

  it('preserves dedupe across separate poll ticks', async () => {
    // first tick has e1; second tick has e1 again (Inngest retry)
    let tick = 0;
    const redis: WsSubscriberRedis = {
      rpop: vi.fn(async () => {
        tick++;
        if (tick === 1) return [validEnvelope('e1')];
        if (tick === 2) return [validEnvelope('e1')];
        return null;
      }),
    };
    const sub = createRedisSubscriber({ redis, bridge, logger, pollIntervalMs: 50 });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(60);

    expect(bridge.published).toHaveLength(1);
    await sub.stop();
  });

  it('drops malformed JSON and logs ws_subscriber_parse_failed without crashing the loop', async () => {
    const redis = makeRedis(['{not-json', validEnvelope('e1')]);
    const sub = createRedisSubscriber({ redis, bridge, logger });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(bridge.published).toHaveLength(1);
    expect(bridge.published[0]!.eventId).toBe('e1');
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_subscriber_parse_failed',
      expect.any(Object),
    );
    await sub.stop();
  });

  it('drops envelopes failing schema validation and logs ws_subscriber_invalid_envelope', async () => {
    const bad = JSON.stringify({ type: 'event', topic: 'x', eventId: 'e1' /* missing timestamp + data */ });
    const redis = makeRedis([bad, validEnvelope('e2')]);
    const sub = createRedisSubscriber({ redis, bridge, logger });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(bridge.published.map((e) => e.eventId)).toEqual(['e2']);
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_subscriber_invalid_envelope',
      expect.any(Object),
    );
    await sub.stop();
  });

  it('handles a Redis poll failure by logging and continuing the next tick', async () => {
    let tick = 0;
    const redis: WsSubscriberRedis = {
      rpop: vi.fn(async () => {
        tick++;
        if (tick === 1) throw new Error('connection refused');
        if (tick === 2) return [validEnvelope('e1')];
        return null;
      }),
    };
    const sub = createRedisSubscriber({ redis, bridge, logger, pollIntervalMs: 50 });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);

    expect(logger.warn).toHaveBeenCalledWith(
      'ws_subscriber_poll_failed',
      expect.objectContaining({ cause: expect.stringContaining('connection refused') }),
    );
    expect(bridge.published.map((e) => e.eventId)).toEqual(['e1']);
    await sub.stop();
  });

  it('stop() prevents subsequent ticks from publishing', async () => {
    const redis = makeRedis([validEnvelope('e1')]);
    const sub = createRedisSubscriber({ redis, bridge, logger });

    sub.start();
    await sub.stop();
    await vi.advanceTimersByTimeAsync(500);

    expect(bridge.published).toHaveLength(0);
  });

  it('S18-A2: dual-mode shared dedupeStore suppresses cross-transport duplicates', async () => {
    // post-A2 round-1 fix: when the ws-server runs both transports
    // (list + streams) the SAME DedupeStore is passed to both. An
    // event arriving via the list path that the streams subscriber
    // already published must NOT fan out a second time. Earlier
    // implementation used the in-process ring on this side and the
    // Redis SET ring on the streams side — they didn't share state,
    // so duplicates leaked.
    const redis = makeRedis([validEnvelope('e1'), validEnvelope('e2')]);

    // Stub DedupeStore: e1 has already been observed via streams; e2
    // is fresh. The list subscriber should publish e2 only.
    const observed = new Set<string>(['e1']);
    const dedupeStore = {
      isFirstObservation: vi.fn(async (eventId: string) => {
        if (observed.has(eventId)) return false;
        observed.add(eventId);
        return true;
      }),
    };
    const sub = createRedisSubscriber({ redis, bridge, logger, dedupeStore });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(bridge.published.map((e) => e.eventId)).toEqual(['e2']);
    expect(dedupeStore.isFirstObservation).toHaveBeenCalledWith('e1');
    expect(dedupeStore.isFirstObservation).toHaveBeenCalledWith('e2');
    await sub.stop();
  });

  it('S18-A2: dual-mode dedupeStore is consulted only after the local ring misses', async () => {
    // optimization sanity: an event already in the local ring shouldn't
    // hit Redis at all. Saves a round-trip on the hot path.
    const redis = makeRedis([validEnvelope('e1'), validEnvelope('e1')]);
    const dedupeStore = { isFirstObservation: vi.fn(async () => true) };
    const sub = createRedisSubscriber({ redis, bridge, logger, dedupeStore });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    // local ring caught the duplicate — only ONE call to the SET ring
    expect(bridge.published).toHaveLength(1);
    expect(dedupeStore.isFirstObservation).toHaveBeenCalledTimes(1);
    await sub.stop();
  });

  it('evicts the oldest dedupe entry when the ring fills', async () => {
    // ring size 2 → after 3 distinct IDs, the oldest (e1) is no longer remembered
    const redis = makeRedis([
      validEnvelope('e1'),
      validEnvelope('e2'),
      validEnvelope('e3'),
      // e1 again — should re-publish because the ring evicted it
      validEnvelope('e1'),
    ]);
    const sub = createRedisSubscriber({
      redis,
      bridge,
      logger,
      dedupeRingSize: 2,
    });

    sub.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(bridge.published.map((e) => e.eventId)).toEqual(['e1', 'e2', 'e3', 'e1']);
    await sub.stop();
  });
});
