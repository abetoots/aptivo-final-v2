/**
 * NOTIF-03: HITL notification compatibility shim
 * @task NOTIF-03
 * @frd FR-CORE-HITL-006
 *
 * Routes HITL-08 sendNotification calls through the new NotificationService.
 * Keeps the existing HITL workflow public API unchanged.
 *
 * The shim maps HITL approval notification params to NotificationService.send()
 * with a fixed template slug ('hitl-approval-request').
 */

import type { NotificationService } from '../types.js';

// ---------------------------------------------------------------------------
// types (matching HITL-08 createSendNotification signature)
// ---------------------------------------------------------------------------

export interface HitlNotificationParams {
  requestId: string;
  approverId: string;
  summary: string;
  approveUrl: string;
  rejectUrl: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * Creates a `sendNotification` function compatible with HITL workflow deps.
 *
 * Internally routes through NotificationService.send() with the
 * 'hitl-approval-request' template.
 */
export function createHitlNotificationShim(
  notificationService: NotificationService,
  options?: { templateSlug?: string; channel?: 'email' | 'telegram' | 'push' },
): (params: HitlNotificationParams) => Promise<void> {
  const templateSlug = options?.templateSlug ?? 'hitl-approval-request';
  const channel = options?.channel ?? 'email';

  return async (params: HitlNotificationParams): Promise<void> => {
    const result = await notificationService.send({
      recipientId: params.approverId,
      channel,
      templateSlug,
      variables: {
        approverName: params.approverId,
        summary: params.summary,
        approveUrl: params.approveUrl,
        rejectUrl: params.rejectUrl,
        expiresAt: params.expiresAt.toISOString(),
        requestId: params.requestId,
      },
      transactionId: params.requestId,
    });

    if (!result.ok) {
      // match HITL-08 behavior: throw on failure so workflow step returns { sent: false }
      throw new Error(`Notification delivery failed: ${result.error._tag}`);
    }
  };
}
