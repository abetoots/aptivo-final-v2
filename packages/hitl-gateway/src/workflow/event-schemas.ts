/**
 * HITL-07: Inngest Event Schemas
 * @task HITL-07
 * @frd FR-CORE-HITL-002
 *
 * Event contracts for the HITL approval workflow.
 * These are plain TypeScript types (not Zod) since Inngest's EventSchemas
 * requires zod/v3 — the web app registers these with its own client.
 */

// ---------------------------------------------------------------------------
// trigger event — workflow requests HITL approval
// ---------------------------------------------------------------------------

export interface HitlApprovalRequestData {
  /** UUID of the workflow requesting approval */
  workflowId: string;
  /** optional step identifier within the workflow */
  workflowStepId?: string;
  /** business domain (e.g. 'crypto', 'recruiting') */
  domain: string;
  /** type of action requiring approval */
  actionType: string;
  /** human-readable summary for the approver */
  summary: string;
  /** optional structured details */
  details?: Record<string, unknown>;
  /** UUID of the designated approver */
  approverId: string;
  /** token TTL in seconds (default 900, max 3600) */
  ttlSeconds?: number;
  /** w3c traceparent for cross-boundary trace propagation (INT-08, S7-W24) */
  traceparent?: string;
}

// ---------------------------------------------------------------------------
// response event — decision recorded, workflow resumes
// ---------------------------------------------------------------------------

export interface HitlDecisionRecordedData {
  /** UUID of the HITL request */
  requestId: string;
  /** the decision made */
  decision: 'approved' | 'rejected';
  /** UUID of the approver who decided */
  approverId: string;
  /** ISO timestamp of the decision */
  decidedAt: string;
  /** w3c traceparent for cross-boundary trace propagation (INT-08, S7-W24) */
  traceparent?: string;
}

// ---------------------------------------------------------------------------
// event names (constants for correlation)
// ---------------------------------------------------------------------------

export const HITL_EVENTS = {
  /** trigger: workflow needs approval */
  APPROVAL_REQUESTED: 'hitl/approval.requested',
  /** response: decision recorded */
  DECISION_RECORDED: 'hitl/decision.recorded',
} as const;

// ---------------------------------------------------------------------------
// workflow result types
// ---------------------------------------------------------------------------

export type HitlApprovalResult =
  | { status: 'approved'; requestId: string; approverId: string; decidedAt: string }
  | { status: 'rejected'; requestId: string; approverId: string; decidedAt: string }
  | { status: 'expired'; requestId: string }
  | { status: 'error'; requestId: string; error: string };
