/**
 * S7-INT-02: admin dashboard aggregation store
 * @task S7-INT-02
 *
 * provides drizzle queries for admin overview, audit log pagination,
 * and hitl request listing.
 */

import { sql, eq, desc, and, like, gt } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { auditLogs } from '../schema/audit-logs.js';
import { hitlRequests } from '../schema/hitl-requests.js';

// -- types --

export interface AdminOverview {
  pendingHitlCount: number;
  activeWorkflowCount: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  domain: string | null;
  actorType: string;
  userId: string | null;
  timestamp: Date;
  metadata: unknown;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface HitlRequestEntry {
  id: string;
  workflowId: string;
  domain: string;
  actionType: string;
  summary: string;
  status: string;
  approverId: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface AdminStore {
  getPendingHitlCount(): Promise<number>;
  getActiveWorkflowCount(windowMs: number): Promise<number>;
  getRecentAuditLogs(limit: number): Promise<AuditLogEntry[]>;
  getAuditLogsPaginated(opts: {
    page: number;
    limit: number;
    resource?: string;
    actor?: string;
  }): Promise<PaginatedResult<AuditLogEntry>>;
  getHitlRequests(opts: {
    status?: string;
    limit?: number;
  }): Promise<HitlRequestEntry[]>;
}

// -- factory --

export function createDrizzleAdminStore(db: DrizzleClient): AdminStore {
  function mapAuditRow(r: typeof auditLogs.$inferSelect): AuditLogEntry {
    return {
      id: r.id,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      domain: r.domain,
      actorType: r.actorType,
      userId: r.userId,
      timestamp: r.timestamp,
      metadata: r.metadata,
    };
  }

  function mapHitlRow(r: typeof hitlRequests.$inferSelect): HitlRequestEntry {
    return {
      id: r.id,
      workflowId: r.workflowId,
      domain: r.domain,
      actionType: r.actionType,
      summary: r.summary,
      status: r.status,
      approverId: r.approverId,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    };
  }

  return {
    async getPendingHitlCount() {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hitlRequests)
        .where(eq(hitlRequests.status, 'pending'));
      return rows[0]?.count ?? 0;
    },

    async getActiveWorkflowCount(windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ count: sql<number>`count(distinct ${auditLogs.resourceId})::int` })
        .from(auditLogs)
        .where(
          and(
            like(auditLogs.action, 'workflow.%'),
            gt(auditLogs.timestamp, cutoff),
          ),
        );
      return rows[0]?.count ?? 0;
    },

    async getRecentAuditLogs(limit) {
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
        .limit(Math.min(limit, 200));
      return rows.map(mapAuditRow);
    },

    async getAuditLogsPaginated({ page, limit, resource, actor }) {
      const clampedLimit = Math.min(limit, 200);
      const offset = (page - 1) * clampedLimit;

      // build filter conditions
      const conditions = [];
      if (resource) conditions.push(eq(auditLogs.resourceType, resource));
      if (actor) conditions.push(eq(auditLogs.actorType, actor));

      const whereClause = conditions.length > 0
        ? and(...conditions)
        : undefined;

      // parallel: get data + count
      const [dataRows, countRows] = await Promise.all([
        whereClause
          ? db.select().from(auditLogs).where(whereClause).orderBy(desc(auditLogs.timestamp)).limit(clampedLimit).offset(offset)
          : db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(clampedLimit).offset(offset),
        whereClause
          ? db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(whereClause)
          : db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
      ]);

      return {
        data: dataRows.map(mapAuditRow),
        total: countRows[0]?.count ?? 0,
        page,
        limit: clampedLimit,
      };
    },

    async getHitlRequests({ status, limit: lim }) {
      const clampedLimit = Math.min(lim ?? 50, 200);

      const rows = status
        ? await db
            .select()
            .from(hitlRequests)
            .where(eq(hitlRequests.status, status as 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled'))
            .orderBy(desc(hitlRequests.createdAt))
            .limit(clampedLimit)
        : await db
            .select()
            .from(hitlRequests)
            .orderBy(desc(hitlRequests.createdAt))
            .limit(clampedLimit);

      return rows.map(mapHitlRow);
    },
  };
}
