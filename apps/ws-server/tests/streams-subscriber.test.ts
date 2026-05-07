/**
 * S18-A2: streams subscriber tests.
 *
 * Coverage:
 *   - factory throws when instanceId is missing/empty (the AD-S18-2
 *     invariant: per-instance group required)
 *   - start() creates the per-instance consumer group
 *   - tick consumes batched entries and feeds bridge.publish
 *   - dedupe via isFirstObservation: duplicate eventIds skip publish
 *   - PER-INSTANCE FAN-OUT: two subscribers with distinct
 *     instanceIds against the same stream both receive every entry
 *     (the load-bearing AD-S18-2 claim)
 *   - parse failures swallowed with warn; subscriber keeps polling
 *   - stop() cancels timer + awaits in-flight tick
 */

import { describe, it, expect, vi } from 'vitest';
import { createInMemoryWsRedis } from '@aptivo/redis';
import { createStreamsSubscriber } from '../src/streams-subscriber.js';
import { createDedupeStore } from '../src/redis-dedupe-store.js';
import type { EventBridge } from '../src/event-bridge.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeBridge(): { bridge: EventBridge; published: unknown[] } {
  const published: unknown[] = [];
  return {
    published,
    bridge: { publish: (e) => { published.push(e); } },
  };
}

function makeLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
  };
}

function envelopeJson(eventId: string, topic = 'workflow/wf-1') {
  return JSON.stringify({
    type: 'event',
    topic,
    eventId,
    timestamp: '2026-04-29T12:00:00.000Z',
    data: { ok: true },
  });
}

// utility — settle pending timers without using fake timers (the
// in-memory subscriber uses real setTimeout)
async function flushTicks(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// factory validation
// ---------------------------------------------------------------------------

describe('S18-A2: createStreamsSubscriber — factory validation', () => {
  it('throws when instanceId is empty (per-instance group required)', () => {
    const redis = createInMemoryWsRedis();
    const { bridge } = makeBridge();
    expect(() =>
      createStreamsSubscriber({
        redis,
        dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
        bridge,
        logger: makeLogger(),
        instanceId: '',
      }),
    ).toThrow(/instanceId is required/);
  });

  it('throws when instanceId is whitespace-only', () => {
    const redis = createInMemoryWsRedis();
    const { bridge } = makeBridge();
    expect(() =>
      createStreamsSubscriber({
        redis,
        dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
        bridge,
        logger: makeLogger(),
        instanceId: '   ',
      }),
    ).toThrow(/instanceId is required/);
  });

  it('accepts a non-empty instanceId', () => {
    const redis = createInMemoryWsRedis();
    const { bridge } = makeBridge();
    expect(() =>
      createStreamsSubscriber({
        redis,
        dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
        bridge,
        logger: makeLogger(),
        instanceId: 'A',
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// start: group creation
// ---------------------------------------------------------------------------

describe('S18-A2: createStreamsSubscriber — start creates per-instance consumer group', () => {
  it('creates the group ws-instance-<instanceId> on start', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge } = makeBridge();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger: makeLogger(),
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 50,
    });

    await sub.start();
    expect(redis._groupCount('ws:events')).toBe(1);
    await sub.stop();
  });

  it('group create errors are surfaced (fatal — process should restart)', async () => {
    const redis = createInMemoryWsRedis();
    redis.xgroupCreate = vi.fn().mockRejectedValue(new Error('connection refused'));

    const { bridge } = makeBridge();
    const logger = makeLogger();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger,
      instanceId: 'inst-B',
    });

    await expect(sub.start()).rejects.toThrow(/connection refused/);
    expect(logger.warn).toHaveBeenCalledWith(
      'ws_streams_group_create_failed',
      expect.objectContaining({ stream: 'ws:events', group: 'ws-instance-inst-B' }),
    );
  });
});

// ---------------------------------------------------------------------------
// consumption + fan-out
// ---------------------------------------------------------------------------

describe('S18-A2: createStreamsSubscriber — consumes entries, dedupes, feeds bridge', () => {
  it('consumes a batched entry and calls bridge.publish on first observation', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge, published } = makeBridge();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger: makeLogger(),
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    // publish into the stream from the producer side
    await redis.xadd('ws:events', { envelope: envelopeJson('evt-1'), eventId: 'evt-1' });

    await flushTicks(80);
    await sub.stop();

    expect(published).toHaveLength(1);
    expect((published[0] as { eventId: string }).eventId).toBe('evt-1');
  });

  it('dedupes duplicate eventIds across ticks (cross-transport dedupe)', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge, published } = makeBridge();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger: makeLogger(),
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    // same eventId arriving twice (e.g., publisher retried)
    await redis.xadd('ws:events', { envelope: envelopeJson('evt-dup'), eventId: 'evt-dup' });
    await redis.xadd('ws:events', { envelope: envelopeJson('evt-dup'), eventId: 'evt-dup' });

    await flushTicks(80);
    await sub.stop();

    expect(published).toHaveLength(1); // dedupe collapsed to one publish
  });

  it('AD-S18-2 invariant: TWO subscribers against the SAME Redis both receive every entry (broadcast fan-out, per-instance dedupe)', async () => {
    // Load-bearing for A2. Earlier draft used SEPARATE in-memory Redis
    // instances for each subscriber's dedupe store, which masked
    // Codex round-2's catch: a global `ws:dedupe:<eventId>` key would
    // have one instance suppress the others' publishes. Post-fix the
    // dedupe key is `ws:dedupe:<instanceId>:<eventId>`, so two
    // instances against the SHARED Redis still both fan out.
    const redis = createInMemoryWsRedis();

    const a = makeBridge();
    const b = makeBridge();

    const subA = createStreamsSubscriber({
      redis,
      // SAME redis backing each dedupe store; distinct instanceIds
      // keep their keyspaces independent.
      dedupeStore: createDedupeStore(redis, { instanceId: 'A' }),
      bridge: a.bridge,
      logger: makeLogger(),
      instanceId: 'A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    const subB = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'B' }),
      bridge: b.bridge,
      logger: makeLogger(),
      instanceId: 'B',
      blockMs: 0,
      idleIntervalMs: 30,
    });

    await subA.start();
    await subB.start();

    // Publish 3 distinct events
    await redis.xadd('ws:events', { envelope: envelopeJson('e1'), eventId: 'e1' });
    await redis.xadd('ws:events', { envelope: envelopeJson('e2'), eventId: 'e2' });
    await redis.xadd('ws:events', { envelope: envelopeJson('e3'), eventId: 'e3' });

    await flushTicks(120);
    await subA.stop();
    await subB.stop();

    // Both subscribers received all 3 events — broadcast fan-out via per-instance groups
    expect(a.published).toHaveLength(3);
    expect(b.published).toHaveLength(3);
    expect((a.published as Array<{ eventId: string }>).map((e) => e.eventId).sort()).toEqual(['e1', 'e2', 'e3']);
    expect((b.published as Array<{ eventId: string }>).map((e) => e.eventId).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('parse failures swallowed with warn; subscriber keeps polling', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge, published } = makeBridge();
    const logger = makeLogger();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger,
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    // bad envelope (invalid JSON) followed by a valid one — subscriber should skip the bad and process the good
    await redis.xadd('ws:events', { envelope: 'NOT JSON', eventId: 'bad' });
    await redis.xadd('ws:events', { envelope: envelopeJson('good'), eventId: 'good' });

    await flushTicks(80);
    await sub.stop();

    expect(logger.warn).toHaveBeenCalledWith(
      'ws_streams_parse_failed',
      expect.any(Object),
    );
    expect(published).toHaveLength(1);
    expect((published[0] as { eventId: string }).eventId).toBe('good');
  });

  it('missing envelope field warns and skips the entry', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge, published } = makeBridge();
    const logger = makeLogger();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger,
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    // entry without an envelope field — subscriber should warn + skip
    await redis.xadd('ws:events', { wrongField: 'x', eventId: 'no-envelope' });

    await flushTicks(80);
    await sub.stop();

    expect(logger.warn).toHaveBeenCalledWith(
      'ws_streams_missing_envelope_field',
      expect.objectContaining({ entryId: expect.any(String) }),
    );
    expect(published).toHaveLength(0);
  });

  it('S18-A2 R1: subscriber passes noAck:true to xreadgroup so the PEL stays empty', async () => {
    // post-A2 round-1 fix: without NOACK or an XACK call the PEL grows
    // unbounded for healthy groups (Codex+Gemini both flagged this).
    // The in-memory stub now models the PEL so we can assert the fix.
    const redis = createInMemoryWsRedis();
    const xreadgroupSpy = vi.spyOn(redis, 'xreadgroup');
    const { bridge } = makeBridge();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger: makeLogger(),
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    await redis.xadd('ws:events', { envelope: envelopeJson('evt-1'), eventId: 'evt-1' });
    await redis.xadd('ws:events', { envelope: envelopeJson('evt-2'), eventId: 'evt-2' });

    await flushTicks(80);
    await sub.stop();

    // every xreadgroup call passed noAck:true
    expect(xreadgroupSpy).toHaveBeenCalled();
    for (const call of xreadgroupSpy.mock.calls) {
      const opts = call[3] as { noAck?: boolean } | undefined;
      expect(opts?.noAck).toBe(true);
    }
    // PEL is empty because NOACK skipped pending-entry tracking
    expect(redis._pendingEntryCount('ws:events', 'ws-instance-inst-A')).toBe(0);
  });

  it('stop() awaits in-flight tick + clears the polling timer', async () => {
    const redis = createInMemoryWsRedis();
    const { bridge } = makeBridge();
    const sub = createStreamsSubscriber({
      redis,
      dedupeStore: createDedupeStore(redis, { instanceId: 'test-inst' }),
      bridge,
      logger: makeLogger(),
      instanceId: 'inst-A',
      blockMs: 0,
      idleIntervalMs: 30,
    });
    await sub.start();

    // immediately stop — should not throw, returns once tick settles
    await expect(sub.stop()).resolves.toBeUndefined();

    // start/stop cycle is repeatable
    await expect(sub.start()).resolves.toBeUndefined();
    await expect(sub.stop()).resolves.toBeUndefined();
  });
});
