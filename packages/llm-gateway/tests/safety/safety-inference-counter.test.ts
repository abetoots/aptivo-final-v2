/**
 * S17-B4: SafetyInferenceCounter unit tests
 * @task S17-B4
 *
 * Verifies the in-memory ring-buffer counter that feeds the SLO cron's
 * ml_classifier_timeout-rate evaluator.
 */

import { describe, it, expect } from 'vitest';
import { createInMemorySafetyCounter } from '../../src/safety/safety-inference-counter.js';

describe('S17-B4: createInMemorySafetyCounter', () => {
  it('returns rate 0 and volume 0 when no events recorded', () => {
    const counter = createInMemorySafetyCounter();
    expect(counter.timeoutRate(60_000)).toBe(0);
    expect(counter.volumeInWindow(60_000)).toBe(0);
  });

  it('computes rate as timeouts / total over the window', () => {
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({ now: () => now });
    counter.record('success');
    counter.record('success');
    counter.record('timeout');
    counter.record('success');

    expect(counter.volumeInWindow(60_000)).toBe(4);
    expect(counter.timeoutRate(60_000)).toBe(0.25);
  });

  it('prunes events older than the window', () => {
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({ now: () => now });

    // record 3 events at t=0
    counter.record('timeout');
    counter.record('timeout');
    counter.record('success');
    expect(counter.volumeInWindow(60_000)).toBe(3);

    // jump 2 minutes forward; window is 60s so all 3 events are stale
    now += 2 * 60_000;
    counter.record('success');

    expect(counter.volumeInWindow(60_000)).toBe(1);
    expect(counter.timeoutRate(60_000)).toBe(0);
  });

  it('counts errors as non-timeouts (rate stays focused on transport latency)', () => {
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({ now: () => now });
    counter.record('error');
    counter.record('error');
    counter.record('timeout');
    counter.record('success');

    // 1 timeout out of 4 calls = 25%
    expect(counter.timeoutRate(60_000)).toBe(0.25);
    expect(counter.volumeInWindow(60_000)).toBe(4);
  });

  it('prunes by time on every record() — events outside maxRetentionMs are dropped', () => {
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({
      maxRetentionMs: 60_000, // 1-min retention
      now: () => now,
    });
    counter.record('timeout');
    counter.record('timeout');
    expect(counter.volumeInWindow(60_000)).toBe(2);

    // jump 2 minutes; subsequent record() prunes the stale events
    now += 2 * 60_000;
    counter.record('success');
    expect(counter.volumeInWindow(60_000)).toBe(1);
  });

  it('read methods do NOT mutate the buffer — mixed-window reads stay correct', () => {
    // Codex review (S17-B4 post-hoc): an earlier draft pruned inside
    // `timeoutRate`/`volumeInWindow`. That meant a small-window read
    // deleted events older than the queried window, so a subsequent
    // larger-window read saw truncated data. Pruning is now record()-
    // only. This test demonstrates the invariant.
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({
      maxRetentionMs: 30 * 60 * 1000,
      now: () => now,
    });
    counter.record('timeout');
    now += 2 * 60_000; // +2 min
    counter.record('success');
    now += 5 * 60_000; // +5 min (7 min after first event)
    counter.record('success');

    // small-window query (3 min) should only see the last event
    expect(counter.volumeInWindow(3 * 60_000)).toBe(1);
    // larger-window query (10 min) must still see all three
    expect(counter.volumeInWindow(10 * 60_000)).toBe(3);
    // small-window again — still correct, no truncation
    expect(counter.volumeInWindow(3 * 60_000)).toBe(1);
  });

  it('preserves all in-window events under sustained high throughput (no count-based eviction)', () => {
    // S17-B4 multi-model review caught that a previous count-cap
    // implementation evicted in-window events at >33 rps. Time-based
    // retention must keep every event inside maxRetentionMs.
    let now = 1_000_000;
    const counter = createInMemorySafetyCounter({
      maxRetentionMs: 5 * 60_000, // 5-min retention (matches SLO window)
      now: () => now,
    });

    // simulate ~50 rps for the full window (15k events)
    for (let i = 0; i < 15_000; i++) {
      counter.record(i % 10 === 0 ? 'timeout' : 'success');
      now += 20; // 20ms between events = 50 rps
    }

    // 5-min query window must include all 15k events (10% timeout rate)
    expect(counter.volumeInWindow(5 * 60_000)).toBe(15_000);
    expect(counter.timeoutRate(5 * 60_000)).toBeCloseTo(0.10, 2);
  });

  it('reset() drops all recorded events (test-only helper)', () => {
    const counter = createInMemorySafetyCounter();
    counter.record('timeout');
    counter.record('success');
    expect(counter.volumeInWindow(60_000)).toBe(2);

    counter.reset();
    expect(counter.volumeInWindow(60_000)).toBe(0);
    expect(counter.timeoutRate(60_000)).toBe(0);
  });
});
