/**
 * INT-W2: Drizzle adapter for NotificationPreferenceStore
 * @task INT-W2
 * @frd FR-CORE-NOTIF-001
 *
 * implements per-user per-channel opt-out using upsert on unique (userId, channel).
 */

import { eq, and } from 'drizzle-orm';
import { notificationPreferences } from '../schema/notifications.js';
import type { NotificationPreferenceStore } from '@aptivo/notifications';
import type { DrizzleClient } from './types.js';

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzlePreferenceStore(db: DrizzleClient): NotificationPreferenceStore {
  return {
    async isOptedOut(userId: string, channel: string): Promise<boolean> {
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.channel, channel),
          ),
        );

      if (rows.length === 0) return false;
      return rows[0]!.optedOut;
    },

    async setOptOut(userId: string, channel: string, optedOut: boolean): Promise<void> {
      await db
        .insert(notificationPreferences)
        .values({ userId, channel, optedOut })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.channel],
          set: { optedOut, updatedAt: new Date() },
        });
    },
  };
}
