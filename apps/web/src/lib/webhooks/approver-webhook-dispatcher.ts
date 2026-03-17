/**
 * NOTIF2-04: Per-Approver Webhook Notifications
 * @task NOTIF2-04
 *
 * dispatches webhook notifications to individual approvers when a
 * multi-approver HITL request is created. uses hmac signing for
 * payload verification.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

export interface ApproverWebhookConfig {
  webhookUrl: string; // base URL for approver webhooks
  signingSecret: string;
}

// ---------------------------------------------------------------------------
// payload type
// ---------------------------------------------------------------------------

export interface ApproverWebhookPayload {
  requestId: string;
  approverId: string;
  policyId: string;
  policyType: string;
  approveUrl: string;
  rejectUrl: string;
  summary: string;
  domain: string;
}

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export type ApproverWebhookError =
  | { readonly _tag: 'WebhookDispatchError'; readonly approverId: string; readonly cause: unknown };

// ---------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------

export interface ApproverWebhookDeps {
  dispatch: (url: string, payload: Record<string, unknown>, signature: string) => Promise<{ status: number }>;
  sign: (payload: string, secret: string) => string;
}

// ---------------------------------------------------------------------------
// result type
// ---------------------------------------------------------------------------

export interface ApproverWebhookResult {
  sent: number;
  failed: number;
  results: Array<{ approverId: string; success: boolean }>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createApproverWebhookDispatcher(deps: ApproverWebhookDeps, config: ApproverWebhookConfig) {
  return {
    async notifyApprovers(
      approvers: ApproverWebhookPayload[],
    ): Promise<Result<ApproverWebhookResult, ApproverWebhookError>> {
      const results: Array<{ approverId: string; success: boolean }> = [];
      let sent = 0;
      let failed = 0;

      for (const approver of approvers) {
        try {
          const body = JSON.stringify(approver);
          const signature = deps.sign(body, config.signingSecret);
          await deps.dispatch(
            `${config.webhookUrl}/approver/${approver.approverId}`,
            approver as unknown as Record<string, unknown>,
            signature,
          );
          results.push({ approverId: approver.approverId, success: true });
          sent++;
        } catch {
          results.push({ approverId: approver.approverId, success: false });
          failed++;
        }
      }

      return Result.ok({ sent, failed, results });
    },
  };
}
