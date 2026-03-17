/**
 * HITL2-01: Approval Policy drizzle adapter
 * @task HITL2-01
 *
 * provides drizzle-backed implementation of ApprovalPolicyStore
 * for approval policy persistence.
 */

import { eq, desc } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { approvalPolicies } from '../schema/approval-policies.js';

// ---------------------------------------------------------------------------
// types (compatible with @aptivo/hitl-gateway ApprovalPolicyStore)
// ---------------------------------------------------------------------------

export interface ApprovalPolicyRecord {
  id: string;
  name: string;
  type: 'single' | 'quorum' | 'sequential';
  threshold: number | null;
  approverRoles: string[];
  maxRetries: number;
  timeoutSeconds: number;
  escalationPolicy: { timeoutAction: string; escalateToRole?: string } | null;
  createdAt: Date;
}

export interface ApprovalPolicyStore {
  create(policy: Omit<ApprovalPolicyRecord, 'id' | 'createdAt'>): Promise<ApprovalPolicyRecord>;
  findById(id: string): Promise<ApprovalPolicyRecord | null>;
  findByName(name: string): Promise<ApprovalPolicyRecord | null>;
  list(): Promise<ApprovalPolicyRecord[]>;
}

// ---------------------------------------------------------------------------
// row mapper
// ---------------------------------------------------------------------------

function mapRow(r: typeof approvalPolicies.$inferSelect): ApprovalPolicyRecord {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    threshold: r.threshold,
    approverRoles: r.approverRoles,
    maxRetries: r.maxRetries,
    timeoutSeconds: r.timeoutSeconds,
    escalationPolicy: r.escalationPolicy ?? null,
    createdAt: r.createdAt,
  };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDrizzleApprovalPolicyStore(db: DrizzleClient): ApprovalPolicyStore {
  return {
    async create(policy) {
      const rows = await db
        .insert(approvalPolicies)
        .values({
          name: policy.name,
          type: policy.type,
          threshold: policy.threshold,
          approverRoles: policy.approverRoles,
          maxRetries: policy.maxRetries,
          timeoutSeconds: policy.timeoutSeconds,
          escalationPolicy: policy.escalationPolicy,
        })
        .returning();
      return mapRow(rows[0]!);
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(approvalPolicies)
        .where(eq(approvalPolicies.id, id))
        .limit(1);
      if (rows.length === 0) return null;
      return mapRow(rows[0]!);
    },

    async findByName(name) {
      try {
        const rows = await db
          .select()
          .from(approvalPolicies)
          .where(eq(approvalPolicies.name, name))
          .limit(1);
        if (rows.length === 0) return null;
        return mapRow(rows[0]!);
      } catch (err) {
        // fail-open: return null on db errors for reads
        console.warn('approval-policy-store: findByName failed, returning null', err);
        return null;
      }
    },

    async list() {
      const rows = await db
        .select()
        .from(approvalPolicies)
        .orderBy(desc(approvalPolicies.createdAt));
      return rows.map(mapRow);
    },
  };
}
