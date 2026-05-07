/**
 * S18-A2: in-memory WsRedisClient tests.
 *
 * The stub powers tests + local-dev for the streams publisher +
 * subscriber. These tests pin its behaviour against the AD-S18-2
 * design contract:
 *
 *   - XADD appends; XREADGROUP delivers from the group's cursor
 *   - Per-instance consumer groups give every group its own cursor →
 *     two groups reading the same stream BOTH see every entry
 *     (broadcast fan-out, the load-bearing claim)
 *   - SET NX EX implements the cross-transport dedupe primitive
 *   - MAXLEN ~ trims old entries to bound memory
 *   - TTL expiry is checked lazily on read
 */

import { describe, it, expect } from 'vitest';
import { createInMemoryWsRedis } from '../src/in-memory.js';

describe('S18-A2: createInMemoryWsRedis — streams', () => {
  it('xadd appends and returns a monotonic id', async () => {
    const r = createInMemoryWsRedis();
    const id1 = await r.xadd('ws:events', { topic: 'workflow/123', payload: '{}' });
    const id2 = await r.xadd('ws:events', { topic: 'workflow/124', payload: '{}' });
    expect(id1).toBe('1');
    expect(id2).toBe('2');
    expect(r._streamLength('ws:events')).toBe(2);
  });

  it('MAXLEN approximate-trim caps stream length', async () => {
    const r = createInMemoryWsRedis();
    for (let i = 0; i < 10; i++) {
      await r.xadd('ws:events', { i: String(i) }, { maxLen: 3 });
    }
    expect(r._streamLength('ws:events')).toBe(3);
  });

  it('xgroupCreate is idempotent — second call returns silently', async () => {
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'ws-instance-A');
    await r.xgroupCreate('ws:events', 'ws-instance-A'); // re-create
    expect(r._groupCount('ws:events')).toBe(1);
  });

  it('xreadgroup throws NOGROUP-shaped error when the group does not exist', async () => {
    // post-A2 round-1 fix: real Redis errors with NOGROUP when the
    // group is missing; the earlier stub returned null which masked
    // group-creation bugs in tests.
    const r = createInMemoryWsRedis();
    await r.xadd('ws:events', { topic: 't' });
    await expect(
      r.xreadgroup('ws:events', 'unknown-group', 'consumer-default', { blockMs: 0 }),
    ).rejects.toThrow(/NOGROUP/);
  });

  it('xreadgroup throws NOGROUP-shaped error when the stream does not exist', async () => {
    const r = createInMemoryWsRedis();
    await expect(
      r.xreadgroup('does-not-exist', 'g', 'consumer-default', { blockMs: 0 }),
    ).rejects.toThrow(/NOGROUP/);
  });

  it('xreadgroup with $ start: only delivers entries added AFTER group creation', async () => {
    const r = createInMemoryWsRedis();
    // entry BEFORE group creation — should not be delivered
    await r.xadd('ws:events', { i: 'pre' });
    await r.xgroupCreate('ws:events', 'ws-instance-A'); // default startId='$'
    // entry AFTER group creation — should be delivered
    await r.xadd('ws:events', { i: 'post' });

    const result = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      blockMs: 0,
    });
    expect(result).not.toBeNull();
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0]!.data['i']).toBe('post');
  });

  it('xreadgroup with 0 start: delivers all historical entries', async () => {
    const r = createInMemoryWsRedis();
    await r.xadd('ws:events', { i: 'a' });
    await r.xadd('ws:events', { i: 'b' });
    await r.xgroupCreate('ws:events', 'ws-instance-A', '0'); // backfill mode

    const result = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      blockMs: 0,
    });
    expect(result?.entries).toHaveLength(2);
  });

  it('xreadgroup advances the group cursor — second call returns empty', async () => {
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'ws-instance-A');
    await r.xadd('ws:events', { topic: 't' });

    const first = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      blockMs: 0,
    });
    expect(first?.entries).toHaveLength(1);

    const second = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      blockMs: 0,
    });
    expect(second).toBeNull();
  });

  it('PER-INSTANCE consumer groups: TWO groups both receive every entry (broadcast fan-out)', async () => {
    // Load-bearing test for AD-S18-2: the entire reason we use
    // per-instance consumer groups instead of a shared group is
    // that XREADGROUP with a shared group is work-distribution.
    // Per-instance groups give every group its own cursor → broadcast.
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'ws-instance-A');
    await r.xgroupCreate('ws:events', 'ws-instance-B');

    await r.xadd('ws:events', { i: '1' });
    await r.xadd('ws:events', { i: '2' });
    await r.xadd('ws:events', { i: '3' });

    const a = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      blockMs: 0,
    });
    const b = await r.xreadgroup('ws:events', 'ws-instance-B', 'consumer-default', {
      blockMs: 0,
    });

    // both groups see all 3 entries — this is what S17 list+polling
    // could not provide
    expect(a?.entries).toHaveLength(3);
    expect(b?.entries).toHaveLength(3);
    expect(a?.entries.map((e) => e.data['i'])).toEqual(['1', '2', '3']);
    expect(b?.entries.map((e) => e.data['i'])).toEqual(['1', '2', '3']);
  });

  it('xreadgroup count limits batch size', async () => {
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'ws-instance-A');
    for (let i = 0; i < 10; i++) await r.xadd('ws:events', { i: String(i) });

    const result = await r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', {
      count: 4,
      blockMs: 0,
    });
    expect(result?.entries).toHaveLength(4);
  });

  it('xgroupDelete removes the group cursor — subsequent reads throw NOGROUP', async () => {
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'ws-instance-A');
    await r.xadd('ws:events', { i: '1' });
    await r.xgroupDelete('ws:events', 'ws-instance-A');

    await expect(
      r.xreadgroup('ws:events', 'ws-instance-A', 'consumer-default', { blockMs: 0 }),
    ).rejects.toThrow(/NOGROUP/);
  });

  it('MAXLEN trim shifts per-group cursors so undelivered entries are not skipped', async () => {
    // post-A2 round-1 fix: the earlier stub left cursors pointing at
    // absolute indices, so a MAXLEN trim would silently skip every
    // undelivered entry inside the trim window.
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'g'); // cursor at -1 (no historical entries)

    // publish 5 entries with maxLen=3 — head is trimmed twice
    for (let i = 1; i <= 5; i++) {
      await r.xadd('ws:events', { i: String(i) }, { maxLen: 3 });
    }
    expect(r._streamLength('ws:events')).toBe(3);

    // Group cursor was -1, trims pulled it to -1 (clamped). The 3
    // surviving entries (3, 4, 5) are still all undelivered for this
    // group — none are skipped.
    const result = await r.xreadgroup('ws:events', 'g', 'consumer-default', { blockMs: 0 });
    expect(result?.entries.map((e) => e.data['i'])).toEqual(['3', '4', '5']);
  });

  it('without NOACK, delivered entries accumulate in the per-group PEL', async () => {
    // models the bug A2 round-1 caught — XREADGROUP without NOACK and
    // without an XACK call leaks PEL entries forever. Real Redis would
    // exhaust memory; the stub now lets a test assert the leak.
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'g');
    await r.xadd('ws:events', { i: '1' });
    await r.xadd('ws:events', { i: '2' });

    await r.xreadgroup('ws:events', 'g', 'consumer-default', { blockMs: 0 });
    expect(r._pendingEntryCount('ws:events', 'g')).toBe(2);
  });

  it('with NOACK, delivered entries skip the PEL', async () => {
    // models the post-fix subscriber: noAck:true keeps the PEL empty.
    const r = createInMemoryWsRedis();
    await r.xgroupCreate('ws:events', 'g');
    await r.xadd('ws:events', { i: '1' });
    await r.xadd('ws:events', { i: '2' });

    await r.xreadgroup('ws:events', 'g', 'consumer-default', { blockMs: 0, noAck: true });
    expect(r._pendingEntryCount('ws:events', 'g')).toBe(0);
  });
});

describe('S18-A2: createInMemoryWsRedis — SET (cross-transport dedupe)', () => {
  it('SET NX returns true on first writer, false on duplicate', async () => {
    const r = createInMemoryWsRedis();
    const first = await r.set('ws:dedupe:abc', '1', { onlyIfNotExists: true });
    const second = await r.set('ws:dedupe:abc', '1', { onlyIfNotExists: true });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('SET without NX always succeeds (overwrites)', async () => {
    const r = createInMemoryWsRedis();
    expect(await r.set('k', 'v1')).toBe(true);
    expect(await r.set('k', 'v2')).toBe(true);
    expect(await r.get('k')).toBe('v2');
  });

  it('SET EX expires keys — get returns null after TTL', async () => {
    let nowMs = 1_000_000_000_000;
    const r = createInMemoryWsRedis({ now: () => nowMs });

    await r.set('ttl-key', 'v', { expirySeconds: 60 });
    expect(await r.get('ttl-key')).toBe('v');

    // advance past the 60s TTL
    nowMs += 61_000;
    expect(await r.get('ttl-key')).toBeNull();
  });

  it('SET NX EX combo: dedupe with bounded memory (the cross-transport ring)', async () => {
    let nowMs = 1_000_000_000_000;
    const r = createInMemoryWsRedis({ now: () => nowMs });

    // first writer wins
    expect(await r.set('ws:dedupe:eventA', '1', {
      onlyIfNotExists: true,
      expirySeconds: 3600,
    })).toBe(true);

    // duplicate from the OTHER transport (e.g. list path during
    // dual-mode cutover) — must lose
    expect(await r.set('ws:dedupe:eventA', '1', {
      onlyIfNotExists: true,
      expirySeconds: 3600,
    })).toBe(false);

    // after TTL expires, the same eventId could be re-deduped — bounded memory
    nowMs += 3_601_000;
    expect(await r.set('ws:dedupe:eventA', '1', {
      onlyIfNotExists: true,
      expirySeconds: 3600,
    })).toBe(true); // post-expiry, the slot is free again
  });

  it('del returns 1 when key existed, 0 otherwise', async () => {
    const r = createInMemoryWsRedis();
    await r.set('k', 'v');
    expect(await r.del('k')).toBe(1);
    expect(await r.del('k')).toBe(0);
  });
});

describe('S18-A2: disconnect is a no-op for the in-memory stub', () => {
  it('disconnect resolves without throwing', async () => {
    const r = createInMemoryWsRedis();
    await expect(r.disconnect()).resolves.toBeUndefined();
  });
});
