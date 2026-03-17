/**
 * HITL2-05: "Request Changes" Decision Type tests
 * @task HITL2-05
 *
 * verifies:
 * - decision type schema validation (request_changes + comment requirement)
 * - decision service handling (status, event, no finalization)
 * - resubmit service (retry logic, token rotation, policy enforcement)
 * - integration flows (request_changes → resubmit → approve lifecycle)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RecordDecisionInputSchema,
  recordDecision,
  HITL_EVENTS,
  createResubmitService,
  type DecisionServiceDeps,
  type DecisionStore,
  type DecisionEventEmitter,
  type ResubmitServiceDeps,
  type ResubmitStoreDeps,
} from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const APPROVER_ID = '11111111-1111-4111-a111-111111111111';
const TOKEN = 'valid-jwt-token';
const POLICY_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// mock the token verification module used internally by decision-service.
// decision-service imports from '../tokens/jwt-manager.js' which vitest
// resolves to the .ts source file in the workspace package.
// we use the relative path from the test file to the actual source.
// ---------------------------------------------------------------------------

vi.mock('../../../packages/hitl-gateway/src/tokens/jwt-manager.js', () => ({
  verifyHitlToken: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      requestId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      action: 'decide',
      jti: 'test-jti',
    },
  }),
  generateHitlToken: vi.fn(),
  hashToken: vi.fn(),
  clearJtiStore: vi.fn(),
}));

// ---------------------------------------------------------------------------
// helpers: decision service mock deps
// ---------------------------------------------------------------------------

function createMockDecisionStore(): DecisionStore {
  return {
    getRequest: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      approverId: APPROVER_ID,
      status: 'pending',
      tokenHash: 'hash-123',
      tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
    }),
    getDecisionByRequestId: vi.fn().mockResolvedValue(null),
    insertDecisionAndUpdateRequest: vi.fn().mockResolvedValue({ id: 'dec-001' }),
  };
}

function createMockEventEmitter(): DecisionEventEmitter {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  };
}

function defaultDecisionDeps(overrides: Partial<DecisionServiceDeps> = {}): DecisionServiceDeps {
  return {
    store: createMockDecisionStore(),
    config: {
      signingSecrets: 'test-secret',
      audience: 'hitl',
      issuer: 'aptivo',
    },
    eventEmitter: createMockEventEmitter(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// helpers: resubmit service mock deps
// ---------------------------------------------------------------------------

function createMockResubmitStore(overrides: Partial<ResubmitStoreDeps> = {}): ResubmitStoreDeps {
  return {
    getRequest: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      status: 'changes_requested',
      retryCount: 0,
      policyId: null,
    }),
    updateRequestForResubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function defaultResubmitDeps(overrides: Partial<ResubmitServiceDeps> = {}): ResubmitServiceDeps {
  return {
    store: createMockResubmitStore(),
    policyStore: { findById: vi.fn().mockResolvedValue(null) },
    generateToken: vi.fn().mockResolvedValue({
      token: 'new-jwt-token',
      hash: 'new-hash-abc',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. decision type schema tests
// ---------------------------------------------------------------------------

describe('RecordDecisionInputSchema — request_changes', () => {
  const baseInput = {
    requestId: REQUEST_ID,
    token: TOKEN,
    channel: 'web',
  };

  it('accepts request_changes decision when comment is provided', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'request_changes',
      comment: 'Please fix the budget breakdown',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe('request_changes');
      expect(result.data.comment).toBe('Please fix the budget breakdown');
    }
  });

  it('rejects request_changes decision when comment is missing', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'request_changes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects request_changes decision when comment is empty string', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'request_changes',
      comment: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects request_changes decision when comment is whitespace only', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'request_changes',
      comment: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('approved still works without comment', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'approved',
    });
    expect(result.success).toBe(true);
  });

  it('rejected still works without comment', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'rejected',
    });
    expect(result.success).toBe(true);
  });

  it('approved works with optional comment', () => {
    const result = RecordDecisionInputSchema.safeParse({
      ...baseInput,
      decision: 'approved',
      comment: 'Looks great',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. decision service — request_changes handling
// ---------------------------------------------------------------------------

describe('recordDecision — request_changes', () => {
  it('sets status to changes_requested on request_changes decision', async () => {
    const deps = defaultDecisionDeps();
    const result = await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Need more details on section 3',
        channel: 'web',
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.decision).toBe('request_changes');
    // verify the store was called with 'changes_requested' status
    expect(vi.mocked(deps.store.insertDecisionAndUpdateRequest)).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'request_changes' }),
      'changes_requested',
    );
  });

  it('emits hitl/changes.requested event (not decision.recorded)', async () => {
    const deps = defaultDecisionDeps();
    const result = await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Missing compliance section',
        channel: 'web',
      },
      deps,
    );

    expect(result.ok).toBe(true);
    // wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: HITL_EVENTS.CHANGES_REQUESTED,
        data: expect.objectContaining({
          requestId: REQUEST_ID,
          decision: 'request_changes',
          comment: 'Missing compliance section',
        }),
      }),
    );
  });

  it('does not emit hitl/decision.recorded for request_changes', async () => {
    const deps = defaultDecisionDeps();
    await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Fix the numbers',
        channel: 'web',
      },
      deps,
    );
    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    const calls = vi.mocked(emitter.emit).mock.calls;
    for (const call of calls) {
      expect(call[0].name).not.toBe(HITL_EVENTS.DECISION_RECORDED);
    }
  });

  it('approved still emits hitl/decision.recorded', async () => {
    const deps = defaultDecisionDeps();
    await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'approved',
        channel: 'web',
      },
      deps,
    );
    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: HITL_EVENTS.DECISION_RECORDED,
      }),
    );
  });

  it('rejected still emits hitl/decision.recorded', async () => {
    const deps = defaultDecisionDeps();
    await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'rejected',
        channel: 'web',
      },
      deps,
    );
    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: HITL_EVENTS.DECISION_RECORDED,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. resubmit service tests
// ---------------------------------------------------------------------------

describe('createResubmitService', () => {
  // -------------------------------------------------------------------------
  // happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('increments retryCount, returns new token', async () => {
      const deps = defaultResubmitDeps();
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.requestId).toBe(REQUEST_ID);
      expect(result.value.retryCount).toBe(1);
      expect(result.value.newToken).toBe('new-jwt-token');
      expect(result.value.newTokenHash).toBe('new-hash-abc');
      expect(result.value.newTokenExpiresAt).toEqual(new Date('2027-01-01T00:00:00Z'));
    });

    it('calls store.updateRequestForResubmit with correct args', async () => {
      const store = createMockResubmitStore();
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      await svc.resubmitRequest(REQUEST_ID);

      expect(vi.mocked(store.updateRequestForResubmit)).toHaveBeenCalledWith(
        REQUEST_ID,
        1, // new retryCount
        'new-hash-abc',
        new Date('2027-01-01T00:00:00Z'),
      );
    });

    it('increments from existing retryCount', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'changes_requested',
          retryCount: 2,
          policyId: null,
        }),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.retryCount).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // error: request not in changes_requested status
  // -------------------------------------------------------------------------

  describe('non-changes_requested status', () => {
    it.each(['pending', 'approved', 'rejected', 'expired', 'canceled'] as const)(
      'returns ResubmitNotAllowed for status %s',
      async (status) => {
        const store = createMockResubmitStore({
          getRequest: vi.fn().mockResolvedValue({
            id: REQUEST_ID,
            status,
            retryCount: 0,
            policyId: null,
          }),
        });
        const deps = defaultResubmitDeps({ store });
        const svc = createResubmitService(deps);

        const result = await svc.resubmitRequest(REQUEST_ID);

        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(result.error._tag).toBe('ResubmitNotAllowed');
        if (result.error._tag === 'ResubmitNotAllowed') {
          expect(result.error.message).toContain(status);
        }
      },
    );
  });

  // -------------------------------------------------------------------------
  // error: max retries exceeded
  // -------------------------------------------------------------------------

  describe('max retries exceeded', () => {
    it('returns MaxRetriesExceeded when retryCount >= maxRetries (default 3)', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'changes_requested',
          retryCount: 3,
          policyId: null,
        }),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('MaxRetriesExceeded');
      if (result.error._tag === 'MaxRetriesExceeded') {
        expect(result.error.maxRetries).toBe(3);
        expect(result.error.currentRetries).toBe(3);
        expect(result.error.requestId).toBe(REQUEST_ID);
      }
    });

    it('respects policy maxRetries when policyId set', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'changes_requested',
          retryCount: 1,
          policyId: POLICY_ID,
        }),
      });
      const policyStore = {
        findById: vi.fn().mockResolvedValue({ maxRetries: 1 }),
      };
      const deps = defaultResubmitDeps({ store, policyStore });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('MaxRetriesExceeded');
      if (result.error._tag === 'MaxRetriesExceeded') {
        expect(result.error.maxRetries).toBe(1);
        expect(result.error.currentRetries).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // error: request not found
  // -------------------------------------------------------------------------

  describe('request not found', () => {
    it('returns RequestNotFound', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue(null),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('RequestNotFound');
      if (result.error._tag === 'RequestNotFound') {
        expect(result.error.requestId).toBe(REQUEST_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // default maxRetries when no policy
  // -------------------------------------------------------------------------

  describe('default maxRetries = 3 when no policy', () => {
    it('allows resubmit when retryCount < 3 with no policyId', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'changes_requested',
          retryCount: 2,
          policyId: null,
        }),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.retryCount).toBe(3);
    });

    it('blocks resubmit when retryCount = 3 with no policyId', async () => {
      const store = createMockResubmitStore({
        getRequest: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: 'changes_requested',
          retryCount: 3,
          policyId: null,
        }),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('MaxRetriesExceeded');
    });
  });

  // -------------------------------------------------------------------------
  // persistence error
  // -------------------------------------------------------------------------

  describe('persistence error', () => {
    it('returns PersistenceError when store throws', async () => {
      const store = createMockResubmitStore({
        updateRequestForResubmit: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const deps = defaultResubmitDeps({ store });
      const svc = createResubmitService(deps);

      const result = await svc.resubmitRequest(REQUEST_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PersistenceError');
      if (result.error._tag === 'PersistenceError') {
        expect(result.error.message).toContain(REQUEST_ID);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 4. integration tests — multi-step lifecycle
// ---------------------------------------------------------------------------

describe('request_changes lifecycle integration', () => {
  it('request_changes → resubmit → approve (3-step lifecycle)', async () => {
    // step 1: record request_changes decision
    const decisionDeps = defaultDecisionDeps();
    const changesResult = await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Please add cost breakdown',
        channel: 'web',
      },
      decisionDeps,
    );

    expect(changesResult.ok).toBe(true);
    if (!changesResult.ok) return;
    expect(changesResult.value.decision).toBe('request_changes');

    // verify status was set to changes_requested
    expect(vi.mocked(decisionDeps.store.insertDecisionAndUpdateRequest)).toHaveBeenCalledWith(
      expect.anything(),
      'changes_requested',
    );

    // step 2: resubmit
    const resubmitStore = createMockResubmitStore();
    const resubmitDeps = defaultResubmitDeps({ store: resubmitStore });
    const svc = createResubmitService(resubmitDeps);
    const resubmitResult = await svc.resubmitRequest(REQUEST_ID);

    expect(resubmitResult.ok).toBe(true);
    if (!resubmitResult.ok) return;
    expect(resubmitResult.value.retryCount).toBe(1);
    expect(resubmitResult.value.newToken).toBeTruthy();

    // step 3: approve after resubmit
    const approvalDeps = defaultDecisionDeps();
    const approvalResult = await recordDecision(
      {
        requestId: REQUEST_ID,
        token: resubmitResult.value.newToken,
        decision: 'approved',
        channel: 'web',
      },
      approvalDeps,
    );

    expect(approvalResult.ok).toBe(true);
    if (!approvalResult.ok) return;
    expect(approvalResult.value.decision).toBe('approved');

    // verify approval uses the standard decision.recorded event
    await new Promise((r) => setTimeout(r, 10));
    const emitter = approvalDeps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: HITL_EVENTS.DECISION_RECORDED,
      }),
    );
  });

  it('3 request_changes → 4th resubmit blocked (maxRetries=3)', async () => {
    // simulate 3 request_changes have already occurred (retryCount = 3)
    const store = createMockResubmitStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: 'changes_requested',
        retryCount: 3,
        policyId: null,
      }),
    });
    const deps = defaultResubmitDeps({ store });
    const svc = createResubmitService(deps);

    const result = await svc.resubmitRequest(REQUEST_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error._tag).toBe('MaxRetriesExceeded');
    if (result.error._tag === 'MaxRetriesExceeded') {
      expect(result.error.maxRetries).toBe(3);
      expect(result.error.currentRetries).toBe(3);
    }
  });

  it('sequential resubmits increment retryCount correctly', async () => {
    // resubmit 1: retryCount 0 → 1
    const store1 = createMockResubmitStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: 'changes_requested',
        retryCount: 0,
        policyId: null,
      }),
    });
    const deps1 = defaultResubmitDeps({ store: store1 });
    const svc1 = createResubmitService(deps1);
    const r1 = await svc1.resubmitRequest(REQUEST_ID);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.retryCount).toBe(1);

    // resubmit 2: retryCount 1 → 2
    const store2 = createMockResubmitStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: 'changes_requested',
        retryCount: 1,
        policyId: null,
      }),
    });
    const deps2 = defaultResubmitDeps({ store: store2 });
    const svc2 = createResubmitService(deps2);
    const r2 = await svc2.resubmitRequest(REQUEST_ID);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.retryCount).toBe(2);

    // resubmit 3: retryCount 2 → 3
    const store3 = createMockResubmitStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: 'changes_requested',
        retryCount: 2,
        policyId: null,
      }),
    });
    const deps3 = defaultResubmitDeps({ store: store3 });
    const svc3 = createResubmitService(deps3);
    const r3 = await svc3.resubmitRequest(REQUEST_ID);
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.value.retryCount).toBe(3);

    // resubmit 4: retryCount 3 → blocked
    const store4 = createMockResubmitStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        status: 'changes_requested',
        retryCount: 3,
        policyId: null,
      }),
    });
    const deps4 = defaultResubmitDeps({ store: store4 });
    const svc4 = createResubmitService(deps4);
    const r4 = await svc4.resubmitRequest(REQUEST_ID);
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error._tag).toBe('MaxRetriesExceeded');
  });
});

// ---------------------------------------------------------------------------
// 5. event schema constants
// ---------------------------------------------------------------------------

describe('HITL_EVENTS', () => {
  it('includes CHANGES_REQUESTED constant', () => {
    expect(HITL_EVENTS.CHANGES_REQUESTED).toBe('hitl/changes.requested');
  });

  it('preserves existing APPROVAL_REQUESTED', () => {
    expect(HITL_EVENTS.APPROVAL_REQUESTED).toBe('hitl/approval.requested');
  });

  it('preserves existing DECISION_RECORDED', () => {
    expect(HITL_EVENTS.DECISION_RECORDED).toBe('hitl/decision.recorded');
  });
});

// ---------------------------------------------------------------------------
// 6. barrel exports
// ---------------------------------------------------------------------------

describe('barrel exports', () => {
  it('createResubmitService is exported from @aptivo/hitl-gateway', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.createResubmitService).toBe('function');
  });

  it('HITL_EVENTS.CHANGES_REQUESTED is exported from @aptivo/hitl-gateway', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(mod.HITL_EVENTS.CHANGES_REQUESTED).toBe('hitl/changes.requested');
  });

  it('RecordDecisionInputSchema accepts request_changes', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    const result = mod.RecordDecisionInputSchema.safeParse({
      requestId: REQUEST_ID,
      token: TOKEN,
      decision: 'request_changes',
      comment: 'Needs revision',
      channel: 'web',
    });
    expect(result.success).toBe(true);
  });

  it('recordDecision is still exported (backward compat)', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.recordDecision).toBe('function');
  });
});
