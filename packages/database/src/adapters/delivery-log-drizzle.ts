/**
 * INT-W2: Drizzle adapter for DeliveryLogStore
 * @task INT-W2
 * @frd FR-CORE-NOTIF-001
 *
 * maps DeliveryLogEntry fields to the notification_deliveries schema:
 *   attempt (singular) -> attempts (plural)
 *   error -> lastError
 *   deliveredAt -> deliveredAt
 */

import { notificationDeliveries } from '../schema/notifications.js';
import type { DeliveryLogStore, DeliveryLogEntry } from '@aptivo/notifications';
import type { DrizzleClient } from './types.js';

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzleDeliveryLogStore(db: DrizzleClient): DeliveryLogStore {
  return {
    async record(log: DeliveryLogEntry): Promise<void> {
      await db
        .insert(notificationDeliveries)
        .values({
          recipientId: log.recipientId,
          channel: log.channel,
          templateSlug: log.templateSlug,
          transactionId: log.transactionId ?? null,
          status: log.status,
          // critical field mapping: singular -> plural
          attempts: log.attempt,
          // critical field mapping: error -> lastError
          lastError: log.error ?? null,
          deliveredAt: log.deliveredAt ?? null,
        });
    },
  };
}
