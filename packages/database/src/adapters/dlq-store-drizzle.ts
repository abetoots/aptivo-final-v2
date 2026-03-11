/**
 * INT-W1: Drizzle adapter for DlqStore
 * @task INT-W1
 * @frd FR-CORE-AUD-001
 *
 * implements the DlqStore interface from @aptivo/audit/async using drizzle-orm
 * against the audit_write_dlq table.
 */

import { eq, and, lte, sql } from 'drizzle-orm';
import type { DlqStore, DlqEntry } from '@aptivo/audit/async';
import { auditWriteDlq } from '../schema/audit-logs.js';
import type { DrizzleClient } from './types.js';

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * creates a drizzle-backed DLQ store for audit write failures.
 */
export function createDrizzleDlqStore(db: DrizzleClient): DlqStore {
  return {
    async insert(entry: DlqEntry): Promise<void> {
      await db
        .insert(auditWriteDlq)
        .values({
          ...(entry.id ? { id: entry.id } : {}),
          payload: entry.payload,
          error: entry.error,
          attemptCount: entry.attemptCount,
          maxAttempts: entry.maxAttempts,
          nextRetryAt: entry.nextRetryAt ?? null,
          status: entry.status,
        });
    },

    async getPending(limit: number): Promise<DlqEntry[]> {
      const now = new Date();
      const rows = await db
        .select()
        .from(auditWriteDlq)
        .where(
          and(
            eq(auditWriteDlq.status, 'pending'),
            lte(auditWriteDlq.nextRetryAt, now),
          ),
        )
        .limit(limit);

      return rows.map((row: typeof auditWriteDlq.$inferSelect) => ({
        id: row.id,
        payload: row.payload as DlqEntry['payload'],
        error: row.error,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        nextRetryAt: row.nextRetryAt ?? undefined,
        status: row.status,
      }));
    },

    async markRetrying(id: string): Promise<void> {
      await db
        .update(auditWriteDlq)
        .set({ status: 'retrying' as const, updatedAt: new Date() })
        .where(eq(auditWriteDlq.id, id));
    },

    async markExhausted(id: string): Promise<void> {
      await db
        .update(auditWriteDlq)
        .set({ status: 'exhausted' as const, updatedAt: new Date() })
        .where(eq(auditWriteDlq.id, id));
    },

    async markReplayed(id: string): Promise<void> {
      await db
        .update(auditWriteDlq)
        .set({ status: 'replayed' as const, updatedAt: new Date() })
        .where(eq(auditWriteDlq.id, id));
    },

    async incrementAttempt(id: string, nextRetryAt?: Date): Promise<void> {
      await db
        .update(auditWriteDlq)
        .set({
          attemptCount: sql`${auditWriteDlq.attemptCount} + 1`,
          nextRetryAt: nextRetryAt ?? null,
          status: 'pending' as const,
          updatedAt: new Date(),
        })
        .where(eq(auditWriteDlq.id, id));
    },
  };
}
