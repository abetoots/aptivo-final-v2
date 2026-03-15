/**
 * P1.5-01: HITL drizzle persistence adapters
 * @task P1.5-01
 *
 * provides drizzle-backed request and decision stores for the hitl gateway.
 * replaces the stub in the composition root that returned { id: record.id }
 * without persisting anything.
 */

import { eq, desc, and } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { hitlRequests } from '../schema/hitl-requests.js';
import { hitlDecisions } from '../schema/hitl-decisions.js';

// ---------------------------------------------------------------------------
// request store types (compatible with @aptivo/hitl-gateway RequestStore)
// ---------------------------------------------------------------------------

export interface HitlRequestRecord {
  id: string;
  workflowId: string;
  workflowStepId?: string;
  domain: string;
  actionType: string;
  summary: string;
  details?: Record<string, unknown>;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled';
  tokenHash: string;
  tokenExpiresAt: Date;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface HitlRequestStore {
  insert(record: HitlRequestRecord): Promise<{ id: string }>;
  getRequests(opts: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<HitlRequestRecord[]>;
}

// ---------------------------------------------------------------------------
// decision store types (compatible with @aptivo/hitl-gateway DecisionStore)
// ---------------------------------------------------------------------------

export interface RequestSnapshot {
  id: string;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled';
  tokenHash: string;
  tokenExpiresAt: Date;
}

export interface ExistingDecision {
  id: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  decidedAt: Date;
}

export interface HitlDecisionRecord {
  id: string;
  requestId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  channel: string;
  ipAddress?: string;
  userAgent?: string;
  decidedAt: Date;
}

export interface HitlDecisionStore {
  getRequest(requestId: string): Promise<RequestSnapshot | null>;
  getDecisionByRequestId(requestId: string): Promise<ExistingDecision | null>;
  insertDecisionAndUpdateRequest(
    decision: HitlDecisionRecord,
    newStatus: 'approved' | 'rejected',
  ): Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// request store factory
// ---------------------------------------------------------------------------

export function createDrizzleHitlRequestStore(db: DrizzleClient): HitlRequestStore {
  return {
    async insert(record) {
      const rows = await db
        .insert(hitlRequests)
        .values({
          id: record.id,
          workflowId: record.workflowId,
          workflowStepId: record.workflowStepId ?? null,
          domain: record.domain,
          actionType: record.actionType,
          summary: record.summary,
          details: record.details ?? null,
          approverId: record.approverId,
          status: record.status,
          tokenHash: record.tokenHash,
          tokenExpiresAt: record.tokenExpiresAt,
          createdAt: record.createdAt,
          resolvedAt: record.resolvedAt ?? null,
        })
        .returning({ id: hitlRequests.id });

      return { id: rows[0]!.id };
    },

    async getRequests({ status, limit, offset }) {
      const clampedLimit = Math.min(limit, 200);

      const baseQuery = db
        .select()
        .from(hitlRequests)
        .orderBy(desc(hitlRequests.createdAt))
        .limit(clampedLimit)
        .offset(offset);

      const rows = status
        ? await db
            .select()
            .from(hitlRequests)
            .where(eq(hitlRequests.status, status as 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled'))
            .orderBy(desc(hitlRequests.createdAt))
            .limit(clampedLimit)
            .offset(offset)
        : await baseQuery;

      return rows.map(mapRequestRow);
    },
  };
}

// ---------------------------------------------------------------------------
// decision store factory
// ---------------------------------------------------------------------------

export function createDrizzleHitlDecisionStore(db: DrizzleClient): HitlDecisionStore {
  return {
    async getRequest(requestId) {
      const rows = await db
        .select({
          id: hitlRequests.id,
          approverId: hitlRequests.approverId,
          status: hitlRequests.status,
          tokenHash: hitlRequests.tokenHash,
          tokenExpiresAt: hitlRequests.tokenExpiresAt,
        })
        .from(hitlRequests)
        .where(eq(hitlRequests.id, requestId));

      return rows[0] ?? null;
    },

    async getDecisionByRequestId(requestId) {
      const rows = await db
        .select({
          id: hitlDecisions.id,
          approverId: hitlDecisions.approverId,
          decision: hitlDecisions.decision,
          decidedAt: hitlDecisions.decidedAt,
        })
        .from(hitlDecisions)
        .where(eq(hitlDecisions.requestId, requestId));

      return rows[0] ?? null;
    },

    async insertDecisionAndUpdateRequest(decision, newStatus) {
      return db.transaction(async (tx) => {
        // insert decision
        const decisionRows = await tx
          .insert(hitlDecisions)
          .values({
            id: decision.id,
            requestId: decision.requestId,
            approverId: decision.approverId,
            decision: decision.decision,
            comment: decision.comment ?? null,
            channel: decision.channel,
            ipAddress: decision.ipAddress ?? null,
            userAgent: decision.userAgent ?? null,
            decidedAt: decision.decidedAt,
          })
          .returning({ id: hitlDecisions.id });

        // update request status + resolvedAt
        await tx
          .update(hitlRequests)
          .set({
            status: newStatus,
            resolvedAt: decision.decidedAt,
          })
          .where(eq(hitlRequests.id, decision.requestId));

        return { id: decisionRows[0]!.id };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// row mapper
// ---------------------------------------------------------------------------

function mapRequestRow(r: typeof hitlRequests.$inferSelect): HitlRequestRecord {
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowStepId: r.workflowStepId ?? undefined,
    domain: r.domain,
    actionType: r.actionType,
    summary: r.summary,
    details: (r.details as Record<string, unknown>) ?? undefined,
    approverId: r.approverId,
    status: r.status,
    tokenHash: r.tokenHash,
    tokenExpiresAt: r.tokenExpiresAt,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? undefined,
  };
}
