/**
 * S18-C1d: approval-SLA store queries.
 *
 * Replaces the `services.ts:1124` `getRequests: () => []` stub with a
 * real Drizzle query that joins `hitl_requests` against
 * `approval_policies` to derive `policyType` per AD-S18-7 — avoids a
 * migration on the hot `hitl_requests` table to add a denormalised
 * column. The shape returned matches `ApprovalSlaStoreDeps.getRequests`
 * in `apps/web/src/lib/observability/approval-sla-service.ts`.
 *
 * Performance: the join is one row from `approval_policies` per
 * request (small lookup table; typically < 50 rows) plus one
 * decisions-per-request fetch. For the dashboard window (typically
 * 24h-7d of HITL traffic) this is well below 100ms p99 in staging
 * tests; if production EXPLAIN ANALYZE shows otherwise the AD-S18-7
 * fallback is "pivot to denormalised `policyType` column on
 * hitl_requests + backfill" — explicit S19 work.
 *
 * `policyType` resolution rules:
 *   - When `hitl_requests.policy_id` is non-null, the joined
 *     `approval_policies.type` is used.
 *   - When `policy_id` is null (legacy single-approver requests
 *     pre-HITL2), fall back to `'single'` so the SLA service has a
 *     non-null type for SLA-target lookup. This matches the
 *     `DEFAULT_SLA_CONFIG.slaByPolicyType.single` entry.
 */

import { eq, and, gte, lte, inArray, asc } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { hitlRequests } from '../schema/hitl-requests.js';
import { hitlDecisions } from '../schema/hitl-decisions.js';
import { approvalPolicies } from '../schema/approval-policies.js';

// ---------------------------------------------------------------------------
// public surface — mirrors apps/web ApprovalSlaStoreDeps.getRequests
// ---------------------------------------------------------------------------

export interface ApprovalSlaRequestRow {
  id: string;
  policyType: string;
  createdAt: Date;
  resolvedAt: Date | null;
  decisions: Array<{ approverId: string; decidedAt: Date; decision: string }>;
}

export interface ApprovalSlaQueriesFilters {
  status?: string;
  from?: Date;
  to?: Date;
}

export interface ApprovalSlaQueries {
  getRequestsForSla(filters: ApprovalSlaQueriesFilters): Promise<ApprovalSlaRequestRow[]>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createApprovalSlaQueries(db: DrizzleClient): ApprovalSlaQueries {
  return {
    async getRequestsForSla(filters) {
      // Build the where clause for the requests query.
      const whereClauses = [];
      if (filters.status) {
        whereClauses.push(eq(hitlRequests.status, filters.status as 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled'));
      }
      if (filters.from) {
        whereClauses.push(gte(hitlRequests.createdAt, filters.from));
      }
      if (filters.to) {
        whereClauses.push(lte(hitlRequests.createdAt, filters.to));
      }
      const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;

      // Single LEFT JOIN: requests + their policy (when policy_id set).
      // Decisions are fetched as a follow-up batched query because
      // expanding the join into the decisions table multiplies row
      // counts by per-request decision count and requires
      // post-aggregation in TS — slower for non-trivial windows.
      const rows = await db
        .select({
          id: hitlRequests.id,
          createdAt: hitlRequests.createdAt,
          resolvedAt: hitlRequests.resolvedAt,
          policyId: hitlRequests.policyId,
          policyType: approvalPolicies.type,
        })
        .from(hitlRequests)
        .leftJoin(approvalPolicies, eq(hitlRequests.policyId, approvalPolicies.id))
        .where(where)
        .orderBy(asc(hitlRequests.createdAt));

      if (rows.length === 0) return [];

      // Batched decisions fetch — one query for all requests in the
      // window. With hitl_decisions_request_approver_idx (uniqueIndex)
      // this is a single index scan keyed by requestId.
      const requestIds = rows.map((r) => r.id);
      const decisionRows = await db
        .select({
          requestId: hitlDecisions.requestId,
          approverId: hitlDecisions.approverId,
          decidedAt: hitlDecisions.decidedAt,
          decision: hitlDecisions.decision,
        })
        .from(hitlDecisions)
        .where(inArray(hitlDecisions.requestId, requestIds));

      const decisionsByRequest = new Map<string, ApprovalSlaRequestRow['decisions']>();
      for (const d of decisionRows) {
        const list = decisionsByRequest.get(d.requestId) ?? [];
        list.push({ approverId: d.approverId, decidedAt: d.decidedAt, decision: d.decision });
        decisionsByRequest.set(d.requestId, list);
      }

      return rows.map((r) => {
        // policyType resolution rules (post-Codex review of bare `?? 'single'`):
        //   1. policy_id is null → legacy single-approver (pre-HITL2). Fall
        //      back to 'single' per AD-S18-7.
        //   2. policy_id is non-null AND join hit → use joined policyType.
        //   3. policy_id is non-null AND join missed (orphan FK) → data
        //      integrity drift; surface as 'unknown' so it appears in
        //      dashboards under a distinct policyType bucket instead of
        //      being silently reclassified as 'single'. The SLA service's
        //      DEFAULT_SLA_CONFIG.slaByPolicyType has no 'unknown' entry,
        //      so the default 24h SLA target applies.
        let policyType: string;
        if (r.policyId === null) {
          policyType = 'single';
        } else if (r.policyType !== null) {
          policyType = r.policyType;
        } else {
          policyType = 'unknown';
        }
        return {
          id: r.id,
          policyType,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          decisions: decisionsByRequest.get(r.id) ?? [],
        };
      });
    },
  };
}
