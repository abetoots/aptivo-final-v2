/**
 * S18-A2: cross-transport dedupe store tests.
 *
 * The store wraps the WsRedisClient `SET NX EX` primitive. Tests
 * cover:
 *   - first observation returns true; duplicate returns false
 *   - TTL is passed through
 *   - SET failure → fail-open (return true with warn) so a Redis
 *     hiccup doesn't suppress fan-out
 */

import { describe, it, expect, vi } from 'vitest';
import { createInMemoryWsRedis } from '@aptivo/redis';
import { createDedupeStore } from '../src/redis-dedupe-store.js';

describe('S18-A2: createDedupeStore', () => {
  it('first observation returns true; duplicate returns false', async () => {
    const redis = createInMemoryWsRedis();
    const store = createDedupeStore(redis, { instanceId: 'inst-A' });

    expect(await store.isFirstObservation('evt-abc')).toBe(true);
    expect(await store.isFirstObservation('evt-abc')).toBe(false);
  });

  it('different eventIds dedupe independently', async () => {
    const redis = createInMemoryWsRedis();
    const store = createDedupeStore(redis, { instanceId: 'inst-A' });

    expect(await store.isFirstObservation('evt-1')).toBe(true);
    expect(await store.isFirstObservation('evt-2')).toBe(true);
    expect(await store.isFirstObservation('evt-1')).toBe(false);
    expect(await store.isFirstObservation('evt-2')).toBe(false);
  });

  it('TTL expiry resets the dedupe slot — same eventId can re-dedupe after the window', async () => {
    let nowMs = 1_000_000_000_000;
    const redis = createInMemoryWsRedis({ now: () => nowMs });
    const store = createDedupeStore(redis, { instanceId: 'inst-A', ttlSeconds: 60 });

    expect(await store.isFirstObservation('evt-x')).toBe(true);
    expect(await store.isFirstObservation('evt-x')).toBe(false);

    // advance past the TTL
    nowMs += 61_000;
    expect(await store.isFirstObservation('evt-x')).toBe(true);
  });

  it('uses ws:dedupe:<instanceId>: prefix on the underlying SET key (per-instance scope)', async () => {
    // post-A2 R2 fix: key is `ws:dedupe:<instanceId>:<eventId>` so two
    // ws-server instances do NOT suppress each other's broadcasts.
    const redis = createInMemoryWsRedis();
    const store = createDedupeStore(redis, { instanceId: 'inst-A' });

    await store.isFirstObservation('evt-keyed');
    expect(await redis.get('ws:dedupe:inst-A:evt-keyed')).toBe('1');
  });

  it('two instances against the SAME backing Redis do NOT suppress each other (broadcast invariant)', async () => {
    // load-bearing for AD-S18-2: instance A and instance B both
    // process the same eventId; both must observe "first" because the
    // dedupe scope is per-instance, not global.
    const redis = createInMemoryWsRedis();
    const a = createDedupeStore(redis, { instanceId: 'A' });
    const b = createDedupeStore(redis, { instanceId: 'B' });

    expect(await a.isFirstObservation('evt-1')).toBe(true);
    expect(await b.isFirstObservation('evt-1')).toBe(true); // NOT suppressed by A's claim
    // each instance still dedupes within its own scope
    expect(await a.isFirstObservation('evt-1')).toBe(false);
    expect(await b.isFirstObservation('evt-1')).toBe(false);
  });

  it('factory throws when instanceId is empty (per-instance scoping is mandatory)', () => {
    const redis = createInMemoryWsRedis();
    expect(() => createDedupeStore(redis, { instanceId: '' })).toThrow(/instanceId is required/);
    expect(() => createDedupeStore(redis, { instanceId: '  ' })).toThrow(/instanceId is required/);
  });

  it('fail-open on Redis SET failure: returns true with warn, does NOT suppress fan-out', async () => {
    const failingRedis = {
      ...createInMemoryWsRedis(),
      set: vi.fn().mockRejectedValue(new Error('redis connection lost')),
    };
    const warn = vi.fn();
    const store = createDedupeStore(failingRedis, { instanceId: 'inst-A', logger: { warn } });

    const result = await store.isFirstObservation('evt-during-outage');

    expect(result).toBe(true); // fail-open — duplicate fan-out is preferable to lost event
    expect(warn).toHaveBeenCalledWith(
      'ws_dedupe_store_failed',
      expect.objectContaining({ eventId: 'evt-during-outage' }),
    );
  });

  it('default TTL is 1 hour (3600s) — sufficient buffer for cross-transport delivery skew', async () => {
    let nowMs = 1_000_000_000_000;
    const redis = createInMemoryWsRedis({ now: () => nowMs });
    const store = createDedupeStore(redis, { instanceId: 'inst-A' }); // no ttl override

    expect(await store.isFirstObservation('evt-default-ttl')).toBe(true);

    // advance 59 minutes — still within window
    nowMs += 59 * 60 * 1000;
    expect(await store.isFirstObservation('evt-default-ttl')).toBe(false);

    // advance past 60 minutes
    nowMs += 2 * 60 * 1000;
    expect(await store.isFirstObservation('evt-default-ttl')).toBe(true);
  });
});
