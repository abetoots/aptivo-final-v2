/**
 * HITL2-03: Quorum Decision Engine
 * @task HITL2-03
 *
 * evaluates individual decisions against an approval policy threshold
 * to determine whether a quorum has been reached, rejected, or is still pending.
 */

import { Result } from '@aptivo/types';
import type { ApprovalPolicyRecord } from './policy-types.js';

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface QuorumResult {
  aggregate: 'pending' | 'approved' | 'rejected';
  approvalsCount: number;
  rejectionsCount: number;
  threshold: number;
  totalApprovers: number;
  isFinalized: boolean;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type QuorumError =
  | { readonly _tag: 'QuorumEvaluationError'; readonly message: string; readonly cause: unknown };

// ---------------------------------------------------------------------------
// individual decision record shape (from store)
// ---------------------------------------------------------------------------

export interface DecisionRecord {
  approverId: string;
  decision: 'approved' | 'rejected' | 'request_changes';
}

// ---------------------------------------------------------------------------
// quorum engine factory
// ---------------------------------------------------------------------------

export function createQuorumEngine() {
  return {
    // evaluate current decisions against policy threshold
    // actualApproverCount overrides policy.approverRoles.length when request has different count
    evaluate(
      decisions: DecisionRecord[],
      policy: ApprovalPolicyRecord,
      actualApproverCount?: number,
    ): Result<QuorumResult, QuorumError> {
      try {
        const threshold = policy.threshold ?? 1; // single = 1-of-1
        const totalApprovers = actualApproverCount ?? policy.approverRoles.length;

        const approvals = decisions.filter(d => d.decision === 'approved').length;
        const rejections = decisions.filter(d => d.decision === 'rejected').length;

        // quorum met?
        if (approvals >= threshold) {
          return Result.ok({
            aggregate: 'approved',
            approvalsCount: approvals,
            rejectionsCount: rejections,
            threshold,
            totalApprovers,
            isFinalized: true,
          });
        }

        // rejection makes quorum impossible?
        // if rejections > (totalApprovers - threshold), can never reach threshold
        if (rejections > totalApprovers - threshold) {
          return Result.ok({
            aggregate: 'rejected',
            approvalsCount: approvals,
            rejectionsCount: rejections,
            threshold,
            totalApprovers,
            isFinalized: true,
          });
        }

        // still pending
        return Result.ok({
          aggregate: 'pending',
          approvalsCount: approvals,
          rejectionsCount: rejections,
          threshold,
          totalApprovers,
          isFinalized: false,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'QuorumEvaluationError',
          message: 'Failed to evaluate quorum',
          cause,
        });
      }
    },
  };
}
