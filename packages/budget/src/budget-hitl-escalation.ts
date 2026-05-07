/**
 * S18-B3: budget-exception HITL escalation.
 *
 * When a department crosses its monthly limit (`exceeded` threshold)
 * AND `blockOnExceed: true`, downstream callers can request a
 * temporary exception via a HITL approval chain (typically:
 * department head → finance lead). This service is the entry point
 * that fires the chain — once per `(deptId, period)` across the
 * cluster, deduped via the same Redis SET-NX-EX primitive that
 * BudgetNotificationService uses (AD-S18-6).
 *
 * Dedupe scope: the dedupe key uses the `'escalation'` BudgetThreshold
 * tag so this pipeline runs INDEPENDENTLY of the notification
 * pipeline's `'exceeded'` tag. Both observe the same crossing event
 * but produce different side-effects (notification vs HITL chain
 * trigger); they each get their own slot.
 *
 * The actual HITL `createRequest` call is injected as a callable
 * (`triggerChain`) so this package doesn't take a dependency on
 * `@aptivo/hitl-gateway` or any persistence layer. Tests use a
 * mock; `services.ts` wires the real `createRequest` in.
 *
 * Approval/rejection flow (out-of-scope for this service, but
 * documented for context):
 *   - Approve: services.ts wires an `onApprove` handler that records
 *     the temporary increase + emits the `budget.exception.approved`
 *     audit event. The dedupe key remains set so a second escalation
 *     in the same period requires either a new period or a manual
 *     dedupe-key clear.
 *   - Reject: the `MonthlyBudgetExceeded` Result preserved by
 *     `checkBudget` is the authoritative blocker; no spend is
 *     allowed until the next period.
 */

import { Result } from '@aptivo/types';
import type { BudgetDedupeStore } from './budget-dedupe-store.js';
import { currentMonthPeriod } from './budget-dedupe-store.js';

// ---------------------------------------------------------------------------
// public surface
// ---------------------------------------------------------------------------

export interface BudgetHitlEscalationContext {
  readonly deptId: string;
  readonly deptName: string;
  readonly currentSpendUsd: number;
  readonly limitUsd: number;
  /** Period key from `currentMonthPeriod()`; defaults to current month. */
  readonly period?: string;
  /** Actor that triggered the over-budget request — propagated into the HITL chain for traceability. */
  readonly requestedBy: { readonly userId: string; readonly departmentId?: string };
}

export interface BudgetHitlEscalationResult {
  /** True when dedupe was won AND the chain trigger was invoked. */
  readonly triggered: boolean;
  readonly period: string;
  /** Set when the chain was actually triggered (mirrors the createRequest output). */
  readonly hitlRequestId?: string;
}

export type BudgetHitlEscalationError =
  | { readonly _tag: 'ChainTriggerUnavailable' }
  | { readonly _tag: 'ChainTriggerFailed'; readonly cause: unknown };

export interface BudgetHitlEscalationService {
  triggerOnExceeded(
    ctx: BudgetHitlEscalationContext,
  ): Promise<Result<BudgetHitlEscalationResult, BudgetHitlEscalationError>>;
}

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export type TriggerBudgetExceptionChain = (input: {
  readonly deptId: string;
  readonly deptName: string;
  readonly currentSpendUsd: number;
  readonly limitUsd: number;
  readonly period: string;
  readonly requestedBy: { readonly userId: string; readonly departmentId?: string };
}) => Promise<Result<{ hitlRequestId: string }, { cause: unknown }>>;

export interface BudgetHitlEscalationServiceDeps {
  /**
   * Callable that creates the HITL approval request and returns its
   * id. Wired in `services.ts` to call the real
   * `@aptivo/hitl-gateway` `createRequest`. Null in environments
   * where the gateway isn't configured (factory returns
   * `ChainTriggerUnavailable` from each call instead of crashing).
   */
  readonly triggerChain: TriggerBudgetExceptionChain | null;
  readonly dedupeStore: BudgetDedupeStore;
  readonly logger?: {
    warn(event: string, ctx?: Record<string, unknown>): void;
    info?: (event: string, ctx?: Record<string, unknown>) => void;
  };
  readonly nowMs?: () => number;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createBudgetHitlEscalation(
  deps: BudgetHitlEscalationServiceDeps,
): BudgetHitlEscalationService {
  const now = deps.nowMs ?? Date.now;

  return {
    async triggerOnExceeded(ctx) {
      const period = ctx.period ?? currentMonthPeriod(new Date(now()));

      // Burn the dedupe slot FIRST so a missing trigger callable
      // doesn't get re-attempted on every subsequent call. The slot
      // expires when the period rolls over (production wires the
      // store with `secondsUntilNextMonth` as the TTL resolver) or
      // after 24h in tests.
      const fired = await deps.dedupeStore.shouldFire({
        deptId: ctx.deptId,
        period,
        threshold: 'escalation',
      });
      if (!fired) {
        deps.logger?.info?.('budget_escalation_skipped_deduped', {
          deptId: ctx.deptId,
          period,
        });
        return Result.ok({ triggered: false, period });
      }

      if (!deps.triggerChain) {
        deps.logger?.warn('budget_escalation_chain_unavailable', {
          deptId: ctx.deptId,
          period,
        });
        // post-B3 R1: release the slot so once the gateway comes
        // online a subsequent crossing can succeed. Without this, a
        // missing BUDGET_EXCEPTION_APPROVER_USER_ID at deploy time
        // suppresses escalations for the whole period (Codex R1).
        await deps.dedupeStore.releaseSlot({
          deptId: ctx.deptId,
          period,
          threshold: 'escalation',
        });
        return Result.err({ _tag: 'ChainTriggerUnavailable' });
      }

      const triggerResult = await deps.triggerChain({
        deptId: ctx.deptId,
        deptName: ctx.deptName,
        currentSpendUsd: ctx.currentSpendUsd,
        limitUsd: ctx.limitUsd,
        period,
        requestedBy: ctx.requestedBy,
      });

      if (!triggerResult.ok) {
        deps.logger?.warn('budget_escalation_chain_trigger_failed', {
          deptId: ctx.deptId,
          period,
          cause: triggerResult.error.cause instanceof Error
            ? triggerResult.error.cause.message
            : String(triggerResult.error.cause),
        });
        await deps.dedupeStore.releaseSlot({
          deptId: ctx.deptId,
          period,
          threshold: 'escalation',
        });
        return Result.err({ _tag: 'ChainTriggerFailed', cause: triggerResult.error.cause });
      }

      deps.logger?.info?.('budget_escalation_chain_triggered', {
        deptId: ctx.deptId,
        period,
        hitlRequestId: triggerResult.value.hitlRequestId,
      });
      return Result.ok({
        triggered: true,
        period,
        hitlRequestId: triggerResult.value.hitlRequestId,
      });
    },
  };
}
