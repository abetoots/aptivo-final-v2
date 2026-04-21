/**
 * WFE3-02: replay buffer tests
 *
 * Per-topic ring buffer sized by event count AND time window (5 min per
 * spec). Supports resume-from-cursor with a clear signal when the cursor
 * is outside the window (caller must return full_sync).
 */

import { describe, it, expect } from 'vitest';
import { createReplayBuffer } from '../src/replay-buffer.js';

function ev(topic: string, id: string, t = Date.now()) {
  return { topic, eventId: id, timestamp: new Date(t).toISOString(), data: { id } };
}

describe('WFE3-02: replay buffer — append + list', () => {
  it('returns empty list for an unknown topic', () => {
    const buf = createReplayBuffer({ maxPerTopic: 10, ttlMs: 60_000 });
    expect(buf.eventsSince('topic:x', 'anything')).toEqual({ kind: 'full_sync' });
  });

  it('appends events and returns them in insertion order', () => {
    const buf = createReplayBuffer({ maxPerTopic: 10, ttlMs: 60_000 });
    buf.append(ev('t', '1'));
    buf.append(ev('t', '2'));
    buf.append(ev('t', '3'));
    const result = buf.eventsSince('t', '1');
    expect(result.kind).toBe('events');
    if (result.kind !== 'events') return;
    expect(result.events.map((e) => e.eventId)).toEqual(['2', '3']);
  });

  it('returns full_sync when the cursor event is not in the buffer (outside window)', () => {
    const buf = createReplayBuffer({ maxPerTopic: 10, ttlMs: 60_000 });
    buf.append(ev('t', '10'));
    buf.append(ev('t', '11'));
    expect(buf.eventsSince('t', 'gone')).toEqual({ kind: 'full_sync' });
  });

  it('isolates topics — events on one topic do not leak into another', () => {
    const buf = createReplayBuffer({ maxPerTopic: 10, ttlMs: 60_000 });
    buf.append(ev('a', '1'));
    buf.append(ev('b', '2'));
    const result = buf.eventsSince('a', '1');
    expect(result.kind).toBe('events');
    if (result.kind !== 'events') return;
    expect(result.events).toEqual([]); // no events after '1' on topic 'a'
  });
});

describe('WFE3-02: replay buffer — size cap', () => {
  it('evicts oldest events when buffer exceeds maxPerTopic', () => {
    const buf = createReplayBuffer({ maxPerTopic: 3, ttlMs: 60_000 });
    for (let i = 1; i <= 5; i += 1) buf.append(ev('t', String(i)));
    // cap=3, so ids 1 and 2 are evicted
    const result = buf.eventsSince('t', '3');
    expect(result.kind).toBe('events');
    if (result.kind !== 'events') return;
    expect(result.events.map((e) => e.eventId)).toEqual(['4', '5']);
    // resuming from an evicted id → full_sync
    expect(buf.eventsSince('t', '1')).toEqual({ kind: 'full_sync' });
  });
});

describe('WFE3-02: replay buffer — TTL window', () => {
  it('drops events older than ttlMs at read time', () => {
    const now = Date.now();
    const buf = createReplayBuffer({
      maxPerTopic: 10,
      ttlMs: 1000,
      nowMs: () => now + 5000, // fast-forward 5s
    });
    // append with timestamps before the fast-forward "now"
    buf.append(ev('t', '1', now));
    buf.append(ev('t', '2', now + 100));
    // both events are older than 1000ms from the fast-forwarded now
    expect(buf.eventsSince('t', '1')).toEqual({ kind: 'full_sync' });
  });

  it('retains events still within ttlMs', () => {
    const now = Date.now();
    let clock = now;
    const buf = createReplayBuffer({
      maxPerTopic: 10,
      ttlMs: 1000,
      nowMs: () => clock,
    });
    buf.append(ev('t', '1', now));
    clock = now + 500;
    buf.append(ev('t', '2', clock));
    // now reading 100ms later — both events inside 1000ms window
    clock = now + 600;
    const result = buf.eventsSince('t', '1');
    expect(result.kind).toBe('events');
    if (result.kind !== 'events') return;
    expect(result.events.map((e) => e.eventId)).toEqual(['2']);
  });
});
