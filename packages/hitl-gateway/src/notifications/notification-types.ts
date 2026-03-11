/**
 * HITL-08: Novu Notification Types
 * @task HITL-08
 * @frd FR-CORE-HITL-005
 *
 * Defines the injectable NovuClient interface and notification types.
 * Follows SDK-decoupled pattern (same as LLM providers — inject client, don't import SDK).
 */

// ---------------------------------------------------------------------------
// novu client interface (injectable — SDK-decoupled)
// ---------------------------------------------------------------------------

/**
 * Minimal Novu SDK trigger interface.
 * Consumers inject a real `@novu/node` Novu instance; tests inject mocks.
 */
export interface NovuClient {
  trigger(workflowId: string, payload: NovuTriggerPayload): Promise<NovuTriggerResult>;
}

export interface NovuTriggerPayload {
  to: { subscriberId: string };
  payload: Record<string, unknown>;
  transactionId?: string;
}

export interface NovuTriggerResult {
  acknowledged: boolean;
  transactionId?: string;
}

// ---------------------------------------------------------------------------
// approval notification params
// ---------------------------------------------------------------------------

export interface ApprovalNotificationParams {
  requestId: string;
  approverId: string;
  approverName?: string;
  summary: string;
  approveUrl: string;
  rejectUrl: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// notification errors
// ---------------------------------------------------------------------------

export type NotificationError =
  | { _tag: 'DeliveryFailed'; message: string; cause: unknown }
  | { _tag: 'InvalidParams'; message: string };

// ---------------------------------------------------------------------------
// adapter configuration
// ---------------------------------------------------------------------------

export interface NotificationAdapterConfig {
  /** novu workflow ID for approval notifications */
  approvalWorkflowId: string;
}

export const DEFAULT_NOTIFICATION_CONFIG: Required<NotificationAdapterConfig> = {
  approvalWorkflowId: 'hitl-approval-request',
};
