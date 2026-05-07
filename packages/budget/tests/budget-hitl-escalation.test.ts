/**
 * S18-B3: BudgetHitlEscalation tests.
 *
 * Coverage:
 *   - dedupe wins → triggerChain called → triggered=true with hitlRequestId
 *   - dedupe loses → triggerChain NEVER called → triggered=false
 *   - missing triggerChain (gateway not configured) → ChainTriggerUnavailable
 *     but dedupe IS still claimed (prevents racing replicas after gateway online)
 *   - triggerChain rejection surfaces as ChainTriggerFailed Result
 *   - dedupe key uses 'escalation' threshold tag (DOES NOT collide with notification's 'exceeded')
 *   - period defaults to current month
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createBudgetHitlEscalation } from '../src/budget-hitl-escalation.js';
import type { BudgetDedupeStore } from '../src/budget-dedupe-store.js';

function makeDedupe(firstObservations: boolean[]): BudgetDedupeStore & {
  releaseSlot: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  return {
    shouldFire: vi.fn(async () => firstObservations[i++] ?? false),
    releaseSlot: vi.fn(async () => undefined),
  };
}

describe('S18-B3: createBudgetHitlEscalation', () => {
  it('on first observation: claims dedupe AND triggers the chain AND returns triggered=true', async () => {
    const dedupeStore = makeDedupe([true]);
    const triggerChain = vi.fn(async () => Result.ok({ hitlRequestId: 'hitl-42' }));
    const svc = createBudgetHitlEscalation({ triggerChain, dedupeStore });

    const result = await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.triggered).toBe(true);
    expect(result.value.hitlRequestId).toBe('hitl-42');
    expect(triggerChain).toHaveBeenCalledWith(expect.objectContaining({
      deptId: 'd1',
      deptName: 'Engineering',
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    }));
  });

  it('writes the dedupe key with the "escalation" threshold tag (separate pipeline from notifications)', async () => {
    // Critical: notification service writes 'warning' / 'exceeded';
    // escalation writes 'escalation'. Same period, same dept — but
    // the dedupe slots are distinct so both pipelines run.
    const dedupeStore = makeDedupe([true]);
    const triggerChain = vi.fn(async () => Result.ok({ hitlRequestId: 'hitl-1' }));
    const svc = createBudgetHitlEscalation({ triggerChain, dedupeStore });

    await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    });

    expect(dedupeStore.shouldFire).toHaveBeenCalledWith(expect.objectContaining({
      threshold: 'escalation',
    }));
  });

  it('on dedupe-loss: triggerChain NEVER called, returns triggered=false', async () => {
    const dedupeStore = makeDedupe([false]);
    const triggerChain = vi.fn();
    const svc = createBudgetHitlEscalation({ triggerChain, dedupeStore });

    const result = await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.triggered).toBe(false);
    expect(triggerChain).not.toHaveBeenCalled();
  });

  it('missing triggerChain (gateway not configured): claims dedupe + returns ChainTriggerUnavailable', async () => {
    const dedupeStore = makeDedupe([true]);
    const svc = createBudgetHitlEscalation({ triggerChain: null, dedupeStore });

    const result = await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ChainTriggerUnavailable');
    expect(dedupeStore.shouldFire).toHaveBeenCalled();
    // post-R1: missing trigger releases the slot so once the gateway
    // is wired a subsequent observation can fire (suppression-on-failure
    // bug; Codex R1 caught it).
    expect(dedupeStore.releaseSlot).toHaveBeenCalledWith(expect.objectContaining({
      deptId: 'd1',
      threshold: 'escalation',
    }));
  });

  it('triggerChain failure surfaces as ChainTriggerFailed Result with the underlying cause', async () => {
    const dedupeStore = makeDedupe([true]);
    const cause = new Error('createRequest validation failed');
    const triggerChain = vi.fn(async () => Result.err({ cause }));
    const warn = vi.fn();
    const svc = createBudgetHitlEscalation({ triggerChain, dedupeStore, logger: { warn } });

    const result = await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      period: '2026-05',
      requestedBy: { userId: 'user-7' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ChainTriggerFailed');
    if (result.error._tag !== 'ChainTriggerFailed') return;
    expect(result.error.cause).toBe(cause);
    expect(warn).toHaveBeenCalledWith(
      'budget_escalation_chain_trigger_failed',
      expect.any(Object),
    );
    // post-R1: trigger failure releases the slot so a retry can succeed.
    expect(dedupeStore.releaseSlot).toHaveBeenCalledWith(expect.objectContaining({
      deptId: 'd1',
      threshold: 'escalation',
    }));
  });

  it('period defaults to currentMonthPeriod when caller omits it', async () => {
    const dedupeStore = makeDedupe([true]);
    const triggerChain = vi.fn(async () => Result.ok({ hitlRequestId: 'hitl-99' }));
    const fixedNow = Date.UTC(2026, 4, 15, 12, 0, 0);
    const svc = createBudgetHitlEscalation({
      triggerChain,
      dedupeStore,
      nowMs: () => fixedNow,
    });

    const result = await svc.triggerOnExceeded({
      deptId: 'd1',
      deptName: 'Engineering',
      currentSpendUsd: 1200,
      limitUsd: 1000,
      requestedBy: { userId: 'user-7' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.period).toBe('2026-05');
    expect(triggerChain).toHaveBeenCalledWith(expect.objectContaining({ period: '2026-05' }));
  });
});
