/**
 * WFE3-02: per-connection outbound queue + slow-consumer policy tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createOutboundQueue } from '../src/backpressure.js';

describe('WFE3-02: createOutboundQueue', () => {
  it('sends immediately when under the cap', () => {
    const sendRaw = vi.fn();
    const q = createOutboundQueue({ sendRaw, capacity: 10 });
    q.enqueue('msg-1');
    q.enqueue('msg-2');
    expect(sendRaw).toHaveBeenCalledTimes(2);
    expect(sendRaw).toHaveBeenNthCalledWith(1, 'msg-1');
    expect(sendRaw).toHaveBeenNthCalledWith(2, 'msg-2');
  });

  it('refuses to accept more than `capacity` queued messages (returns false)', () => {
    // sendRaw that pretends the socket is paused by NOT actually sending;
    // the queue accumulates pending messages until the cap
    const pending: string[] = [];
    const sendRaw = vi.fn((m: string) => { pending.push(m); });
    const q = createOutboundQueue({ sendRaw, capacity: 3 });
    // simulate socket being "slow": mark the queue as blocked so
    // enqueue buffers instead of sending straight through
    q.markBlocked(true);
    expect(q.enqueue('1')).toBe(true);
    expect(q.enqueue('2')).toBe(true);
    expect(q.enqueue('3')).toBe(true);
    // 4th one breaches the cap
    expect(q.enqueue('4')).toBe(false);
    expect(sendRaw).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('flushes buffered messages when unblocked (order preserved)', () => {
    const sent: string[] = [];
    const sendRaw = vi.fn((m: string) => { sent.push(m); });
    const q = createOutboundQueue({ sendRaw, capacity: 5 });
    q.markBlocked(true);
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    q.markBlocked(false);
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('exposes current depth for metrics', () => {
    const q = createOutboundQueue({ sendRaw: vi.fn(), capacity: 10 });
    q.markBlocked(true);
    q.enqueue('a');
    q.enqueue('b');
    expect(q.depth()).toBe(2);
    q.markBlocked(false);
    expect(q.depth()).toBe(0);
  });

  it('beforeEnqueue hook engages backpressure automatically (outbound-only traffic)', () => {
    // pre-commit-review regression: previously, only inbound messages
    // triggered the backpressure gate. Outbound-only traffic (server-
    // initiated events) bypassed it. The beforeEnqueue hook fixes that
    // by running the watermark check on every enqueue.
    let simulatedBuffered = 0;
    const sendRaw = vi.fn();
    const q = createOutboundQueue({
      sendRaw,
      capacity: 2,
      beforeEnqueue: () => q.markBlocked(simulatedBuffered > 1000),
    });
    // healthy socket — sends straight through
    q.enqueue('a');
    expect(sendRaw).toHaveBeenCalledWith('a');
    // socket fills up
    simulatedBuffered = 5000;
    // next enqueue sees the watermark and buffers instead of sending
    q.enqueue('b');
    q.enqueue('c');
    // 2nd (capacity-reached) buffered; 3rd rejects
    const third = q.enqueue('d');
    expect(third).toBe(false);
    expect(sendRaw).toHaveBeenCalledTimes(1); // only 'a' went through
  });
});
