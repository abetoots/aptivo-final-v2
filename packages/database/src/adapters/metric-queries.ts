/**
 * S7-CF-01: metric aggregation queries for SLO and dashboard APIs
 * @task S7-CF-01
 *
 * provides drizzle COUNT/AVG queries consumed by the MetricService.
 * all queries use time-range filters indexed on timestamp columns.
 */

import { sql, eq, and, gte, like } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { auditWriteDlq } from '../schema/audit-logs.js';
import { auditLogs } from '../schema/audit-logs.js';
import { hitlRequests } from '../schema/hitl-requests.js';
import { notificationDeliveries } from '../schema/notifications.js';

// -- types --

export interface MetricQueryDeps {
  countDlqPending: () => Promise<number>;
  countAuditByAction: (pattern: string, windowMs: number) => Promise<number>;
  countHitlByStatus: (status: string, windowMs: number) => Promise<number>;
  getHitlP95LatencyMs: (windowMs: number) => Promise<number>;
  countDeliveriesByStatus: (status: string, windowMs: number) => Promise<number>;
  countDeliveriesTotal: (windowMs: number) => Promise<number>;
}

// -- factory --

export function createMetricQueries(db: DrizzleClient): MetricQueryDeps {
  return {
    async countDlqPending() {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditWriteDlq)
        .where(eq(auditWriteDlq.status, 'pending'));
      return rows[0]?.count ?? 0;
    },

    async countAuditByAction(pattern, windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(
          and(
            like(auditLogs.action, pattern),
            gte(auditLogs.timestamp, cutoff),
          ),
        );
      return rows[0]?.count ?? 0;
    },

    async countHitlByStatus(status, windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hitlRequests)
        .where(
          and(
            eq(hitlRequests.status, status as 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled'),
            gte(hitlRequests.createdAt, cutoff),
          ),
        );
      return rows[0]?.count ?? 0;
    },

    async getHitlP95LatencyMs(windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      // CR-3: p95 HITL notification delivery latency per BRD §5.1.
      // Measures created_at → delivered_at for HITL approval notifications —
      // NOT hitl_requests resolution time (which is human decision time).
      const rows = await db
        .select({
          p95: sql<number>`
            coalesce(
              percentile_cont(0.95) within group (
                order by extract(epoch from (${notificationDeliveries.deliveredAt} - ${notificationDeliveries.createdAt})) * 1000
              ),
              0
            )::int
          `,
        })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.templateSlug, 'hitl-approval-request'),
            sql`${notificationDeliveries.deliveredAt} is not null`,
            gte(notificationDeliveries.createdAt, cutoff),
          ),
        );
      return rows[0]?.p95 ?? 0;
    },

    async countDeliveriesByStatus(status, windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.status, status as 'pending' | 'delivered' | 'failed' | 'retrying' | 'opted_out'),
            gte(notificationDeliveries.createdAt, cutoff),
          ),
        );
      return rows[0]?.count ?? 0;
    },

    async countDeliveriesTotal(windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationDeliveries)
        .where(gte(notificationDeliveries.createdAt, cutoff));
      return rows[0]?.count ?? 0;
    },
  };
}
