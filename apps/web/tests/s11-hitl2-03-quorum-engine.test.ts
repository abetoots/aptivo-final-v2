/**
 * HITL2-03: Quorum Decision Engine tests
 * @task HITL2-03
 *
 * verifies quorum evaluation logic (pure), multi-decision service
 * (with mocked deps), error handling, and barrel exports.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createQuorumEngine,
  createMultiDecisionService,
  RecordMultiApproverDecisionInputSchema,
  type DecisionRecord,
  type ApprovalPolicyRecord,
  type ApprovalPolicyStore,
  type RequestTokenStore,
  type MultiDecisionServiceDeps,
  type MultiDecisionStoreDeps,
} from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// helpers: policy factories
// ---------------------------------------------------------------------------

const POLICY_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const APPROVER_1 = '11111111-1111-4111-a111-111111111111';
const APPROVER_2 = '22222222-2222-4222-a222-222222222222';
const APPROVER_3 = '33333333-3333-4333-a333-333333333333';
const APPROVER_4 = '44444444-4444-4444-a444-444444444444';
const APPROVER_5 = '55555555-5555-4555-a555-555555555555';

function quorumPolicy(threshold: number, rolesCount: number): ApprovalPolicyRecord {
  const roles = Array.from({ length: rolesCount }, (_, i) => `role-${i}`);
  return {
    id: POLICY_ID,
    name: 'test-quorum',
    type: 'quorum',
    threshold,
    approverRoles: roles,
    maxRetries: 3,
    timeoutSeconds: 86400,
    escalationPolicy: null,
    createdAt: new Date(),
  };
}

function singlePolicy(): ApprovalPolicyRecord {
  return {
    id: POLICY_ID,
    name: 'single-approval',
    type: 'single',
    threshold: null,
    approverRoles: ['manager'],
    maxRetries: 3,
    timeoutSeconds: 86400,
    escalationPolicy: null,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// helpers: mock deps for multi-decision service
// ---------------------------------------------------------------------------

function createMockStore(): MultiDecisionStoreDeps {
  return {
    getRequest: vi.fn(),
    getDecisionsByRequestId: vi.fn().mockResolvedValue([]),
    getDecisionByRequestAndApprover: vi.fn().mockResolvedValue(null),
    insertDecision: vi.fn().mockResolvedValue({ id: 'dec-1' }),
    updateRequestStatusIfPending: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

function createMockTokenStore(): RequestTokenStore {
  return {
    insertTokens: vi.fn(),
    findByRequestAndApprover: vi.fn().mockResolvedValue({
      requestId: REQUEST_ID,
      approverId: APPROVER_1,
      tokenHash: 'hash-1',
      tokenExpiresAt: new Date('2026-12-31T00:00:00Z'),
    }),
    findByRequestId: vi.fn(),
  };
}

function createMockPolicyStore(): ApprovalPolicyStore {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(quorumPolicy(2, 3)),
    findByName: vi.fn(),
    list: vi.fn(),
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    approverId: APPROVER_1,
    token: 'valid-token',
    decision: 'approved' as const,
    channel: 'web',
    ...overrides,
  };
}

function pendingRequest(policyId: string | null = POLICY_ID) {
  return {
    id: REQUEST_ID,
    status: 'pending',
    policyId,
    approverId: APPROVER_1,
  };
}

// ---------------------------------------------------------------------------
// quorum engine (pure logic)
// ---------------------------------------------------------------------------

describe('createQuorumEngine', () => {
  const engine = createQuorumEngine();

  // -------------------------------------------------------------------------
  // 2-of-3 quorum
  // -------------------------------------------------------------------------

  describe('2-of-3 quorum', () => {
    const policy = quorumPolicy(2, 3);

    it('1 approval → pending', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'approved' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('pending');
      expect(result.value.approvalsCount).toBe(1);
      expect(result.value.rejectionsCount).toBe(0);
      expect(result.value.threshold).toBe(2);
      expect(result.value.totalApprovers).toBe(3);
      expect(result.value.isFinalized).toBe(false);
    });

    it('2 approvals → approved (finalized)', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'approved' },
        { approverId: APPROVER_2, decision: 'approved' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('approved');
      expect(result.value.approvalsCount).toBe(2);
      expect(result.value.rejectionsCount).toBe(0);
      expect(result.value.isFinalized).toBe(true);
    });

    it('2 rejections → rejected (impossible to reach threshold)', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'rejected' },
        { approverId: APPROVER_2, decision: 'rejected' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('rejected');
      expect(result.value.approvalsCount).toBe(0);
      expect(result.value.rejectionsCount).toBe(2);
      expect(result.value.isFinalized).toBe(true);
    });

    it('1 approval + 1 rejection → pending (still possible)', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'approved' },
        { approverId: APPROVER_2, decision: 'rejected' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('pending');
      expect(result.value.approvalsCount).toBe(1);
      expect(result.value.rejectionsCount).toBe(1);
      expect(result.value.isFinalized).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 1-of-1 single approver
  // -------------------------------------------------------------------------

  describe('1-of-1 single', () => {
    const policy = singlePolicy();

    it('1 approval → approved', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'approved' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('approved');
      expect(result.value.approvalsCount).toBe(1);
      expect(result.value.threshold).toBe(1);
      expect(result.value.totalApprovers).toBe(1);
      expect(result.value.isFinalized).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3-of-5 quorum
  // -------------------------------------------------------------------------

  describe('3-of-5 quorum', () => {
    const policy = quorumPolicy(3, 5);

    it('3 approvals → approved', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'approved' },
        { approverId: APPROVER_2, decision: 'approved' },
        { approverId: APPROVER_3, decision: 'approved' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('approved');
      expect(result.value.approvalsCount).toBe(3);
      expect(result.value.isFinalized).toBe(true);
    });

    it('3 rejections → rejected', () => {
      const decisions: DecisionRecord[] = [
        { approverId: APPROVER_1, decision: 'rejected' },
        { approverId: APPROVER_2, decision: 'rejected' },
        { approverId: APPROVER_3, decision: 'rejected' },
      ];

      const result = engine.evaluate(decisions, policy);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('rejected');
      expect(result.value.rejectionsCount).toBe(3);
      expect(result.value.isFinalized).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // edge case: empty decisions
  // -------------------------------------------------------------------------

  it('no decisions → pending', () => {
    const policy = quorumPolicy(2, 3);
    const result = engine.evaluate([], policy);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.aggregate).toBe('pending');
    expect(result.value.approvalsCount).toBe(0);
    expect(result.value.rejectionsCount).toBe(0);
    expect(result.value.isFinalized).toBe(false);
  });

  // -------------------------------------------------------------------------
  // edge case: request_changes decisions do not count as approvals or rejections
  // -------------------------------------------------------------------------

  it('request_changes decisions are ignored in quorum tally', () => {
    const policy = quorumPolicy(2, 3);
    const decisions: DecisionRecord[] = [
      { approverId: APPROVER_1, decision: 'approved' },
      { approverId: APPROVER_2, decision: 'request_changes' },
    ];

    const result = engine.evaluate(decisions, policy);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.aggregate).toBe('pending');
    expect(result.value.approvalsCount).toBe(1);
    expect(result.value.rejectionsCount).toBe(0);
    expect(result.value.isFinalized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// multi-decision service (with mocked deps)
// ---------------------------------------------------------------------------

describe('createMultiDecisionService', () => {
  let mockStore: MultiDecisionStoreDeps;
  let mockTokenStore: RequestTokenStore;
  let mockPolicyStore: ApprovalPolicyStore;
  let mockEmitEvent: ReturnType<typeof vi.fn>;
  let deps: MultiDecisionServiceDeps;

  beforeEach(() => {
    mockStore = createMockStore();
    mockTokenStore = createMockTokenStore();
    mockPolicyStore = createMockPolicyStore();
    mockEmitEvent = vi.fn().mockResolvedValue(undefined);

    deps = {
      store: mockStore,
      tokenStore: mockTokenStore,
      policyStore: mockPolicyStore,
      verifyToken: vi.fn().mockResolvedValue(true),
      emitEvent: mockEmitEvent,
    };
  });

  // -------------------------------------------------------------------------
  // happy path: first decision (1 of 3), quorum not reached
  // -------------------------------------------------------------------------

  describe('first decision (1 of 3 with quorum-2)', () => {
    beforeEach(() => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      // only 1 decision so far (the one being inserted)
      vi.mocked(mockStore.getDecisionsByRequestId).mockResolvedValue([
        { approverId: APPROVER_1, decision: 'approved' },
      ]);
    });

    it('returns aggregate=pending, isFinalized=false', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('pending');
      expect(result.value.isFinalized).toBe(false);
      expect(result.value.decisionId).toBe('dec-1');
      expect(result.value.requestId).toBe(REQUEST_ID);
      expect(result.value.approverId).toBe(APPROVER_1);
      expect(result.value.decision).toBe('approved');
    });

    it('does not emit event when quorum not reached', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(validInput());

      expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it('does not update request status when quorum not reached', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(validInput());

      expect(vi.mocked(mockStore.updateRequestStatusIfPending)).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // happy path: second decision (2 of 3 with quorum-2) → finalized
  // -------------------------------------------------------------------------

  describe('second decision (2 of 3 with quorum-2) → finalized', () => {
    beforeEach(() => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      // 2 approvals after insert
      vi.mocked(mockStore.getDecisionsByRequestId).mockResolvedValue([
        { approverId: APPROVER_1, decision: 'approved' },
        { approverId: APPROVER_2, decision: 'approved' },
      ]);
      // token for approver 2
      vi.mocked(mockTokenStore.findByRequestAndApprover).mockResolvedValue({
        requestId: REQUEST_ID,
        approverId: APPROVER_2,
        tokenHash: 'hash-2',
        tokenExpiresAt: new Date('2026-12-31T00:00:00Z'),
      });
    });

    it('returns aggregate=approved, isFinalized=true', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(
        validInput({ approverId: APPROVER_2 }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('approved');
      expect(result.value.isFinalized).toBe(true);
    });

    it('updates request status via optimistic lock', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(
        validInput({ approverId: APPROVER_2 }),
      );

      expect(vi.mocked(mockStore.updateRequestStatusIfPending)).toHaveBeenCalledWith(
        REQUEST_ID,
        'approved',
      );
    });

    it('emits event on finalization', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(
        validInput({ approverId: APPROVER_2 }),
      );

      expect(mockEmitEvent).toHaveBeenCalledOnce();
      expect(mockEmitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/decision.recorded',
          data: expect.objectContaining({
            requestId: REQUEST_ID,
            decision: 'approved',
            approverId: APPROVER_2,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // optimistic lock: affected=0 → another approver finalized first
  // -------------------------------------------------------------------------

  describe('optimistic lock race condition', () => {
    beforeEach(() => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      vi.mocked(mockStore.getDecisionsByRequestId).mockResolvedValue([
        { approverId: APPROVER_1, decision: 'approved' },
        { approverId: APPROVER_2, decision: 'approved' },
      ]);
      // optimistic lock failed — another approver finalized first
      vi.mocked(mockStore.updateRequestStatusIfPending).mockResolvedValue({ affected: 0 });
    });

    it('returns isFinalized=false when optimistic lock fails', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // decision was recorded but this approver did not finalize
      expect(result.value.isFinalized).toBe(false);
      // aggregate stays pending from this approver's perspective
      expect(result.value.aggregate).toBe('pending');
    });

    it('does not emit event when optimistic lock fails', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(validInput());

      expect(mockEmitEvent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // error: duplicate decision by same approver
  // -------------------------------------------------------------------------

  describe('duplicate decision', () => {
    it('returns DuplicateDecisionError', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      vi.mocked(mockStore.getDecisionByRequestAndApprover).mockResolvedValue({
        id: 'existing-dec',
        decision: 'approved',
      });

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('DuplicateDecisionError');
      if (result.error._tag === 'DuplicateDecisionError') {
        expect(result.error.approverId).toBe(APPROVER_1);
        expect(result.error.requestId).toBe(REQUEST_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // error: request already finalized
  // -------------------------------------------------------------------------

  describe('request already finalized', () => {
    it('returns RequestAlreadyFinalizedError', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue({
        ...pendingRequest(),
        status: 'approved',
      });

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('RequestAlreadyFinalizedError');
      if (result.error._tag === 'RequestAlreadyFinalizedError') {
        expect(result.error.requestId).toBe(REQUEST_ID);
        expect(result.error.status).toBe('approved');
      }
    });
  });

  // -------------------------------------------------------------------------
  // error: invalid token
  // -------------------------------------------------------------------------

  describe('invalid token', () => {
    it('returns TokenVerificationError for bad token', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      vi.mocked(deps.verifyToken).mockResolvedValue(false);

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('TokenVerificationError');
      if (result.error._tag === 'TokenVerificationError') {
        expect(result.error.message).toBe('Invalid token');
      }
    });

    it('returns TokenVerificationError when no token record found', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      vi.mocked(mockTokenStore.findByRequestAndApprover).mockResolvedValue(null);

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('TokenVerificationError');
      if (result.error._tag === 'TokenVerificationError') {
        expect(result.error.message).toContain(APPROVER_1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // error: request not found
  // -------------------------------------------------------------------------

  describe('request not found', () => {
    it('returns RequestNotFoundError', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(null);

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('RequestNotFoundError');
      if (result.error._tag === 'RequestNotFoundError') {
        expect(result.error.requestId).toBe(REQUEST_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // error: policy not found
  // -------------------------------------------------------------------------

  describe('policy not found', () => {
    it('returns PolicyNotFoundError', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest());
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(null);

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PolicyNotFoundError');
      if (result.error._tag === 'PolicyNotFoundError') {
        expect(result.error.policyId).toBe(POLICY_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // no policyId (legacy) → auto-finalize on first decision
  // -------------------------------------------------------------------------

  describe('no policyId (legacy single-approver)', () => {
    beforeEach(() => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest(null));
    });

    it('auto-finalizes on first decision', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.aggregate).toBe('approved');
      expect(result.value.isFinalized).toBe(true);
    });

    it('emits event on legacy finalization', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(validInput());

      expect(mockEmitEvent).toHaveBeenCalledOnce();
      expect(mockEmitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/decision.recorded',
          data: expect.objectContaining({
            requestId: REQUEST_ID,
            decision: 'approved',
          }),
        }),
      );
    });

    it('updates request status to decision value', async () => {
      const svc = createMultiDecisionService(deps);
      await svc.recordMultiApproverDecision(
        validInput({ decision: 'rejected' }),
      );

      expect(vi.mocked(mockStore.updateRequestStatusIfPending)).toHaveBeenCalledWith(
        REQUEST_ID,
        'rejected',
      );
    });
  });

  // -------------------------------------------------------------------------
  // event emission: only on finalization
  // -------------------------------------------------------------------------

  describe('event emission', () => {
    it('does not emit when no emitEvent provided', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest(null));
      const depsNoEmit = { ...deps, emitEvent: undefined };

      const svc = createMultiDecisionService(depsNoEmit);
      const result = await svc.recordMultiApproverDecision(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // should not throw even though no emitEvent
      expect(result.value.isFinalized).toBe(true);
    });

    it('swallows emitEvent errors (fire-and-forget)', async () => {
      vi.mocked(mockStore.getRequest).mockResolvedValue(pendingRequest(null));
      mockEmitEvent.mockRejectedValue(new Error('event bus down'));

      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(validInput());

      // should succeed despite event emission failure
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // validation: input schema
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects missing required fields', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision({});

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('rejects invalid UUID for requestId', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(
        validInput({ requestId: 'not-a-uuid' }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('rejects invalid decision value', async () => {
      const svc = createMultiDecisionService(deps);
      const result = await svc.recordMultiApproverDecision(
        validInput({ decision: 'maybe' }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });
  });
});

// ---------------------------------------------------------------------------
// input schema standalone validation
// ---------------------------------------------------------------------------

describe('RecordMultiApproverDecisionInputSchema', () => {
  it('validates a complete valid input', () => {
    const result = RecordMultiApproverDecisionInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestId).toBe(REQUEST_ID);
      expect(result.data.approverId).toBe(APPROVER_1);
      expect(result.data.decision).toBe('approved');
      expect(result.data.channel).toBe('web');
    }
  });

  it('accepts optional comment, ipAddress, userAgent', () => {
    const result = RecordMultiApproverDecisionInputSchema.safeParse({
      ...validInput(),
      comment: 'Looks good',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comment).toBe('Looks good');
      expect(result.data.ipAddress).toBe('192.168.1.1');
      expect(result.data.userAgent).toBe('Mozilla/5.0');
    }
  });

  it('accepts both approved and rejected decisions', () => {
    expect(
      RecordMultiApproverDecisionInputSchema.safeParse(validInput({ decision: 'approved' })).success,
    ).toBe(true);
    expect(
      RecordMultiApproverDecisionInputSchema.safeParse(validInput({ decision: 'rejected' })).success,
    ).toBe(true);
  });

  it('rejects empty channel', () => {
    const result = RecordMultiApproverDecisionInputSchema.safeParse(
      validInput({ channel: '' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects channel exceeding 50 chars', () => {
    const result = RecordMultiApproverDecisionInputSchema.safeParse(
      validInput({ channel: 'a'.repeat(51) }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// barrel exports
// ---------------------------------------------------------------------------

describe('barrel exports', () => {
  it('createQuorumEngine is exported from @aptivo/hitl-gateway', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.createQuorumEngine).toBe('function');
  });

  it('createMultiDecisionService is exported from @aptivo/hitl-gateway', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.createMultiDecisionService).toBe('function');
  });

  it('RecordMultiApproverDecisionInputSchema is exported from @aptivo/hitl-gateway', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(mod.RecordMultiApproverDecisionInputSchema).toBeDefined();
  });

  it('existing recordDecision is still exported (backward compat)', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.recordDecision).toBe('function');
  });
});
