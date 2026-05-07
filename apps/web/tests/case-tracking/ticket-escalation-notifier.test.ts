/**
 * S18-C1c: ticket-escalation notifier tests.
 *
 * Pins the AD-S18-6 dedupe contract for ticket-tier notifications:
 *   - Dedupe-win calls platform adapter; dedupe-lose skips it
 *   - Send failure releases the slot (S18-B3 R1 lesson: lossy
 *     "burn-first" suppresses every retry within TTL)
 *   - Missing recipient releases the slot so subsequent config can fire
 *   - Fail-OPEN on Redis SET errors (notification > silence)
 *   - Dedupe key shape includes ticketId + fromTier + toTier
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import type { NotificationAdapter as PlatformNotificationAdapter } from '@aptivo/notifications';
import {
  createTicketEscalationNotifier,
  type TicketEscalationDedupeRedis,
} from '../../src/lib/case-tracking/ticket-escalation-notifier.js';

function makePlatformAdapter(
  sendResult: Awaited<ReturnType<PlatformNotificationAdapter['send']>>,
): PlatformNotificationAdapter {
  return {
    send: vi.fn(async () => sendResult),
    upsertSubscriber: vi.fn(async () => Result.ok(undefined)),
  };
}

function makeMemoryRedis(
  setBehavior: 'normal' | 'reject-set' = 'normal',
): TicketEscalationDedupeRedis & { _calls: { method: string; key: string }[] } {
  const store = new Map<string, string>();
  const calls: { method: string; key: string }[] = [];
  return {
    _calls: calls,
    async set(key, value, _opts) {
      calls.push({ method: 'set', key });
      if (setBehavior === 'reject-set') throw new Error('redis offline');
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    async del(key) {
      calls.push({ method: 'del', key });
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
  };
}

describe('S18-C1c: createTicketEscalationNotifier', () => {
  it('on first observation: claims dedupe AND calls platformAdapter.send', async () => {
    const dedupeRedis = makeMemoryRedis();
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'notif-1' }));
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: 'ops-group',
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1',
      fromTier: 'L1',
      toTier: 'L2',
      priority: 'high',
      reason: null,
    });

    expect(platformAdapter.send).toHaveBeenCalledTimes(1);
    expect(platformAdapter.send).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'ops-group',
      channel: 'email',
      subject: expect.stringContaining('L1 → L2'),
      transactionId: 'ticket-escalation-tkt-1-L1-L2',
      metadata: expect.objectContaining({ ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2' }),
    }));
  });

  it('dedupe key shape includes ticketId + fromTier + toTier (AD-S18-6)', async () => {
    const dedupeRedis = makeMemoryRedis();
    const notifier = createTicketEscalationNotifier({
      platformAdapter: makePlatformAdapter(Result.ok({ id: 'n' })),
      dedupeRedis,
      recipientId: 'ops',
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1',
      fromTier: 'L2',
      toTier: 'L3',
      priority: 'critical',
      reason: 'no response',
    });

    const setCalls = dedupeRedis._calls.filter((c) => c.method === 'set');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.key).toBe('ticket:escalation:dedupe:tkt-1:L2->L3');
  });

  it('uses "initial" segment for null fromTier', async () => {
    const dedupeRedis = makeMemoryRedis();
    const notifier = createTicketEscalationNotifier({
      platformAdapter: makePlatformAdapter(Result.ok({ id: 'n' })),
      dedupeRedis,
      recipientId: 'ops',
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1',
      fromTier: null,
      toTier: 'L1',
      priority: 'medium',
      reason: null,
    });

    const setCall = dedupeRedis._calls.find((c) => c.method === 'set');
    expect(setCall!.key).toBe('ticket:escalation:dedupe:tkt-1:initial->L1');
  });

  it('on dedupe-loss: skips platformAdapter.send', async () => {
    const dedupeRedis = makeMemoryRedis();
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'unused' }));
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: 'ops',
    });

    // first observer claims; second observer is a no-op
    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });
    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });

    expect(platformAdapter.send).toHaveBeenCalledTimes(1);
  });

  it('send failure releases the dedupe slot so retry can succeed (S18-B3 R1 lesson)', async () => {
    const dedupeRedis = makeMemoryRedis();
    const platformAdapter = makePlatformAdapter(Result.err({
      _tag: 'AdapterError' as const,
      message: 'SMTP refused',
      retryable: true,
    }));
    const warn = vi.fn();
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: 'ops',
      logger: { warn },
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });

    expect(warn).toHaveBeenCalledWith('ticket_escalation_send_failed', expect.any(Object));
    // del was called to release the slot
    expect(dedupeRedis._calls.some((c) => c.method === 'del')).toBe(true);

    // a subsequent attempt with a now-recovered adapter can succeed
    platformAdapter.send = vi.fn(async () => Result.ok({ id: 'recovered' }));
    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });
    expect(platformAdapter.send).toHaveBeenCalledTimes(1); // first call on the new mock
  });

  it('missing recipient releases the slot so subsequent config can fire', async () => {
    const dedupeRedis = makeMemoryRedis();
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'unused' }));
    const warn = vi.fn();
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: null,
      logger: { warn },
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });

    expect(platformAdapter.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('ticket_escalation_recipient_unconfigured', expect.any(Object));
    expect(dedupeRedis._calls.some((c) => c.method === 'del')).toBe(true);
  });

  it('fails OPEN on Redis SET error: still calls platformAdapter (notification > silence)', async () => {
    const dedupeRedis = makeMemoryRedis('reject-set');
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'n' }));
    const warn = vi.fn();
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: 'ops',
      logger: { warn },
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });

    expect(warn).toHaveBeenCalledWith('ticket_escalation_dedupe_failed', expect.any(Object));
    expect(platformAdapter.send).toHaveBeenCalledTimes(1);
  });

  it('null dedupeRedis disables dedupe entirely (every replica fires; test/dev)', async () => {
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'n' }));
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis: null,
      recipientId: 'ops',
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });
    await notifier.notifyTierChange({
      ticketId: 'tkt-1', fromTier: 'L1', toTier: 'L2', priority: 'high', reason: null,
    });

    // both fire — no cluster-wide dedupe, no per-call dedupe
    expect(platformAdapter.send).toHaveBeenCalledTimes(2);
  });

  it('renders different bodies for auto-escalation vs manual (with reason)', async () => {
    const dedupeRedis = makeMemoryRedis();
    const platformAdapter = makePlatformAdapter(Result.ok({ id: 'n' }));
    const notifier = createTicketEscalationNotifier({
      platformAdapter,
      dedupeRedis,
      recipientId: 'ops',
    });

    await notifier.notifyTierChange({
      ticketId: 'tkt-auto', fromTier: 'L1', toTier: 'L2', priority: 'medium', reason: null,
    });
    await notifier.notifyTierChange({
      ticketId: 'tkt-manual', fromTier: 'L1', toTier: 'L2', priority: 'medium', reason: 'customer escalated',
    });

    const calls = (platformAdapter.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].body).toContain('auto-escalated');
    expect(calls[1]![0].body).toContain('customer escalated');
  });
});
