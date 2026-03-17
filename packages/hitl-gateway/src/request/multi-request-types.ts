/**
 * HITL2-02: Multi-Approver Request Creation — Types
 * @task HITL2-02
 *
 * defines input schema, result types, error union, and store interface
 * for multi-approver hitl request creation with per-approver tokens.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// input validation schema
// ---------------------------------------------------------------------------

export const CreateMultiApproverRequestInputSchema = z.object({
  workflowId: z.string().uuid(),
  workflowStepId: z.string().max(100).optional(),
  domain: z.string().min(1).max(50),
  actionType: z.string().min(1).max(100),
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  // multi-approver: list of approver IDs
  approverIds: z.array(z.string().uuid()).min(1),
  // policy that governs approval evaluation
  policyId: z.string().uuid(),
  ttlSeconds: z.number().int().min(1).max(3600).default(900),
});

export type CreateMultiApproverRequestInput = z.infer<typeof CreateMultiApproverRequestInputSchema>;

// ---------------------------------------------------------------------------
// per-approver result
// ---------------------------------------------------------------------------

export interface ApproverTokenResult {
  approverId: string;
  token: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  approveUrl: string;
  rejectUrl: string;
}

// ---------------------------------------------------------------------------
// overall result
// ---------------------------------------------------------------------------

export interface MultiApproverRequestResult {
  requestId: string;
  policyId: string;
  approvers: ApproverTokenResult[];
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type MultiRequestError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'PolicyNotFoundError'; readonly policyId: string }
  | { readonly _tag: 'PolicyValidationError'; readonly message: string }
  | { readonly _tag: 'TokenGenerationError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'PersistenceError'; readonly message: string; readonly cause: unknown };

// ---------------------------------------------------------------------------
// token record for the join table
// ---------------------------------------------------------------------------

export interface HitlRequestTokenRecord {
  id?: string;
  requestId: string;
  approverId: string;
  tokenHash: string;
  tokenExpiresAt: Date;
}

// ---------------------------------------------------------------------------
// store interface for the join table
// ---------------------------------------------------------------------------

export interface RequestTokenStore {
  insertTokens(tokens: HitlRequestTokenRecord[]): Promise<void>;
  findByRequestAndApprover(requestId: string, approverId: string): Promise<HitlRequestTokenRecord | null>;
  findByRequestId(requestId: string): Promise<HitlRequestTokenRecord[]>;
}
