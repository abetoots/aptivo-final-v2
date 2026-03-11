/**
 * HITL-08: Novu Notification Adapter
 * @task HITL-08
 * @frd FR-CORE-HITL-005
 * @guidelines §2.1 (Functional Core — Result types for errors)
 *
 * Fire-and-forget notification adapter for HITL approval requests.
 * Uses requestId as transactionId for Novu dedup (SP-04 pattern).
 */

import { Result } from '@aptivo/types';
import type {
  NovuClient,
  ApprovalNotificationParams,
  NotificationError,
  NotificationAdapterConfig,
} from './notification-types.js';
import { DEFAULT_NOTIFICATION_CONFIG } from './notification-types.js';

// ---------------------------------------------------------------------------
// send approval notification
// ---------------------------------------------------------------------------

/**
 * Sends an approval notification via Novu.
 *
 * - Uses requestId as Novu transactionId for dedup (SP-04/T1-W24)
 * - Fire-and-forget: delivery failures return Result.err, never throw
 * - Template variables: approverName, summary, approveUrl, rejectUrl, expiresAt
 */
export async function sendApprovalNotification(
  params: ApprovalNotificationParams,
  client: NovuClient,
  config?: NotificationAdapterConfig,
): Promise<Result<{ transactionId: string }, NotificationError>> {
  const cfg = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };

  // validate required params
  if (!params.requestId || !params.approverId || !params.approveUrl || !params.rejectUrl) {
    return Result.err({
      _tag: 'InvalidParams',
      message: 'Missing required notification parameters: requestId, approverId, approveUrl, rejectUrl',
    });
  }

  try {
    const result = await client.trigger(cfg.approvalWorkflowId, {
      to: { subscriberId: params.approverId },
      payload: {
        approverName: params.approverName ?? params.approverId,
        summary: params.summary,
        approveUrl: params.approveUrl,
        rejectUrl: params.rejectUrl,
        expiresAt: params.expiresAt.toISOString(),
        requestId: params.requestId,
      },
      transactionId: params.requestId,
    });

    return Result.ok({ transactionId: result.transactionId ?? params.requestId });
  } catch (cause) {
    return Result.err({
      _tag: 'DeliveryFailed',
      message: cause instanceof Error ? cause.message : 'Unknown Novu delivery error',
      cause,
    });
  }
}

// ---------------------------------------------------------------------------
// factory: create sendNotification for HitlWorkflowDeps
// ---------------------------------------------------------------------------

/**
 * Creates a `sendNotification` function compatible with HitlWorkflowDeps.
 * Wraps sendApprovalNotification for the workflow's fire-and-forget pattern.
 */
export function createSendNotification(
  client: NovuClient,
  config?: NotificationAdapterConfig,
): (params: {
  requestId: string;
  approverId: string;
  summary: string;
  approveUrl: string;
  rejectUrl: string;
  expiresAt: Date;
}) => Promise<void> {
  return async (params) => {
    const result = await sendApprovalNotification(params, client, config);
    if (!result.ok) {
      // throw so the workflow step catches and returns { sent: false } (hitl-step.ts)
      throw new Error(`Notification delivery failed: ${result.error.message}`);
    }
  };
}
