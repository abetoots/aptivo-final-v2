/**
 * NOTIF-01: Novu notification adapter
 * @task NOTIF-01
 * @frd FR-CORE-NOTIF-001
 * @warning S7-W26 — traceId injected into novu trigger payload metadata (INT-08)
 *
 * Generalizes the HITL-08 Novu adapter into a reusable adapter
 * implementing the NotificationAdapter interface.
 *
 * Uses injectable NovuClient — same SDK-decoupled pattern as HITL-08.
 */

import { Result } from '@aptivo/types';
import type {
  AdapterSendParams,
  NotificationAdapter,
  NotificationError,
  SubscriberData,
} from '../types.js';

// ---------------------------------------------------------------------------
// novu client interface (injectable — SDK-decoupled)
// ---------------------------------------------------------------------------

export interface NovuClient {
  trigger(workflowId: string, payload: NovuTriggerPayload): Promise<NovuTriggerResult>;
  identify?(subscriberId: string, data: Record<string, unknown>): Promise<void>;
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

export interface NovuAdapterConfig {
  /** novu workflow ID for generic notifications */
  workflowId: string;
}

const DEFAULT_CONFIG: NovuAdapterConfig = {
  workflowId: 'generic-notification',
};

// ---------------------------------------------------------------------------
// adapter implementation
// ---------------------------------------------------------------------------

export class NovuNotificationAdapter implements NotificationAdapter {
  private readonly client: NovuClient;
  private readonly config: NovuAdapterConfig;

  constructor(client: NovuClient, config?: Partial<NovuAdapterConfig>) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async send(params: AdapterSendParams): Promise<Result<{ id: string }, NotificationError>> {
    try {
      // INT-08 (S7-W26): extract traceId from metadata for novu correlation
      const { traceId, traceparent, ...restMetadata } = (params.metadata ?? {}) as Record<string, unknown>;

      const result = await this.client.trigger(this.config.workflowId, {
        to: { subscriberId: params.recipientId },
        payload: {
          channel: params.channel,
          subject: params.subject,
          body: params.body,
          ...restMetadata,
          // INT-08 (S7-W26): propagate trace context in novu payload
          ...(traceId ? { traceId } : {}),
          ...(traceparent ? { traceparent } : {}),
        },
        transactionId: params.transactionId,
      });

      return Result.ok({ id: result.transactionId ?? params.transactionId ?? crypto.randomUUID() });
    } catch (cause) {
      return Result.err({
        _tag: 'DeliveryFailed',
        message: cause instanceof Error ? cause.message : 'Unknown Novu delivery error',
        cause,
        attempts: 1,
      });
    }
  }

  async upsertSubscriber(id: string, data: SubscriberData): Promise<Result<void, NotificationError>> {
    if (!this.client.identify) {
      // noop if the client doesn't support identify
      return Result.ok(undefined);
    }

    try {
      await this.client.identify(id, {
        email: data.email,
        phone: data.phone,
        firstName: data.name,
        ...data.metadata,
      });
      return Result.ok(undefined);
    } catch (cause) {
      return Result.err({
        _tag: 'DeliveryFailed',
        message: cause instanceof Error ? cause.message : 'Failed to upsert subscriber',
        cause,
        attempts: 1,
      });
    }
  }
}
