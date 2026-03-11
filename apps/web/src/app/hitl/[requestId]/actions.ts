/**
 * HITL-09: Approval UI — Server Actions
 * @task HITL-09
 * @frd FR-CORE-HITL-004
 *
 * Server Actions for approve/reject decisions.
 * Called by the approval UI page's form submissions.
 */

'use server';

// ---------------------------------------------------------------------------
// types for the approval page
// ---------------------------------------------------------------------------

export interface HitlPageRequest {
  id: string;
  workflowId: string;
  domain: string;
  actionType: string;
  summary: string;
  details?: Record<string, unknown>;
  approverId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled';
  tokenExpiresAt: Date;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ApprovalActionResult {
  success: boolean;
  message: string;
  decision?: 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// request loader (injectable — will use real DB in production)
// ---------------------------------------------------------------------------

export type RequestLoader = (requestId: string) => Promise<HitlPageRequest | null>;

// default loader — placeholder that returns null
// in production, this is replaced by a Drizzle query bound at the route level
let _requestLoader: RequestLoader = async () => null;

export function setRequestLoader(loader: RequestLoader): void {
  _requestLoader = loader;
}

export async function loadRequest(requestId: string): Promise<HitlPageRequest | null> {
  return _requestLoader(requestId);
}

// ---------------------------------------------------------------------------
// decision submitter (injectable)
// ---------------------------------------------------------------------------

export type DecisionSubmitter = (params: {
  requestId: string;
  token: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  channel: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

let _decisionSubmitter: DecisionSubmitter = async () => ({
  ok: false,
  error: 'Decision service not configured',
});

export function setDecisionSubmitter(submitter: DecisionSubmitter): void {
  _decisionSubmitter = submitter;
}

// ---------------------------------------------------------------------------
// server actions
// ---------------------------------------------------------------------------

export async function submitApproval(
  requestId: string,
  token: string,
  comment: string,
): Promise<ApprovalActionResult> {
  try {
    const result = await _decisionSubmitter({
      requestId,
      token,
      decision: 'approved',
      comment: comment || undefined,
      channel: 'web',
    });

    if (!result.ok) {
      return { success: false, message: result.error };
    }

    return { success: true, message: 'Request approved successfully.', decision: 'approved' };
  } catch {
    return { success: false, message: 'An unexpected error occurred.' };
  }
}

export async function submitRejection(
  requestId: string,
  token: string,
  comment: string,
): Promise<ApprovalActionResult> {
  try {
    const result = await _decisionSubmitter({
      requestId,
      token,
      decision: 'rejected',
      comment: comment || undefined,
      channel: 'web',
    });

    if (!result.ok) {
      return { success: false, message: result.error };
    }

    return { success: true, message: 'Request rejected.', decision: 'rejected' };
  } catch {
    return { success: false, message: 'An unexpected error occurred.' };
  }
}
