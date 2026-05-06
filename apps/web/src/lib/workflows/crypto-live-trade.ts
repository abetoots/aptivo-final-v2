/**
 * S18-B1: crypto live-trading workflow.
 * @frd docs/02-requirements/crypto-domain-frd.md §4.4
 *      FR-CRYPTO-TRD-001..004 + FR-CRYPTO-RISK-001..003
 *
 * Distinct from `crypto-paper-trade.ts`:
 *   - Triggered by `crypto/live-trade.requested` (NOT
 *     `crypto/signal.created`) so paper and live signal flows remain
 *     separate event channels
 *   - Caller MUST set `live: true` on the event payload — defensive
 *     check rejects anything that arrived through a buggy emit path
 *     with `live` missing or false
 *   - Pre-HITL gate: daily-loss circuit breaker (FR-CRYPTO-RISK-002)
 *     in addition to the per-position risk checks; no fall-open on
 *     breaker errors (caller's policy is fail-closed for live)
 *   - Execution via the pluggable `ExchangeMcpAdapter`; the in-memory
 *     impl supports tests + local dev. Real venue MCP servers land
 *     post-S18 per AD-S18-4.
 *   - Fill metadata persists into `crypto_positions` (NOT
 *     `tradeExecutions` — different table, different shape; see the
 *     schema file for rationale)
 *   - Post-HITL audit attributes to `decisionData.approverId` so
 *     audit_logs.user_id populates and the anomaly aggregate matches.
 *
 * pipeline: live-trade requested → live-flag verify → LLM analysis →
 *           risk check → daily-loss circuit-breaker check → HITL
 *           single-approver → execute via exchange MCP → record
 *           position → audit trail
 */

import { inngest } from '../inngest.js';
import {
  getLlmGateway,
  getAuditService,
  getCryptoTradeSignalStore,
  getCryptoPositionStore,
  getDailyLossCircuitBreaker,
  getExchangeMcpAdapter,
  getHitlRequestDeps,
  getNotificationService,
} from '../services.js';
import { createRequest } from '@aptivo/hitl-gateway';
import type { AuditEventInput } from '@aptivo/audit';
import { completeWorkflowRequest } from '../llm/complete-workflow-request.js';
import { resolveWorkflowActor } from '../llm/resolve-workflow-actor.js';

// ---------------------------------------------------------------------------
// workflow result types
// ---------------------------------------------------------------------------

export type LiveTradeResult =
  | { status: 'executed'; positionId: string; fillPrice: string; orderId: string; signalId: string }
  | { status: 'live-flag-missing'; signalId: string }
  | { status: 'rejected'; signalId: string; reason: string }
  | { status: 'expired'; signalId: string }
  | { status: 'risk-rejected'; signalId: string; reason: string }
  | { status: 'circuit-breaker-blocked'; signalId: string; reason: string }
  | { status: 'execution-failed'; signalId: string; reason: string }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// risk validation config
//
// Note: NO pre-HITL R:R gate. Computing R:R requires the entry price,
// which the live workflow doesn't know until the fill — heuristic
// approximations (e.g. midpoint of SL/TP) produce false rejections.
// The HITL approver evaluates R:R as part of their review; duplicating
// that with an automated gate adds bug surface without value. The
// paper-trade workflow has its own R:R check because it knows the
// signal's intended entryZone column up front.
// ---------------------------------------------------------------------------

const RISK_LIMITS = {
  maxConcurrentPositions: 5,
} as const;

// ---------------------------------------------------------------------------
// audit emit helper
// ---------------------------------------------------------------------------

async function emitAudit(input: AuditEventInput): Promise<{ auditId?: string }> {
  try {
    const auditService = getAuditService();
    const result = await auditService.emit(input);
    if (!result.ok) return {};
    return { auditId: result.value.id };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// inngest function
// ---------------------------------------------------------------------------

export const liveTradeFn = inngest.createFunction(
  { id: 'crypto-live-trade', retries: 0 },
  { event: 'crypto/live-trade.requested' },
  async ({ event, step }): Promise<LiveTradeResult> => {
    const {
      signalId,
      token,
      direction,
      departmentId,
      sizeUsd,
      slPrice,
      tpPrice,
      requestedBy,
      live,
      exchange,
    } = event.data;

    // step 0: defensive live-flag verification — refuse anything that
    // arrived through a buggy emit path without an explicit opt-in.
    // The HITL approver UX surfaces this flag too; rejecting here
    // before any LLM cost is incurred is a cheap belt-and-suspenders
    // check.
    if (live !== true) {
      await step.run('audit-live-flag-missing', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'crypto.trade.live-flag-missing',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { token, direction, departmentId },
        }),
      );
      return { status: 'live-flag-missing', signalId };
    }

    // step 0.5: SL/TP band validation — round-1 multi-model review
    // (Codex MEDIUM + Gemini MEDIUM): a fat-finger swap of slPrice
    // and tpPrice would let an obviously-malformed order reach HITL,
    // where a distracted approver could let it through. Validating
    // the band here rejects mathematical impossibilities before any
    // cost is incurred. The band invariant:
    //   long:  slPrice < tpPrice (else position is "stop above
    //          target", which exits with reason='sl' on entry)
    //   short: tpPrice < slPrice (mirror)
    // Numbers parsed once; failure surfaces a structured rejection.
    const slNum = parseFloat(slPrice);
    const tpNum = parseFloat(tpPrice);
    const bandValid = direction === 'long' ? slNum < tpNum : tpNum < slNum;
    if (Number.isNaN(slNum) || Number.isNaN(tpNum) || !bandValid) {
      const reason = `malformed SL/TP band: direction=${direction}, slPrice=${slPrice}, tpPrice=${tpPrice}`;
      await step.run('audit-band-invalid', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'crypto.trade.live-band-invalid',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { reason, token, direction, departmentId, slPrice, tpPrice },
        }),
      );
      return { status: 'rejected', signalId, reason };
    }

    // step 1: llm-analyze — same shape as paper-trade analysis but
    // attributed to the user via the typed wrapper (S18-A1).
    const llmResult = await step.run('llm-analyze', async () => {
      try {
        const gateway = getLlmGateway();
        const result = await completeWorkflowRequest({
          gateway,
          request: {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a crypto trading analyst. Evaluate this LIVE trade signal — slippage, market depth, R:R. Note that real capital is at stake.',
              },
              {
                role: 'user',
                content: `LIVE trade: ${token} ${direction} sized $${sizeUsd}, SL $${slPrice}, TP $${tpPrice}. Evaluate.`,
              },
            ],
            domain: 'crypto',
          },
          actor: resolveWorkflowActor({
            requestedBy: { userId: requestedBy, departmentId },
          }),
          options: { userId: requestedBy },
        });

        if (!result.ok) {
          return { success: false as const, error: result.error._tag };
        }
        return { success: true as const, analysis: result.value.completion.content };
      } catch (err: unknown) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    if (!llmResult.success) {
      return { status: 'error', step: 'llm-analyze', error: llmResult.error };
    }

    // step 2: risk-check — concurrent positions cap. R:R is left to
    // the HITL approver (see RISK_LIMITS comment above).
    const riskResult = await step.run('risk-check', async () => {
      try {
        const positionStore = getCryptoPositionStore();
        const openPositions = await positionStore.findOpen();
        if (openPositions.length >= RISK_LIMITS.maxConcurrentPositions) {
          return {
            success: false as const,
            reason: `Max concurrent positions (${RISK_LIMITS.maxConcurrentPositions}) reached`,
          };
        }
        return { success: true as const };
      } catch (err: unknown) {
        return {
          success: false as const,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    });

    if (!riskResult.success) {
      await step.run('audit-risk-rejection', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'crypto.trade.live-risk-rejected',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { reason: riskResult.reason, token, direction, departmentId },
        }),
      );
      return { status: 'risk-rejected', signalId, reason: riskResult.reason };
    }

    // step 3: daily-loss circuit-breaker check (FR-CRYPTO-RISK-002).
    // Fail-closed on breaker error — losing visibility into realized
    // losses for live trading is the riskier failure mode than
    // blocking a legitimate trade.
    const breakerResult = await step.run('circuit-breaker-check', async () => {
      const breaker = getDailyLossCircuitBreaker();
      const result = await breaker.checkEntry(departmentId);
      if (!result.ok) {
        return {
          success: false as const,
          reason: `circuit-breaker unavailable: ${result.error._tag}`,
        };
      }
      if (!result.value.allowed) {
        return {
          success: false as const,
          reason: result.value.reason ?? 'daily-loss limit reached',
        };
      }
      return { success: true as const };
    });

    if (!breakerResult.success) {
      await step.run('audit-circuit-breaker-block', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'crypto.trade.live-circuit-breaker-blocked',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: {
            reason: breakerResult.reason,
            token,
            direction,
            departmentId,
          },
        }),
      );
      return {
        status: 'circuit-breaker-blocked',
        signalId,
        reason: breakerResult.reason,
      };
    }

    // step 4: hitl-request — single-approver. The approver UX must
    // surface `live: true` clearly — paper and live use the same
    // approval template slug; the variables include the live flag so
    // the rendered notification differentiates.
    const hitlResult = await step.run('hitl-request', async () => {
      try {
        const deps = getHitlRequestDeps();
        const result = await createRequest(
          {
            workflowId: crypto.randomUUID(),
            domain: 'crypto',
            actionType: 'live-trade-approval',
            summary: `LIVE trade: ${token} ${direction} $${sizeUsd}`,
            details: {
              signalId,
              token,
              direction,
              sizeUsd,
              slPrice,
              tpPrice,
              departmentId,
              live: true,
              analysis: llmResult.analysis,
            },
            approverId: requestedBy, // routing handled by RBAC; placeholder
          },
          deps,
        );

        if (!result.ok) {
          return {
            success: false as const,
            error: `${result.error._tag}: ${result.error.message}`,
          };
        }

        // notification — fire-and-forget; live flag passed through so
        // the email/UI distinguishes paper from live
        try {
          const notif = getNotificationService();
          await notif.send({
            recipientId: 'approver',
            channel: 'email',
            templateSlug: 'crypto-live-trade-approval',
            variables: {
              token,
              direction,
              sizeUsd,
              live: 'true',
              requestId: result.value.requestId,
            },
          });
        } catch {
          // notification failure is non-blocking
        }

        return { success: true as const, requestId: result.value.requestId };
      } catch (err: unknown) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    if (!hitlResult.success) {
      return { status: 'error', step: 'hitl-request', error: hitlResult.error };
    }

    // step 5: wait for human decision (15m timeout for live trades)
    const decision = await step.waitForEvent('wait-for-live-decision', {
      event: 'hitl/decision.recorded',
      timeout: '15m',
      if: `async.data.requestId == '${hitlResult.requestId}'`,
    });

    if (decision === null) {
      await step.run('audit-live-expired', () =>
        emitAudit({
          actor: { id: requestedBy, type: 'user' },
          action: 'crypto.trade.live-expired',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { token, direction, departmentId, requestId: hitlResult.requestId },
        }),
      );
      return { status: 'expired', signalId };
    }

    const decisionData = decision.data;

    if (decisionData.decision === 'rejected') {
      await step.run('audit-live-rejected', () =>
        emitAudit({
          // S18-A1: post-HITL — attribute to the approver
          actor: decisionData.approverId
            ? { id: decisionData.approverId, type: 'user' as const }
            : { id: 'system', type: 'system' as const },
          action: 'crypto.trade.live-rejected',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: {
            token,
            direction,
            departmentId,
            requestId: hitlResult.requestId,
          },
        }),
      );
      return { status: 'rejected', signalId, reason: 'rejected by approver' };
    }

    // step 6: execute-live — call the exchange MCP adapter. If the
    // venue rejects (rate limit, insufficient liquidity, etc.) we
    // emit an audit with the failure tag and exit with
    // execution-failed. The position is NOT recorded — there's
    // nothing to monitor.
    const execResult = await step.run('execute-live', async () => {
      try {
        const adapter = getExchangeMcpAdapter();
        const result = await adapter.executeOrder({
          exchange,
          symbol: token,
          side: direction === 'long' ? 'buy' : 'sell',
          sizeUsd,
          clientOrderId: `live-${signalId}`,
        });
        if (!result.ok) {
          return { success: false as const, error: result.error };
        }
        return { success: true as const, fill: result.value };
      } catch (err: unknown) {
        return {
          success: false as const,
          error: {
            _tag: 'ExchangeUnavailable' as const,
            exchange,
            cause: err instanceof Error ? err.message : String(err),
          },
        };
      }
    });

    if (!execResult.success) {
      const reason = `${execResult.error._tag}`;
      await step.run('audit-execution-failed', () =>
        emitAudit({
          actor: decisionData.approverId
            ? { id: decisionData.approverId, type: 'user' as const }
            : { id: 'system', type: 'system' as const },
          action: 'crypto.trade.live-execution-failed',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { reason, token, direction, departmentId, exchange },
        }),
      );
      return { status: 'execution-failed', signalId, reason };
    }

    // step 7: record the position. executedBy carries the approver's
    // userId so the position-close audit (in the monitor cron) and
    // any downstream reporting attribute correctly.
    //
    // Round-1 multi-model review (Codex HIGH + Gemini HIGH): the
    // prior fallback `decisionData.approverId ?? requestedBy` was an
    // accountability hole. Live-trade attribution must be absolute —
    // a missing approverId means the gateway emitted an incomplete
    // decision and we should NOT proceed with the trade record. Fail
    // closed: the entry already filled at the venue, so we emit a
    // failure audit and exit `execution-failed`. Operations can
    // reconcile manually via the orphan venue order — `clientOrderId`
    // = `live-${signalId}` provides the dedupe key.
    if (!decisionData.approverId) {
      await step.run('audit-missing-approver-id', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'crypto.trade.live-execution-orphaned',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: {
            reason: 'decision payload missing approverId; live execution succeeded at the venue but the position was NOT recorded. Reconcile via clientOrderId.',
            clientOrderId: `live-${signalId}`,
            orderId: execResult.fill.orderId,
            fillPrice: execResult.fill.fillPrice,
            token,
            direction,
            departmentId,
            exchange,
          },
        }),
      );
      return {
        status: 'execution-failed',
        signalId,
        reason: 'missing-approver-id-post-execution',
      };
    }

    const positionResult = await step.run('store-position', async () => {
      const positionStore = getCryptoPositionStore();
      const executedBy = decisionData.approverId!;
      const { id } = await positionStore.create({
        signalId,
        departmentId,
        token,
        direction: direction === 'long' ? 'long' : 'short',
        exchange,
        entryPrice: execResult.fill.fillPrice,
        sizeUsd,
        slPrice,
        tpPrice,
        executedBy,
      });
      return { positionId: id, executedBy };
    });

    // step 8: signal status update — separate step so it's idempotent
    await step.run('mark-signal-executed', async () => {
      const signalStore = getCryptoTradeSignalStore();
      await signalStore.updateStatus(signalId, 'executed');
    });

    // step 9: audit-trail — post-HITL emit attributes to the approver.
    // This is the row that populates audit_logs.user_id and feeds the
    // anomaly aggregate (S18-A1).
    await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: positionResult.executedBy, type: 'user' },
        action: 'crypto.trade.live-executed',
        resource: { type: 'crypto-position', id: positionResult.positionId },
        domain: 'crypto',
        metadata: {
          signalId,
          token,
          direction,
          departmentId,
          exchange,
          live: true,
          orderId: execResult.fill.orderId,
          fillPrice: execResult.fill.fillPrice,
          sizeUsd,
        },
      }),
    );

    return {
      status: 'executed',
      positionId: positionResult.positionId,
      fillPrice: execResult.fill.fillPrice,
      orderId: execResult.fill.orderId,
      signalId,
    };
  },
);
