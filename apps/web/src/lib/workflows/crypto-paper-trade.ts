/**
 * S6-CRY-01: crypto paper trading workflow
 * @task S6-CRY-01
 * @frd docs/02-requirements/crypto-domain-frd.md §3.4, §4.4
 *
 * pipeline: signal created → LLM analysis → risk check → HITL approval →
 *           simulated execution → audit trail
 */

import { inngest } from '../inngest.js';
import {
  getLlmGateway,
  getAuditService,
  getCryptoTradeSignalStore,
  getCryptoExecutionStore,
  getHitlRequestDeps,
  getHitlMultiApproverService,
  getNotificationService,
} from '../services.js';
import { createRequest } from '@aptivo/hitl-gateway';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// workflow result types
// ---------------------------------------------------------------------------

export type PaperTradeResult =
  | { status: 'executed'; tradeId: string; entryPrice: string; signalId: string }
  | { status: 'rejected'; signalId: string; reason: string }
  | { status: 'expired'; signalId: string }
  | { status: 'risk-rejected'; signalId: string; reason: string }
  | { status: 'changes-requested'; signalId: string; comment: string }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// risk validation config
// ---------------------------------------------------------------------------

const RISK_LIMITS = {
  maxPositionPct: 0.03,      // 3% of portfolio per position
  maxConcurrentPositions: 5,
  minRewardRiskRatio: 2,     // minimum 1:2 R:R
} as const;

// ---------------------------------------------------------------------------
// helper: emit audit event (fire-and-forget, never blocks)
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

export const paperTradeFn = inngest.createFunction(
  { id: 'crypto-paper-trade', retries: 0 },
  { event: 'crypto/signal.created' },
  async ({ event, step }): Promise<PaperTradeResult> => {
    const { signalId, token, direction, confidenceScore } = event.data;

    // step 1: llm-analyze — LLM gateway analyzes signal reasoning
    const llmResult = await step.run('llm-analyze', async () => {
      try {
        const gateway = getLlmGateway();
        const result = await gateway.complete(
          {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a crypto trading analyst. Evaluate the trade signal and provide a brief risk assessment.',
              },
              {
                role: 'user',
                content: `Trade signal: ${token} ${direction} (confidence: ${confidenceScore}%). Evaluate risk/reward.`,
              },
            ],
            domain: 'crypto',
          },
          { userId: 'system' },
        );

        if (!result.ok) {
          return { success: false as const, error: result.error._tag };
        }
        return { success: true as const, analysis: result.value.completion.content };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!llmResult.success) {
      return { status: 'error', step: 'llm-analyze', error: llmResult.error };
    }

    // step 2: risk-check — validate position size, concurrent positions, R:R ratio
    const riskResult = await step.run('risk-check', async () => {
      try {
        const signalStore = getCryptoTradeSignalStore();
        const executionStore = getCryptoExecutionStore();

        // get signal details
        const signal = await signalStore.findById(signalId);
        if (!signal) {
          return { success: false as const, reason: 'Signal not found' };
        }

        // check concurrent open positions
        const openPositions = await executionStore.findOpen();
        if (openPositions.length >= RISK_LIMITS.maxConcurrentPositions) {
          return { success: false as const, reason: `Max concurrent positions (${RISK_LIMITS.maxConcurrentPositions}) reached` };
        }

        // check 3% position-size limit against portfolio value
        // uses open positions as portfolio proxy; first trade is always allowed
        if (openPositions.length > 0) {
          const paperTradeSizeUsd = 1000; // default paper trade size
          const portfolioValue = openPositions.reduce(
            (sum, pos) => sum + parseFloat(pos.sizeUsd ?? '0'),
            0,
          );
          if (portfolioValue > 0) {
            const positionPct = paperTradeSizeUsd / portfolioValue;
            if (positionPct > RISK_LIMITS.maxPositionPct) {
              return {
                success: false as const,
                reason: `Position size ${(positionPct * 100).toFixed(1)}% exceeds max ${RISK_LIMITS.maxPositionPct * 100}% of portfolio`,
              };
            }
          }
        }

        // check R:R ratio if stop loss and take profit are set
        if (signal.entryZone && signal.stopLoss && signal.takeProfit) {
          const entry = parseFloat(signal.entryZone);
          const sl = parseFloat(signal.stopLoss);
          const tp = parseFloat(signal.takeProfit);
          const risk = Math.abs(entry - sl);
          const reward = Math.abs(tp - entry);
          if (risk > 0 && reward / risk < RISK_LIMITS.minRewardRiskRatio) {
            return { success: false as const, reason: `R:R ratio ${(reward / risk).toFixed(2)} below minimum ${RISK_LIMITS.minRewardRiskRatio}` };
          }
        }

        return { success: true as const };
      } catch (err: unknown) {
        return { success: false as const, reason: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!riskResult.success) {
      // update signal status to rejected
      await step.run('reject-signal', async () => {
        const signalStore = getCryptoTradeSignalStore();
        await signalStore.updateStatus(signalId, 'rejected');
      });

      await step.run('audit-risk-rejection', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'crypto.signal.risk-rejected',
          resource: { type: 'trade-signal', id: signalId },
          domain: 'crypto',
          metadata: { reason: riskResult.reason, token, direction },
        }),
      );

      return { status: 'risk-rejected', signalId, reason: riskResult.reason };
    }

    // step 3: hitl-request — try multi-approver quorum, fall back to single-approver
    const hitlResult = await step.run('hitl-request', async () => {
      try {
        const multiService = getHitlMultiApproverService();

        // attempt multi-approver quorum policy (HITL2-07)
        if (multiService) {
          // create quorum policy: 2-of-3 risk reviewers
          const policy = await multiService.policyStore.create({
            name: `crypto-trade-${signalId}`,
            type: 'quorum',
            threshold: 2,
            approverRoles: ['risk_analyst', 'risk_analyst', 'risk_manager'],
            maxRetries: 3,
            timeoutSeconds: 900,
            escalationPolicy: null,
          });

          const approverIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

          const result = await multiService.createMultiApproverRequest({
            workflowId: crypto.randomUUID(),
            domain: 'crypto',
            actionType: 'trade-approval',
            summary: `Paper trade: ${token} ${direction} (confidence: ${confidenceScore}%)`,
            details: {
              signalId,
              token,
              direction,
              confidenceScore,
              analysis: llmResult.analysis,
            },
            approverIds,
            policyId: policy.id,
            ttlSeconds: 900,
          });

          if (result.ok) {
            return {
              success: true as const,
              requestId: result.value.requestId,
              isMultiApprover: true as const,
              policyId: policy.id,
              approverIds,
            };
          }
          // multi-approver failed — fall through to single-approver
        }

        // fallback: single-approver hitl
        const deps = getHitlRequestDeps();
        const result = await createRequest(
          {
            workflowId: crypto.randomUUID(),
            domain: 'crypto',
            actionType: 'trade-approval',
            summary: `Paper trade: ${token} ${direction} (confidence: ${confidenceScore}%)`,
            details: {
              signalId,
              token,
              direction,
              confidenceScore,
              analysis: llmResult.analysis,
            },
            approverId: crypto.randomUUID(), // placeholder — real approver from RBAC
          },
          deps,
        );

        if (!result.ok) {
          return { success: false as const, error: `${result.error._tag}: ${result.error.message}` };
        }
        return { success: true as const, requestId: result.value.requestId, isMultiApprover: false as const };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!hitlResult.success) {
      return { status: 'error', step: 'hitl-request', error: hitlResult.error };
    }

    // step 3a: emit multi-approver event if applicable
    if (hitlResult.isMultiApprover) {
      await step.run('emit-multi-approval-requested', async () => {
        await inngest.send({
          name: 'hitl/multi.approval.requested',
          data: {
            requestId: hitlResult.requestId,
            policyId: hitlResult.policyId!,
            approverIds: hitlResult.approverIds!,
            domain: 'crypto',
          },
        });
      });
    }

    // step 3b: notify approver — fire-and-forget
    await step.run('notify-approver', async () => {
      try {
        const notificationService = getNotificationService();
        await notificationService.send({
          recipientId: 'approver', // placeholder — real approver from RBAC
          channel: 'email',
          templateSlug: 'crypto-signal-approval',
          variables: {
            token,
            direction,
            confidenceScore: String(confidenceScore),
            requestId: hitlResult.requestId,
          },
        });
      } catch {
        // non-blocking: notification failure should not break the workflow
      }
    });

    // step 4: wait for human decision (15m timeout for paper trading)
    const decision = await step.waitForEvent('wait-for-trade-decision', {
      event: 'hitl/decision.recorded',
      timeout: '15m',
      if: `async.data.requestId == '${hitlResult.requestId}'`,
    });

    if (decision === null) {
      // timeout — mark signal as expired
      await step.run('expire-signal', async () => {
        const signalStore = getCryptoTradeSignalStore();
        await signalStore.updateStatus(signalId, 'expired');
      });
      return { status: 'expired', signalId };
    }

    const decisionData = decision.data as { requestId: string; decision: string; reason?: string; comment?: string };

    // handle request_changes — re-submission loop (HITL2-07)
    if (decisionData.decision === 'request_changes') {
      await step.run('emit-changes-requested', async () => {
        await inngest.send({
          name: 'hitl/changes.requested',
          data: {
            requestId: hitlResult.requestId,
            approverId: 'reviewer',
            comment: decisionData.comment ?? decisionData.reason ?? 'changes requested',
            retryCount: 1,
          },
        });
      });
      return {
        status: 'changes-requested',
        signalId,
        comment: decisionData.comment ?? decisionData.reason ?? 'changes requested',
      };
    }

    if (decisionData.decision === 'rejected') {
      await step.run('reject-by-human', async () => {
        const signalStore = getCryptoTradeSignalStore();
        await signalStore.updateStatus(signalId, 'rejected');
      });
      return {
        status: 'rejected',
        signalId,
        reason: decisionData.reason ?? 'rejected by approver',
      };
    }

    // step 5: execute-paper — simulate execution with slippage and fees
    const tradeResult = await step.run('execute-paper', async () => {
      try {
        const signalStore = getCryptoTradeSignalStore();
        const executionStore = getCryptoExecutionStore();

        const signal = await signalStore.findById(signalId);
        if (!signal) {
          return { success: false as const, error: 'Signal not found for execution' };
        }

        // simulate slippage: 0.5% adverse
        const basePrice = signal.entryZone ? parseFloat(signal.entryZone) : 100;
        const slippagePct = 0.005;
        const entryPrice = direction === 'long'
          ? basePrice * (1 + slippagePct)
          : basePrice * (1 - slippagePct);

        // simulate fees: 0.1%
        const sizeUsd = '1000.00'; // default paper trade size
        const feesPct = 0.001;
        const feesUsd = parseFloat(sizeUsd) * feesPct;

        const { id: tradeId } = await executionStore.create({
          signalId,
          exchange: 'paper',
          entryPrice: entryPrice.toFixed(8),
          sizeUsd,
          status: 'open',
          isPaper: true,
          riskData: {
            slippagePct,
            feesPct,
            feesUsd,
            analysis: llmResult.analysis,
          },
        });

        // update signal status
        await signalStore.updateStatus(signalId, 'executed');

        return {
          success: true as const,
          tradeId,
          entryPrice: entryPrice.toFixed(8),
        };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!tradeResult.success) {
      return { status: 'error', step: 'execute-paper', error: tradeResult.error };
    }

    // step 6: audit-trail — record trade lifecycle
    await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: 'system', type: 'workflow' },
        action: 'crypto.trade.paper-executed',
        resource: { type: 'trade-execution', id: tradeResult.tradeId },
        domain: 'crypto',
        metadata: {
          signalId,
          token,
          direction,
          entryPrice: tradeResult.entryPrice,
          isPaper: true,
          confidenceScore,
        },
      }),
    );

    return {
      status: 'executed',
      tradeId: tradeResult.tradeId,
      entryPrice: tradeResult.entryPrice,
      signalId,
    };
  },
);
