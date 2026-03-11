/**
 * HITL-06: Approve/Reject — Types
 * @task HITL-06
 * @frd FR-CORE-HITL-003
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// input validation
// ---------------------------------------------------------------------------

export const RecordDecisionInputSchema = z.object({
  requestId: z.string().uuid(),
  token: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
  channel: z.string().min(1).max(50),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().optional(),
});

export type RecordDecisionInput = z.infer<typeof RecordDecisionInputSchema>;

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface RecordDecisionResult {
  decisionId: string;
  requestId: string;
  decision: 'approved' | 'rejected';
  decidedAt: Date;
}

// ---------------------------------------------------------------------------
// stored decision shape
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// request snapshot (what the decision service reads from the store)
// ---------------------------------------------------------------------------

export interface RequestSnapshot {
  id: string;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled';
  tokenHash: string;
  tokenExpiresAt: Date;
}

// ---------------------------------------------------------------------------
// existing decision snapshot (for idempotency check)
// ---------------------------------------------------------------------------

export interface ExistingDecision {
  id: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  decidedAt: Date;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type DecisionError =
  | { _tag: 'ValidationError'; message: string; errors: Array<{ field: string; message: string }> }
  | { _tag: 'RequestNotFoundError'; requestId: string }
  | { _tag: 'RequestExpiredError'; requestId: string }
  | { _tag: 'RequestAlreadyResolvedError'; requestId: string; existingStatus: string }
  | { _tag: 'TokenVerificationError'; reason: string; message: string }
  | { _tag: 'ConflictError'; requestId: string; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };
