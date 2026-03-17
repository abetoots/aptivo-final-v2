/**
 * HITL2-02: Multi-Approver Request Creation + Per-Approver Tokens
 * @task HITL2-02
 *
 * verifies multi-approver request creation, per-approver token minting,
 * policy validation, error handling, and backward compatibility with
 * the existing single-approver createRequest service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMultiApproverRequestService,
  CreateMultiApproverRequestInputSchema,
  createRequest,
  type MultiRequestServiceDeps,
  type RequestTokenStore,
  type ApprovalPolicyStore,
  type ApprovalPolicyRecord,
} from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// mock deps
// ---------------------------------------------------------------------------

function createMockPolicyStore(): ApprovalPolicyStore {
  return {
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
  };
}

function createMockRequestStore() {
  return {
    insert: vi.fn().mockResolvedValue({ id: 'req-1' }),
  };
}

function createMockTokenStore(): RequestTokenStore {
  return {
    insertTokens: vi.fn().mockResolvedValue(undefined),
    findByRequestAndApprover: vi.fn(),
    findByRequestId: vi.fn(),
  };
}

function createMockGenerateToken() {
  return vi.fn().mockImplementation(async (payload: Record<string, unknown>) => ({
    token: `jwt-${payload.approverId}`,
    hash: `hash-${payload.approverId}`,
    expiresAt: new Date('2026-04-01T00:00:00Z'),
  }));
}

// ---------------------------------------------------------------------------
// valid multi-approver input (3 approvers)
// ---------------------------------------------------------------------------

const APPROVER_IDS = [
  '11111111-1111-4111-a111-111111111111',
  '22222222-2222-4222-a222-222222222222',
  '33333333-3333-4333-a333-333333333333',
];

const POLICY_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

function validInput() {
  return {
    workflowId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
    domain: 'crypto',
    actionType: 'trade-approval',
    summary: 'Approve large BTC trade',
    approverIds: APPROVER_IDS,
    policyId: POLICY_ID,
    ttlSeconds: 600,
  };
}

function quorumPolicy(threshold = 2): ApprovalPolicyRecord {
  return {
    id: POLICY_ID,
    name: 'trade-quorum',
    type: 'quorum',
    threshold,
    approverRoles: ['risk-manager', 'compliance-officer', 'cfo'],
    maxRetries: 3,
    timeoutSeconds: 86400,
    escalationPolicy: null,
    createdAt: new Date(),
  };
}

function singlePolicy(): ApprovalPolicyRecord {
  return {
    id: POLICY_ID,
    name: 'basic-approval',
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
// test suite
// ---------------------------------------------------------------------------

describe('createMultiApproverRequestService', () => {
  let mockPolicyStore: ApprovalPolicyStore;
  let mockRequestStore: ReturnType<typeof createMockRequestStore>;
  let mockTokenStore: RequestTokenStore;
  let mockGenerateToken: ReturnType<typeof createMockGenerateToken>;
  let deps: MultiRequestServiceDeps;

  beforeEach(() => {
    mockPolicyStore = createMockPolicyStore();
    mockRequestStore = createMockRequestStore();
    mockTokenStore = createMockTokenStore();
    mockGenerateToken = createMockGenerateToken();

    deps = {
      requestStore: mockRequestStore,
      tokenStore: mockTokenStore,
      policyStore: mockPolicyStore,
      generateToken: mockGenerateToken,
      config: { baseUrl: 'https://app.aptivo.com' },
    };
  });

  // -------------------------------------------------------------------------
  // happy path: 3 approvers
  // -------------------------------------------------------------------------

  describe('happy path with 3 approvers', () => {
    beforeEach(() => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(2));
    });

    it('returns 3 ApproverTokenResults', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.approvers).toHaveLength(3);
      expect(result.value.policyId).toBe(POLICY_ID);
      expect(result.value.requestId).toBeTruthy();
    });

    it('each approver has unique token and tokenHash', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const tokens = result.value.approvers.map((a) => a.token);
      const hashes = result.value.approvers.map((a) => a.tokenHash);

      // all tokens should be unique
      expect(new Set(tokens).size).toBe(3);
      // all hashes should be unique
      expect(new Set(hashes).size).toBe(3);
    });

    it('each approver has correct approveUrl and rejectUrl', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      for (const approver of result.value.approvers) {
        const requestId = result.value.requestId;
        expect(approver.approveUrl).toBe(
          `https://app.aptivo.com/hitl/${requestId}/approve?token=${approver.token}`,
        );
        expect(approver.rejectUrl).toBe(
          `https://app.aptivo.com/hitl/${requestId}/reject?token=${approver.token}`,
        );
      }
    });

    it('per-approver tokens stored in tokenStore', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(vi.mocked(mockTokenStore.insertTokens)).toHaveBeenCalledOnce();

      const insertedTokens = vi.mocked(mockTokenStore.insertTokens).mock.calls[0]![0];
      expect(insertedTokens).toHaveLength(3);

      // verify each token record matches an approver
      for (const tokenRecord of insertedTokens) {
        expect(tokenRecord.requestId).toBe(result.value.requestId);
        expect(APPROVER_IDS).toContain(tokenRecord.approverId);
        expect(tokenRecord.tokenHash).toBeTruthy();
        expect(tokenRecord.tokenExpiresAt).toBeInstanceOf(Date);
      }
    });

    it('persists request record with first approver as primary', async () => {
      const svc = createMultiApproverRequestService(deps);
      await svc.createMultiApproverRequest(validInput());

      expect(mockRequestStore.insert).toHaveBeenCalledOnce();

      const record = mockRequestStore.insert.mock.calls[0]![0] as Record<string, unknown>;
      expect(record.approverId).toBe(APPROVER_IDS[0]);
      expect(record.policyId).toBe(POLICY_ID);
      expect(record.status).toBe('pending');
      expect(record.retryCount).toBe(0);
      expect(record.domain).toBe('crypto');
      expect(record.actionType).toBe('trade-approval');
    });

    it('generates tokens for each approver', async () => {
      const svc = createMultiApproverRequestService(deps);
      await svc.createMultiApproverRequest(validInput());

      // 3 approvers = 3 generateToken calls (first is reused for request record)
      expect(mockGenerateToken).toHaveBeenCalledTimes(3);

      // verify each call has correct approverId
      for (let i = 0; i < 3; i++) {
        const call = mockGenerateToken.mock.calls[i]![0] as Record<string, unknown>;
        expect(call.approverId).toBe(APPROVER_IDS[i]);
        expect(call.action).toBe('decide');
      }
    });
  });

  // -------------------------------------------------------------------------
  // policy validation: quorum threshold
  // -------------------------------------------------------------------------

  describe('policy validation', () => {
    it('rejects when approver count < quorum threshold', async () => {
      // quorum threshold of 3, but only 1 approver
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(3));

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        approverIds: [APPROVER_IDS[0]!],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PolicyValidationError');
      if (result.error._tag === 'PolicyValidationError') {
        expect(result.error.message).toContain('Quorum requires at least 3 approvers, got 1');
      }
    });

    it('accepts when approver count equals quorum threshold', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(2));

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        approverIds: [APPROVER_IDS[0]!, APPROVER_IDS[1]!],
      });

      expect(result.ok).toBe(true);
    });

    it('does not enforce quorum threshold for single policy type', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(singlePolicy());

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        approverIds: [APPROVER_IDS[0]!],
      });

      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // policy not found
  // -------------------------------------------------------------------------

  describe('policy not found', () => {
    it('returns PolicyNotFoundError when policy does not exist', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(null);

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PolicyNotFoundError');
      if (result.error._tag === 'PolicyNotFoundError') {
        expect(result.error.policyId).toBe(POLICY_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // validation errors
  // -------------------------------------------------------------------------

  describe('validation errors', () => {
    it('returns ValidationError for missing required fields', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({});

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('returns ValidationError for empty approverIds', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        approverIds: [],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('returns ValidationError for invalid UUID in approverIds', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        approverIds: ['not-a-uuid'],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('returns ValidationError for missing policyId', async () => {
      const svc = createMultiApproverRequestService(deps);
      const { policyId, ...rest } = validInput();
      const result = await svc.createMultiApproverRequest(rest);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });

    it('returns ValidationError for ttlSeconds > 3600', async () => {
      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest({
        ...validInput(),
        ttlSeconds: 7200,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
    });
  });

  // -------------------------------------------------------------------------
  // token generation failure
  // -------------------------------------------------------------------------

  describe('token generation failure', () => {
    it('returns PersistenceError when generateToken throws', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(2));
      mockGenerateToken.mockRejectedValueOnce(new Error('HSM unavailable'));

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PersistenceError');
      if (result.error._tag === 'PersistenceError') {
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });
  });

  // -------------------------------------------------------------------------
  // persistence failure
  // -------------------------------------------------------------------------

  describe('persistence failure', () => {
    it('returns PersistenceError when requestStore.insert throws', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(2));
      mockRequestStore.insert.mockRejectedValueOnce(new Error('DB connection lost'));

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PersistenceError');
    });

    it('returns PersistenceError when tokenStore.insertTokens throws', async () => {
      vi.mocked(mockPolicyStore.findById).mockResolvedValue(quorumPolicy(2));
      vi.mocked(mockTokenStore.insertTokens).mockRejectedValueOnce(new Error('Token insert failed'));

      const svc = createMultiApproverRequestService(deps);
      const result = await svc.createMultiApproverRequest(validInput());

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('PersistenceError');
    });
  });
});

// ---------------------------------------------------------------------------
// input schema validation
// ---------------------------------------------------------------------------

describe('CreateMultiApproverRequestInputSchema', () => {
  it('validates a complete valid input', () => {
    const result = CreateMultiApproverRequestInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approverIds).toHaveLength(3);
      expect(result.data.ttlSeconds).toBe(600);
    }
  });

  it('applies default ttlSeconds of 900', () => {
    const { ttlSeconds, ...rest } = validInput();
    const result = CreateMultiApproverRequestInputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttlSeconds).toBe(900);
    }
  });

  it('accepts optional workflowStepId', () => {
    const result = CreateMultiApproverRequestInputSchema.safeParse({
      ...validInput(),
      workflowStepId: 'step-42',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workflowStepId).toBe('step-42');
    }
  });

  it('accepts optional details', () => {
    const result = CreateMultiApproverRequestInputSchema.safeParse({
      ...validInput(),
      details: { amount: 50000, asset: 'BTC' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.details).toStrictEqual({ amount: 50000, asset: 'BTC' });
    }
  });
});

// ---------------------------------------------------------------------------
// backward compatibility: original createRequest still works
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('createRequest is still exported from @aptivo/hitl-gateway', () => {
    expect(typeof createRequest).toBe('function');
  });

  it('createMultiApproverRequestService is exported alongside createRequest', async () => {
    const mod = await import('@aptivo/hitl-gateway');
    expect(typeof mod.createRequest).toBe('function');
    expect(typeof mod.createMultiApproverRequestService).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// schema table export
// ---------------------------------------------------------------------------

describe('hitlRequestTokens schema', () => {
  it('is exported from @aptivo/database', async () => {
    const { hitlRequestTokens } = await import('@aptivo/database');

    expect(hitlRequestTokens).toBeDefined();
    expect(hitlRequestTokens.id).toBeDefined();
    expect(hitlRequestTokens.requestId).toBeDefined();
    expect(hitlRequestTokens.approverId).toBeDefined();
    expect(hitlRequestTokens.tokenHash).toBeDefined();
    expect(hitlRequestTokens.tokenExpiresAt).toBeDefined();
  });
});
