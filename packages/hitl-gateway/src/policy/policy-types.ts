/**
 * HITL2-01: Approval Policy Model
 * @task HITL2-01
 *
 * defines the approval policy type system for multi-approver hitl flows.
 * supports single, quorum, and sequential approval strategies.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// policy types
// ---------------------------------------------------------------------------

export const ApprovalPolicyType = z.enum(['single', 'quorum', 'sequential']);
export type ApprovalPolicyType = z.infer<typeof ApprovalPolicyType>;

// ---------------------------------------------------------------------------
// escalation policy (for sequential chains)
// ---------------------------------------------------------------------------

export const EscalationPolicySchema = z.object({
  timeoutAction: z.enum(['skip', 'escalate', 'reject']).default('escalate'),
  escalateToRole: z.string().optional(),
}).optional();

export type EscalationPolicy = z.infer<typeof EscalationPolicySchema>;

// ---------------------------------------------------------------------------
// full approval policy schema
// ---------------------------------------------------------------------------

export const ApprovalPolicySchema = z.object({
  name: z.string().min(1).max(100),
  type: ApprovalPolicyType,
  // quorum threshold — required for quorum type, must be >= 1
  threshold: z.number().int().min(1).optional(),
  // ordered list of approver roles
  approverRoles: z.array(z.string().min(1)).min(1),
  // max re-submissions for request_changes (default 3)
  maxRetries: z.number().int().min(0).max(10).default(3),
  // timeout per approver in seconds (default 24h)
  timeoutSeconds: z.number().int().min(60).max(604800).default(86400),
  // escalation config for sequential
  escalationPolicy: EscalationPolicySchema,
}).refine(
  (data) => {
    // quorum type requires threshold
    if (data.type === 'quorum' && !data.threshold) return false;
    // non-quorum types must not have threshold
    if (data.type !== 'quorum' && data.threshold) return false;
    // threshold must be <= approverRoles length
    if (data.threshold && data.threshold > data.approverRoles.length) return false;
    // escalate action requires escalateToRole
    if (data.escalationPolicy?.timeoutAction === 'escalate' && !data.escalationPolicy?.escalateToRole) return false;
    return true;
  },
  { message: 'Quorum requires threshold <= approverRoles count; escalate requires escalateToRole; threshold only for quorum' }
);

export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

// ---------------------------------------------------------------------------
// stored policy record (with id and timestamps)
// ---------------------------------------------------------------------------

export interface ApprovalPolicyRecord {
  id: string;
  name: string;
  type: ApprovalPolicyType;
  threshold: number | null;
  approverRoles: string[];
  maxRetries: number;
  timeoutSeconds: number;
  escalationPolicy: EscalationPolicy | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface ApprovalPolicyStore {
  create(policy: Omit<ApprovalPolicyRecord, 'id' | 'createdAt'>): Promise<ApprovalPolicyRecord>;
  findById(id: string): Promise<ApprovalPolicyRecord | null>;
  findByName(name: string): Promise<ApprovalPolicyRecord | null>;
  list(): Promise<ApprovalPolicyRecord[]>;
}
