/**
 * S18-B3: BudgetNotificationService tests.
 *
 * Coverage:
 *   - dedupe wins → adapter fires; dedupe loses → adapter never called
 *   - missing adapter → returns AdapterUnavailable but still claims dedupe
 *     so re-attempts after the adapter comes online don't race
 *   - adapter send-failure surfaces as NotificationFailed Result
 *   - default template has heading + body for both warning and exceeded
 *   - period defaults to current month when omitted
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import type { NotificationAdapter } from '@aptivo/notifications';
import { createBudgetNotificationService } from '../src/budget-notification-service.js';
import type { BudgetDedupeStore } from '../src/budget-dedupe-store.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeDedupe(firstObservations: boolean[]): BudgetDedupeStore & {
  releaseSlot: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  return {
    shouldFire: vi.fn(async () => firstObservations[i++] ?? false),
    releaseSlot: vi.fn(async () => undefined),
  };
}

function makeAdapter(sendResult: Awaited<ReturnType<NotificationAdapter['send']>>): NotificationAdapter {
  return {
    send: vi.fn(async () => sendResult),
    upsertSubscriber: vi.fn(async () => Result.ok(undefined)),
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B3: createBudgetNotificationService', () => {
  it('on first observation: claims dedupe AND calls adapter.send AND returns fired=true', async () => {
    const dedupeStore = makeDedupe([true]);
    const adapter = makeAdapter(Result.ok({ id: 'notif-1' }));
    const svc = createBudgetNotificationService({ adapter, dedupeStore });

    const result = await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
      period: '2026-05',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fired).toBe(true);
    expect(result.value.threshold).toBe('warning');
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'user-owner',
      channel: 'email',
      subject: expect.stringContaining('Engineering'),
      body: expect.stringContaining('80%'),
      transactionId: 'budget-d1-2026-05-warning',
      metadata: expect.objectContaining({
        deptId: 'd1',
        period: '2026-05',
        threshold: 'warning',
      }),
    }));
  });

  it('on dedupe-loss (someone else fired): adapter NEVER called, returns fired=false', async () => {
    const dedupeStore = makeDedupe([false]);
    const adapter = makeAdapter(Result.ok({ id: 'unused' }));
    const svc = createBudgetNotificationService({ adapter, dedupeStore });

    const result = await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fired).toBe(false);
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('exceeded threshold uses a distinct template (not just "warning" copy)', async () => {
    const dedupeStore = makeDedupe([true]);
    const adapter = makeAdapter(Result.ok({ id: 'notif-2' }));
    const svc = createBudgetNotificationService({ adapter, dedupeStore });

    await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'exceeded',
      currentSpendUsd: 1100,
      limitUsd: 1000,
      period: '2026-05',
    });

    expect(adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringMatching(/EXCEEDED/i),
      body: expect.stringContaining('blocked'),
      transactionId: 'budget-d1-2026-05-exceeded',
    }));
  });

  it('missing adapter: claims dedupe THEN releases the slot so retry can succeed (Codex R1)', async () => {
    // Earlier draft burned the slot here, suppressing notifications for
    // the rest of the period after one missing-adapter observation.
    // R1 fix: claim → check adapter → release on missing-adapter so a
    // subsequent observation (after the adapter is wired) can fire.
    const dedupeStore = makeDedupe([true]);
    const svc = createBudgetNotificationService({ adapter: null, dedupeStore });

    const result = await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AdapterUnavailable');
    expect(dedupeStore.shouldFire).toHaveBeenCalled();
    expect(dedupeStore.releaseSlot).toHaveBeenCalledWith(expect.objectContaining({
      deptId: 'd1',
      threshold: 'warning',
    }));
  });

  it('adapter send failure surfaces as NotificationFailed Result', async () => {
    const dedupeStore = makeDedupe([true]);
    const adapter = makeAdapter(Result.err({
      _tag: 'AdapterError' as const,
      message: 'SMTP refused',
      retryable: true,
    }));
    const warn = vi.fn();
    const svc = createBudgetNotificationService({
      adapter,
      dedupeStore,
      logger: { warn },
    });

    const result = await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NotificationFailed');
    expect(warn).toHaveBeenCalledWith(
      'budget_notification_send_failed',
      expect.any(Object),
    );
    // post-R1: send failure releases the slot so a retry can succeed.
    expect(dedupeStore.releaseSlot).toHaveBeenCalledWith(expect.objectContaining({
      deptId: 'd1',
      threshold: 'warning',
    }));
  });

  it('period defaults to currentMonthPeriod when caller omits it', async () => {
    const dedupeStore = makeDedupe([true]);
    const adapter = makeAdapter(Result.ok({ id: 'notif-3' }));
    // freeze the clock to mid-may 2026 so the default period is '2026-05'
    const fixedNow = Date.UTC(2026, 4, 15, 12, 0, 0);
    const svc = createBudgetNotificationService({
      adapter,
      dedupeStore,
      nowMs: () => fixedNow,
    });

    const result = await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.period).toBe('2026-05');
    expect(dedupeStore.shouldFire).toHaveBeenCalledWith(expect.objectContaining({
      period: '2026-05',
    }));
  });

  it('uses custom renderTemplate when provided (test-fixture seam)', async () => {
    const dedupeStore = makeDedupe([true]);
    const adapter = makeAdapter(Result.ok({ id: 'notif-4' }));
    const renderTemplate = vi.fn().mockReturnValue({ subject: 'CUSTOM', body: 'fixture body' });
    const svc = createBudgetNotificationService({ adapter, dedupeStore, renderTemplate });

    await svc.notifyThresholdCrossing({
      deptId: 'd1',
      deptName: 'Engineering',
      recipientId: 'user-owner',
      threshold: 'warning',
      currentSpendUsd: 800,
      limitUsd: 1000,
    });

    expect(adapter.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'CUSTOM',
      body: 'fixture body',
    }));
    expect(renderTemplate).toHaveBeenCalledWith(expect.objectContaining({ deptId: 'd1' }));
  });
});
