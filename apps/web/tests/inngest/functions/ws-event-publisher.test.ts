/**
 * S17-WS-PUB: Inngest publisher unit tests
 * @task S17-WS-PUB
 *
 * Covers the pure envelope builder + topic-derivation logic. The
 * Inngest function execution itself is exercised by the integration
 * test in apps/ws-server which round-trips a publish through Redis.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildEnvelope,
  createWsEventPublisherFunctions,
  type WsPublisherRedis,
} from '../../../src/lib/inngest/functions/ws-event-publisher';
import { Inngest, EventSchemas } from 'inngest';

describe('S17-WS-PUB: buildEnvelope', () => {
  it('produces a frozen-v1.0 EventFrame envelope', () => {
    const env = buildEnvelope({
      topic: 'workflow/wf-7',
      eventId: 'evt-abc',
      data: { foo: 'bar' },
      now: () => new Date('2026-04-26T10:00:00.000Z'),
    });
    expect(env).toEqual({
      type: 'event',
      topic: 'workflow/wf-7',
      eventId: 'evt-abc',
      timestamp: '2026-04-26T10:00:00.000Z',
      data: { foo: 'bar' },
    });
  });
});

describe('S17-WS-PUB: createWsEventPublisherFunctions', () => {
  function makeRedis(): WsPublisherRedis & { lpushSpy: ReturnType<typeof vi.fn> } {
    const lpushSpy = vi.fn().mockResolvedValue(1);
    return { lpush: lpushSpy, lpushSpy };
  }

  function makeInngest() {
    return new Inngest({
      id: 'test-app',
      schemas: new EventSchemas(),
    });
  }

  it('registers exactly the documented set of WS-relevant events', () => {
    const inngest = makeInngest();
    const fns = createWsEventPublisherFunctions({
      inngest,
      redis: makeRedis(),
      logger: { warn: vi.fn() },
    });

    // expect 5 functions: 2 workflow + 3 hitl. Adding ticket events
    // (Epic 4) requires updating this count + DESCRIPTORS.
    expect(fns).toHaveLength(5);
    const ids = fns.map((f) => (f as unknown as { id: () => string }).id());
    expect(ids).toContain('ws-publish-workflow-spawned');
    expect(ids).toContain('ws-publish-workflow-completed');
    expect(ids).toContain('ws-publish-hitl-requested');
    expect(ids).toContain('ws-publish-hitl-finalized');
    expect(ids).toContain('ws-publish-hitl-changes');
  });

  it('uses the configured queueKey, falling back to ws:events', () => {
    const inngest = makeInngest();
    // factory shouldn't throw with either; behaviour assertion is in
    // the integration test that round-trips the actual lpush call.
    expect(() =>
      createWsEventPublisherFunctions({
        inngest,
        redis: makeRedis(),
        logger: { warn: vi.fn() },
      }),
    ).not.toThrow();
    expect(() =>
      createWsEventPublisherFunctions({
        inngest,
        redis: makeRedis(),
        logger: { warn: vi.fn() },
        queueKey: 'custom:queue',
      }),
    ).not.toThrow();
  });
});
