/**
 * HITL-07: Inngest Workflow Integration
 * @task HITL-07
 * @frd FR-CORE-HITL-002
 * @guidelines §8b (Saga Pattern Enforcement — return-value-based flow)
 * @warning S7-W24 — traceparent propagated through HITL event payloads (INT-08)
 *
 * Wires the end-to-end pause/resume flow:
 *   1. step.run('create-hitl-request') → DB insert + token mint
 *   2. step.run('send-notification') → Novu trigger (fire-and-forget)
 *   3. step.waitForEvent('wait-for-decision') → pauses workflow
 *   4. Decision API (HITL-06) records decision → emits 'hitl/decision.recorded'
 *   5. Inngest resumes → approve/reject/timeout branch
 *
 * Uses safeSagaStep pattern: return-value-based flow, no try/catch around step.run().
 */

import type { Inngest } from 'inngest';
import type { CreateRequestResult, RequestError } from '../request/request-types.js';
import type { HitlApprovalResult, HitlApprovalRequestData, HitlDecisionRecordedData } from './event-schemas.js';
import { HITL_EVENTS } from './event-schemas.js';

// ---------------------------------------------------------------------------
// workflow dependencies (injected at function creation time)
// ---------------------------------------------------------------------------

export interface HitlWorkflowDeps {
  /** creates a HITL request (HITL-05 service) */
  createRequest: (input: HitlApprovalRequestData) => Promise<
    { ok: true; value: CreateRequestResult } | { ok: false; error: RequestError }
  >;
  /** sends approval notification (HITL-08 — optional, fire-and-forget) */
  sendNotification?: (params: {
    requestId: string;
    approverId: string;
    summary: string;
    approveUrl: string;
    rejectUrl: string;
    expiresAt: Date;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// workflow configuration
// ---------------------------------------------------------------------------

export interface HitlWorkflowConfig {
  /** Inngest function ID */
  functionId?: string;
  /** wait timeout (default '24h') */
  waitTimeout?: string;
}

const DEFAULT_CONFIG: Required<HitlWorkflowConfig> = {
  functionId: 'hitl-approval-workflow',
  waitTimeout: '24h',
};

// ---------------------------------------------------------------------------
// factory — creates the Inngest function
// ---------------------------------------------------------------------------

/**
 * Creates an Inngest function for the HITL approval workflow.
 *
 * @param inngest - the Inngest client instance (from the web app)
 * @param deps - injectable service dependencies
 * @param config - optional function configuration
 */
export function createHitlApprovalFunction(
  inngest: Inngest.Any,
  deps: HitlWorkflowDeps,
  config?: HitlWorkflowConfig,
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return inngest.createFunction(
    { id: cfg.functionId, retries: 0 },
    { event: HITL_EVENTS.APPROVAL_REQUESTED },
    async ({ event, step }): Promise<HitlApprovalResult> => {
      const data = event.data as HitlApprovalRequestData;

      // INT-08 (S7-W24): extract traceparent from incoming event for propagation
      const traceparent = data.traceparent;

      // step 1 — create HITL request (DB insert + token mint)
      const requestResult = await step.run('create-hitl-request', async () => {
        const result = await deps.createRequest(data);
        if (!result.ok) {
          return {
            success: false as const,
            error: result.error._tag + ': ' + ('message' in result.error ? result.error.message : 'Unknown error'),
          };
        }
        return {
          success: true as const,
          requestId: result.value.requestId,
          approveUrl: result.value.approveUrl,
          rejectUrl: result.value.rejectUrl,
          tokenExpiresAt: result.value.tokenExpiresAt.toISOString(),
          // INT-08 (S7-W24): propagate traceparent through step memoization
          ...(traceparent ? { traceparent } : {}),
        };
      });

      // return-value-based flow (safeSagaStep pattern — §8b)
      if (!requestResult.success) {
        return {
          status: 'error',
          requestId: '', // no request was created
          error: requestResult.error,
        };
      }

      // step 2 — send notification (fire-and-forget)
      if (deps.sendNotification) {
        await step.run('send-notification', async () => {
          try {
            await deps.sendNotification!({
              requestId: requestResult.requestId,
              approverId: data.approverId,
              summary: data.summary,
              approveUrl: requestResult.approveUrl,
              rejectUrl: requestResult.rejectUrl,
              expiresAt: new Date(requestResult.tokenExpiresAt),
            });
            return { sent: true };
          } catch {
            // fire-and-forget: notification failure doesn't block the workflow
            return { sent: false };
          }
        });
      }

      // step 3 — wait for human decision
      // use `if` expression instead of `match` because the triggering event
      // (hitl/approval.requested) does not have data.requestId — the requestId
      // is created in step 1 and only exists in the decision event.
      const decision = await step.waitForEvent('wait-for-decision', {
        event: HITL_EVENTS.DECISION_RECORDED,
        timeout: cfg.waitTimeout,
        if: `async.data.requestId == '${requestResult.requestId}'`,
      });

      // step 4 — process decision (approve / reject / timeout)
      if (decision === null) {
        // timeout — no human responded within the window
        return await step.run('handle-timeout', () => ({
          status: 'expired' as const,
          requestId: requestResult.requestId,
        }));
      }

      const decisionData = decision.data as HitlDecisionRecordedData;

      if (decisionData.decision === 'rejected') {
        return await step.run('handle-rejection', () => ({
          status: 'rejected' as const,
          requestId: requestResult.requestId,
          approverId: decisionData.approverId,
          decidedAt: decisionData.decidedAt,
        }));
      }

      return await step.run('handle-approval', () => ({
        status: 'approved' as const,
        requestId: requestResult.requestId,
        approverId: decisionData.approverId,
        decidedAt: decisionData.decidedAt,
      }));
    },
  );
}
