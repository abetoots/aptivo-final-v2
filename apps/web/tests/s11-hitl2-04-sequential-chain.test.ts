/**
 * HITL2-04: Sequential Chain Execution + Timeout Escalation Tests
 * @task HITL2-04
 *
 * verifies the sequential chain runner evaluates ordered approval chains,
 * handles rejection short-circuiting, request_changes pausing, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  createSequentialChainRunner,
  type ChainDecisionRecord,
} from '@aptivo/hitl-gateway';
import type { ApprovalPolicyRecord } from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makePolicy(
  overrides: Partial<ApprovalPolicyRecord> = {},
): ApprovalPolicyRecord {
  return {
    id: 'policy-1',
    name: 'test-sequential',
    type: 'sequential',
    threshold: null,
    approverRoles: ['legal', 'finance', 'ceo'],
    maxRetries: 3,
    timeoutSeconds: 86400,
    escalationPolicy: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSingleStepPolicy(): ApprovalPolicyRecord {
  return makePolicy({
    id: 'policy-single',
    name: 'single-step',
    approverRoles: ['manager'],
  });
}

// ---------------------------------------------------------------------------
// evaluateChain
// ---------------------------------------------------------------------------

describe('createSequentialChainRunner', () => {
  const runner = createSequentialChainRunner();

  describe('evaluateChain', () => {
    it('fresh 3-step chain with no decisions → currentStep=0, pending', () => {
      const policy = makePolicy();
      const result = runner.evaluateChain([], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(0);
      expect(result.value.currentRole).toBe('legal');
      expect(result.value.isComplete).toBe(false);
      expect(result.value.aggregate).toBe('pending');
      expect(result.value.completedSteps).toBe(0);
      expect(result.value.totalSteps).toBe(3);
    });

    it('after first approver approves → currentStep=1, currentRole=second role', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(1);
      expect(result.value.currentRole).toBe('finance');
      expect(result.value.isComplete).toBe(false);
      expect(result.value.aggregate).toBe('pending');
      expect(result.value.completedSteps).toBe(1);
      expect(result.value.totalSteps).toBe(3);
    });

    it('after all 3 approve → isComplete=true, aggregate=approved', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'approved', role: 'finance' },
        { approverId: 'user-3', decision: 'approved', role: 'ceo' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(3);
      expect(result.value.currentRole).toBeNull();
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('approved');
      expect(result.value.completedSteps).toBe(3);
      expect(result.value.totalSteps).toBe(3);
    });

    it('rejection at step 0 short-circuits → isComplete=true, aggregate=rejected', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'rejected', role: 'legal' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(0);
      expect(result.value.currentRole).toBeNull();
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('rejected');
      expect(result.value.completedSteps).toBe(1);
      expect(result.value.totalSteps).toBe(3);
    });

    it('rejection at step 1 short-circuits after first approval', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'rejected', role: 'finance' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(1);
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('rejected');
      expect(result.value.completedSteps).toBe(2);
    });

    it('request_changes pauses at current step → pending', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'request_changes', role: 'finance' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(1);
      expect(result.value.currentRole).toBe('finance');
      expect(result.value.isComplete).toBe(false);
      expect(result.value.aggregate).toBe('pending');
      expect(result.value.completedSteps).toBe(1);
    });

    it('single-step chain: 1 approval → approved', () => {
      const policy = makeSingleStepPolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'mgr-1', decision: 'approved', role: 'manager' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(1);
      expect(result.value.currentRole).toBeNull();
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('approved');
      expect(result.value.completedSteps).toBe(1);
      expect(result.value.totalSteps).toBe(1);
    });

    it('matches decisions by approverId when role is missing', () => {
      const policy = makePolicy();
      // approver uses approverId matching the role name (fallback matching)
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'legal', decision: 'approved' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(1);
      expect(result.value.currentRole).toBe('finance');
      expect(result.value.completedSteps).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getNextApprover
  // -------------------------------------------------------------------------

  describe('getNextApprover', () => {
    it('fresh chain → returns first role', () => {
      const policy = makePolicy();
      const result = runner.getNextApprover([], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('legal');
    });

    it('after 1 approval → returns second role', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
      ];

      const result = runner.getNextApprover(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('finance');
    });

    it('after 2 approvals → returns third role', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'approved', role: 'finance' },
      ];

      const result = runner.getNextApprover(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('ceo');
    });

    it('all approved → returns null', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'approved', role: 'finance' },
        { approverId: 'user-3', decision: 'approved', role: 'ceo' },
      ];

      const result = runner.getNextApprover(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });

    it('after rejection → returns null', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'rejected', role: 'legal' },
      ];

      const result = runner.getNextApprover(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // isApproverActive
  // -------------------------------------------------------------------------

  describe('isApproverActive', () => {
    it('first approver on fresh chain → true', () => {
      const policy = makePolicy();
      const result = runner.isApproverActive('legal', [], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    it('second approver on fresh chain → false', () => {
      const policy = makePolicy();
      const result = runner.isApproverActive('finance', [], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });

    it('second approver after first approves → true', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
      ];

      const result = runner.isApproverActive('finance', decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(true);
    });

    it('first approver after first approves → false', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
      ];

      const result = runner.isApproverActive('legal', decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });

    it('no approver active after chain completes → false', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'approved', role: 'finance' },
        { approverId: 'user-3', decision: 'approved', role: 'ceo' },
      ];

      const result = runner.isApproverActive('ceo', decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('empty decisions array → currentStep=0', () => {
      const policy = makePolicy();
      const result = runner.evaluateChain([], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(0);
      expect(result.value.completedSteps).toBe(0);
      expect(result.value.aggregate).toBe('pending');
    });

    it('empty approverRoles → trivially approved', () => {
      const policy = makePolicy({ approverRoles: [] });
      const result = runner.evaluateChain([], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(0);
      expect(result.value.currentRole).toBeNull();
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('approved');
      expect(result.value.completedSteps).toBe(0);
      expect(result.value.totalSteps).toBe(0);
    });

    it('request_changes at first step with no prior approvals', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'request_changes', role: 'legal' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(0);
      expect(result.value.currentRole).toBe('legal');
      expect(result.value.isComplete).toBe(false);
      expect(result.value.aggregate).toBe('pending');
      expect(result.value.completedSteps).toBe(0);
    });

    it('rejection at last step short-circuits even with prior approvals', () => {
      const policy = makePolicy();
      const decisions: ChainDecisionRecord[] = [
        { approverId: 'user-1', decision: 'approved', role: 'legal' },
        { approverId: 'user-2', decision: 'approved', role: 'finance' },
        { approverId: 'user-3', decision: 'rejected', role: 'ceo' },
      ];

      const result = runner.evaluateChain(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currentStep).toBe(2);
      expect(result.value.isComplete).toBe(true);
      expect(result.value.aggregate).toBe('rejected');
      expect(result.value.completedSteps).toBe(3);
    });

    it('getNextApprover with empty approverRoles → null', () => {
      const policy = makePolicy({ approverRoles: [] });
      const result = runner.getNextApprover([], policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBeNull();
    });
  });
});
