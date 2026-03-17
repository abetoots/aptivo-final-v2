/**
 * HITL2-03: Multi-Approver Decision Types
 * @task HITL2-03
 *
 * defines input schema, result types, and error union for
 * recording individual decisions in a multi-approver quorum flow.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// input validation schema
// ---------------------------------------------------------------------------

export const RecordMultiApproverDecisionInputSchema = z.object({
  requestId: z.string().uuid(),
  approverId: z.string().uuid(),
  token: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
  channel: z.string().min(1).max(50),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().optional(),
});

export type RecordMultiApproverDecisionInput = z.infer<typeof RecordMultiApproverDecisionInputSchema>;

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface MultiDecisionResult {
  decisionId: string;
  requestId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  aggregate: 'pending' | 'approved' | 'rejected';
  isFinalized: boolean;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type MultiDecisionError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'RequestNotFoundError'; readonly requestId: string }
  | { readonly _tag: 'TokenVerificationError'; readonly message: string }
  | { readonly _tag: 'DuplicateDecisionError'; readonly approverId: string; readonly requestId: string }
  | { readonly _tag: 'RequestAlreadyFinalizedError'; readonly requestId: string; readonly status: string }
  | { readonly _tag: 'PolicyNotFoundError'; readonly policyId: string }
  | { readonly _tag: 'PersistenceError'; readonly message: string; readonly cause: unknown };
