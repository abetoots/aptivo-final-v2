/**
 * S18-B3: budget threshold notification service.
 *
 * Wraps the `NotificationAdapter` with the AD-S18-6 dedupe primitive
 * so each budget-threshold crossing fires AT MOST ONE notification per
 * `(deptId, period, threshold)` across the entire cluster. Without
 * the dedupe, every web worker that observes the crossing fires its
 * own notification → users get N copies.
 *
 * Two thresholds:
 *   - `warning`: spend has crossed `warningThreshold * monthlyLimitUsd`
 *     (default 0.80 from BudgetConfig). FYI to the dept owner.
 *   - `exceeded`: spend has crossed `monthlyLimitUsd`. Hard cap; in
 *     `blockOnExceed: true` configurations new spend is blocked. The
 *     companion `BudgetHitlEscalation` service runs the escalation
 *     chain on the same crossing.
 *
 * Why a separate service from `DepartmentBudgetService`:
 *   - The budget service is a Result-shaped value-domain helper; it
 *     doesn't depend on notification or HITL packages.
 *   - `services.ts` wires this notification service in as an optional
 *     deps callback; tests of the budget service stay free of the
 *     notification dep tree.
 *   - C1c (ticket escalation notifications) follows the same shape so
 *     a single review of this file establishes the pattern for both.
 */

import { Result } from '@aptivo/types';
import type { NotificationAdapter, NotificationError } from '@aptivo/notifications';
import type { BudgetDedupeStore } from './budget-dedupe-store.js';
import { currentMonthPeriod } from './budget-dedupe-store.js';

/**
 * Notification-only subset of the BudgetNotificationThreshold union — escalation
 * is a separate pipeline owned by `BudgetHitlEscalation`. Constraining
 * the union here prevents callers from accidentally requesting an
 * escalation notification.
 */
export type BudgetNotificationThreshold = 'warning' | 'exceeded';

// ---------------------------------------------------------------------------
// public surface
// ---------------------------------------------------------------------------

export interface BudgetNotificationContext {
  readonly deptId: string;
  readonly deptName: string;
  /**
   * One of the email/Telegram/push subscriber IDs the
   * NotificationAdapter knows about — typically the department owner.
   */
  readonly recipientId: string;
  readonly threshold: BudgetNotificationThreshold;
  readonly currentSpendUsd: number;
  readonly limitUsd: number;
  /** Period key from `currentMonthPeriod()`; defaults to current month if absent. */
  readonly period?: string;
  readonly channel?: 'email' | 'telegram' | 'push';
}

export interface BudgetNotificationResult {
  /** True when the dedupe key was claimed AND the adapter was called. */
  readonly fired: boolean;
  readonly threshold: BudgetNotificationThreshold;
  readonly period: string;
}

export type BudgetNotificationError =
  | { readonly _tag: 'NotificationFailed'; readonly cause: NotificationError }
  | { readonly _tag: 'AdapterUnavailable' };

export interface BudgetNotificationService {
  notifyThresholdCrossing(
    ctx: BudgetNotificationContext,
  ): Promise<Result<BudgetNotificationResult, BudgetNotificationError>>;
}

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface BudgetNotificationServiceDeps {
  readonly adapter: NotificationAdapter | null;
  readonly dedupeStore: BudgetDedupeStore;
  readonly logger?: {
    warn(event: string, ctx?: Record<string, unknown>): void;
    info?: (event: string, ctx?: Record<string, unknown>) => void;
  };
  readonly nowMs?: () => number;
  /**
   * Optional override of the rendered subject + body. Tests use this
   * to keep template strings out of fixture assertions; production
   * defaults to the inline templates below.
   */
  readonly renderTemplate?: (ctx: BudgetNotificationContext) => { subject: string; body: string };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const DEFAULT_CHANNEL = 'email' as const;

function defaultTemplate(ctx: BudgetNotificationContext): { subject: string; body: string } {
  const pct = ctx.limitUsd > 0
    ? Math.round((ctx.currentSpendUsd / ctx.limitUsd) * 100)
    : 0;
  const heading = ctx.threshold === 'warning'
    ? `Budget warning: ${ctx.deptName} at ${pct}% of monthly limit`
    : `Budget EXCEEDED: ${ctx.deptName} over monthly limit`;
  const body = ctx.threshold === 'warning'
    ? `Department '${ctx.deptName}' has spent $${ctx.currentSpendUsd.toFixed(2)} of $${ctx.limitUsd.toFixed(2)} this period (${pct}%). New requests are still allowed; review spend before the cap is reached.`
    : `Department '${ctx.deptName}' has spent $${ctx.currentSpendUsd.toFixed(2)} against a $${ctx.limitUsd.toFixed(2)} monthly cap. Subsequent spend will be blocked unless a HITL exception is approved.`;
  return { subject: heading, body };
}

export function createBudgetNotificationService(
  deps: BudgetNotificationServiceDeps,
): BudgetNotificationService {
  const renderTemplate = deps.renderTemplate ?? defaultTemplate;
  const now = deps.nowMs ?? Date.now;

  return {
    async notifyThresholdCrossing(ctx) {
      const period = ctx.period ?? currentMonthPeriod(new Date(now()));

      // dedupe FIRST so a missing adapter doesn't burn the dedupe slot
      // unnecessarily — wait, actually we want the slot burned even
      // when the adapter is missing (otherwise once the adapter comes
      // back online, every replica races to fire). Burn first, then
      // bail on missing adapter.
      const fired = await deps.dedupeStore.shouldFire({
        deptId: ctx.deptId,
        period,
        threshold: ctx.threshold,
      });
      if (!fired) {
        deps.logger?.info?.('budget_notification_skipped_deduped', {
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
        });
        return Result.ok({ fired: false, threshold: ctx.threshold, period });
      }

      if (!deps.adapter) {
        deps.logger?.warn('budget_notification_adapter_unavailable', {
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
        });
        // post-B3 R1: release the dedupe slot so once the adapter
        // comes online a subsequent crossing observation can succeed.
        // Earlier draft burned the slot here, suppressing the rest
        // of the period after a single config gap (Codex R1 catch).
        await deps.dedupeStore.releaseSlot({
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
        });
        return Result.err({ _tag: 'AdapterUnavailable' });
      }

      const { subject, body } = renderTemplate(ctx);
      const sendResult = await deps.adapter.send({
        recipientId: ctx.recipientId,
        channel: ctx.channel ?? DEFAULT_CHANNEL,
        subject,
        body,
        transactionId: `budget-${ctx.deptId}-${period}-${ctx.threshold}`,
        metadata: {
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
          currentSpendUsd: ctx.currentSpendUsd,
          limitUsd: ctx.limitUsd,
        },
      });

      if (!sendResult.ok) {
        // Adapter failover (Novu↔SMTP) happens INSIDE the adapter
        // wrapper; if the wrapper still returns an error, both
        // channels exhausted. Log + release the dedupe slot so the
        // next observation in this period can retry.
        deps.logger?.warn('budget_notification_send_failed', {
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
          cause: sendResult.error,
        });
        await deps.dedupeStore.releaseSlot({
          deptId: ctx.deptId,
          period,
          threshold: ctx.threshold,
        });
        return Result.err({ _tag: 'NotificationFailed', cause: sendResult.error });
      }

      deps.logger?.info?.('budget_notification_sent', {
        deptId: ctx.deptId,
        period,
        threshold: ctx.threshold,
        notificationId: sendResult.value.id,
      });
      return Result.ok({ fired: true, threshold: ctx.threshold, period });
    },
  };
}
