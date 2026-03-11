/**
 * HITL-05: Create Request — Types & Validation
 * @task HITL-05
 * @frd FR-CORE-HITL-001
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// input validation schema
// ---------------------------------------------------------------------------

export const CreateRequestInputSchema = z.object({
  workflowId: z.string().uuid(),
  workflowStepId: z.string().max(100).optional(),
  domain: z.string().min(1).max(50),
  actionType: z.string().min(1).max(100),
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  approverId: z.string().uuid(),
  /** TTL in seconds for the approval token (default 900 = 15min, max 3600 = 1hr) */
  ttlSeconds: z.number().int().min(1).max(3600).optional(),
});

export type CreateRequestInput = z.infer<typeof CreateRequestInputSchema>;

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface CreateRequestResult {
  /** the created request ID */
  requestId: string;
  /** SHA-256 hash of the token (stored in DB) */
  tokenHash: string;
  /** the raw JWT token (sent to approver, never stored) */
  token: string;
  /** when the token expires */
  tokenExpiresAt: Date;
  /** URL for the approve action */
  approveUrl: string;
  /** URL for the reject action */
  rejectUrl: string;
}

// ---------------------------------------------------------------------------
// stored request shape (what the store persists)
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

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type RequestError =
  | { _tag: 'ValidationError'; message: string; errors: Array<{ field: string; message: string }> }
  | { _tag: 'TokenGenerationError'; message: string }
  | { _tag: 'DuplicateTokenError'; message: string }
  | { _tag: 'PersistenceError'; message: string; cause: unknown };
