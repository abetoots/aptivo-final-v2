/**
 * HITL2-04: Sequential Chain Execution + Timeout Escalation
 * @task HITL2-04
 *
 * evaluates sequential approval chains where each approver must approve
 * in order before the next approver is activated. any rejection short-circuits
 * the chain. request_changes pauses at the current step.
 */

import { Result } from '@aptivo/types';
import type { ApprovalPolicyRecord } from './policy-types.js';

// ---------------------------------------------------------------------------
// decision record shape (same as quorum engine)
// ---------------------------------------------------------------------------

export interface ChainDecisionRecord {
  approverId: string;
  decision: 'approved' | 'rejected' | 'request_changes';
  role?: string; // role this approver filled
}

// ---------------------------------------------------------------------------
// chain state
// ---------------------------------------------------------------------------

export interface ChainState {
  currentStep: number; // 0-indexed position in approverRoles
  currentRole: string | null; // current approver's role (null = chain complete)
  isComplete: boolean;
  aggregate: 'pending' | 'approved' | 'rejected';
  completedSteps: number;
  totalSteps: number;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type ChainError =
  | { readonly _tag: 'ChainEvaluationError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'ChainStepError'; readonly step: number; readonly message: string };

// ---------------------------------------------------------------------------
// sequential chain runner factory
// ---------------------------------------------------------------------------

export function createSequentialChainRunner() {
  return {
    // evaluate the current state of a sequential chain
    evaluateChain(
      decisions: ChainDecisionRecord[],
      policy: ApprovalPolicyRecord,
    ): Result<ChainState, ChainError> {
      try {
        const roles = policy.approverRoles;
        const totalSteps = roles.length;

        // edge case: empty approver roles — chain is trivially complete
        if (totalSteps === 0) {
          return Result.ok({
            currentStep: 0,
            currentRole: null,
            isComplete: true,
            aggregate: 'approved',
            completedSteps: 0,
            totalSteps: 0,
          });
        }

        // match decisions to roles in order
        let completedSteps = 0;
        for (let i = 0; i < totalSteps; i++) {
          const role = roles[i]!;
          // find a decision from an approver with this role (or matching approverId)
          const decision = decisions.find(
            d => d.role === role || d.approverId === role
          );

          if (!decision) {
            // no decision for this step yet — this is the current step
            return Result.ok({
              currentStep: i,
              currentRole: role,
              isComplete: false,
              aggregate: 'pending',
              completedSteps,
              totalSteps,
            });
          }

          // any rejection short-circuits the chain
          if (decision.decision === 'rejected') {
            return Result.ok({
              currentStep: i,
              currentRole: null,
              isComplete: true,
              aggregate: 'rejected',
              completedSteps: completedSteps + 1,
              totalSteps,
            });
          }

          // request_changes pauses the chain at current step (handled by HITL2-05)
          if (decision.decision === 'request_changes') {
            return Result.ok({
              currentStep: i,
              currentRole: role,
              isComplete: false,
              aggregate: 'pending', // waiting for re-submission
              completedSteps,
              totalSteps,
            });
          }

          // approved — move to next step
          completedSteps++;
        }

        // all steps approved
        return Result.ok({
          currentStep: totalSteps,
          currentRole: null,
          isComplete: true,
          aggregate: 'approved',
          completedSteps,
          totalSteps,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'ChainEvaluationError',
          message: 'Failed to evaluate sequential chain',
          cause,
        });
      }
    },

    // get the next approver role in the chain
    getNextApprover(
      decisions: ChainDecisionRecord[],
      policy: ApprovalPolicyRecord,
    ): Result<string | null, ChainError> {
      const stateResult = this.evaluateChain(decisions, policy);
      if (!stateResult.ok) return stateResult as Result<never, ChainError>;
      return Result.ok(stateResult.value.currentRole);
    },

    // check if a specific approver's turn has arrived
    isApproverActive(
      approverId: string,
      decisions: ChainDecisionRecord[],
      policy: ApprovalPolicyRecord,
    ): Result<boolean, ChainError> {
      const nextResult = this.getNextApprover(decisions, policy);
      if (!nextResult.ok) return nextResult as Result<never, ChainError>;
      return Result.ok(nextResult.value === approverId);
    },
  };
}
