/**
 * NOTIF2-01: Failover notification adapter
 * @task NOTIF2-01
 *
 * composition adapter that wraps two NotificationAdapter instances.
 * on primary DeliveryFailed, transparently retries with the secondary.
 * non-delivery errors (InvalidParams, RecipientOptedOut, etc.) are
 * never retried — they indicate a problem with the request, not the transport.
 */

import type {
  AdapterSendParams,
  NotificationAdapter,
  NotificationError,
  SubscriberData,
} from '../types.js';
import type { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// failover policy
// ---------------------------------------------------------------------------

export type FailoverPolicy = 'novu_primary' | 'smtp_primary' | 'single';

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createFailoverAdapter(
  primary: NotificationAdapter,
  secondary: NotificationAdapter,
  policy: FailoverPolicy,
): NotificationAdapter {
  return {
    async send(
      params: AdapterSendParams,
    ): Promise<Result<{ id: string }, NotificationError>> {
      // single policy — no fallback
      if (policy === 'single') {
        return primary.send(params);
      }

      const result = await primary.send(params);
      if (result.ok) return result;

      // only failover on delivery failures, not validation errors
      if (result.error._tag !== 'DeliveryFailed') return result;

      console.warn(
        `notification failover: ${policy} primary failed, trying secondary`,
      );
      return secondary.send(params);
    },

    // subscriber management delegates to primary only
    async upsertSubscriber(
      id: string,
      data: SubscriberData,
    ): Promise<Result<void, NotificationError>> {
      return primary.upsertSubscriber(id, data);
    },
  };
}
