/**
 * HITL2-07: Domain Workflow Upgrades — multi-approver integration tests
 * @task HITL2-07
 *
 * verifies that both HR contract approval and crypto paper trade workflows
 * correctly use multi-approver HITL when available, fall back to single-approver
 * when unavailable, and handle request_changes decisions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockContractStore = {
  create: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
};

const mockLlmGateway = {
  complete: vi.fn(),
};

const mockHitlService = {
  createRequest: vi.fn(),
};

const mockNotificationService = {
  send: vi.fn(),
};

const mockAuditService = {
  emit: vi.fn(),
};

const mockTradeSignalStore = {
  findById: vi.fn(),
  findPending: vi.fn(),
  updateStatus: vi.fn(),
  create: vi.fn(),
};

const mockExecutionStore = {
  findOpen: vi.fn(),
  create: vi.fn(),
  close: vi.fn(),
  findById: vi.fn(),
};

const mockHitlRequestDeps = {
  store: {
    insert: vi.fn().mockResolvedValue({ id: 'hitl-req-1' }),
  },
  config: {
    baseUrl: 'http://localhost:3000',
    signingSecret: 'test-secret-key-must-be-at-least-32-chars!!',
    audience: 'aptivo-hitl',
    issuer: 'aptivo-platform',
  },
};

// multi-approver mock service
const mockPolicyStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findByName: vi.fn(),
  list: vi.fn(),
};

const mockMultiApproverService = {
  createMultiApproverRequest: vi.fn(),
  policyStore: mockPolicyStore,
};

// controls whether multi-approver service is available
let multiApproverServiceAvailable = true;

const mockCreateRequest = vi.fn();

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getContractStore: () => mockContractStore,
  getLlmGateway: () => mockLlmGateway,
  getHitlService: () => mockHitlService,
  getNotificationService: () => mockNotificationService,
  getAuditService: () => mockAuditService,
  getCryptoTradeSignalStore: () => mockTradeSignalStore,
  getCryptoExecutionStore: () => mockExecutionStore,
  getHitlRequestDeps: () => mockHitlRequestDeps,
  getHitlMultiApproverService: () => multiApproverServiceAvailable ? mockMultiApproverService : null,
}));

vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: (...args: unknown[]) => mockCreateRequest(...args),
}));

// mock inngest.send for event emission steps
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-hitl2-07' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { contractApprovalFn } from '../src/lib/workflows/hr-contract-approval.js';
import { paperTradeFn } from '../src/lib/workflows/crypto-paper-trade.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

// hr contract trigger event
const hrTriggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'hr/contract.approval.requested' as const,
      data: {
        candidateId: 'cand-001',
        positionId: 'pos-001',
        templateSlug: 'employment-agreement',
        terms: { salary: 120000, startDate: '2026-04-01' },
        requestedBy: 'user-001',
        domain: 'hr' as const,
        ...overrides,
      },
    },
  ] as [any];

// crypto signal trigger event
const cryptoTriggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'crypto/signal.created' as const,
      data: {
        signalId: 'signal-1',
        token: 'ETH',
        direction: 'long',
        confidenceScore: 85,
        ...overrides,
      },
    },
  ] as [any];

// default mock signal
const mockSignal = {
  id: 'signal-1',
  token: 'ETH',
  direction: 'long',
  entryZone: '3000.00000000',
  stopLoss: '2900.00000000',
  takeProfit: '3300.00000000',
  reasoning: 'Strong momentum',
  confidenceScore: '85.00',
  status: 'pending',
  expiresAt: null,
  createdAt: new Date().toISOString(),
};

// default llm success response
const draftLlmResponse = () =>
  Result.ok({
    completion: {
      id: 'llm-draft-1',
      content: 'This Employment Agreement is entered into...',
      finishReason: 'stop',
      usage: { promptTokens: 80, completionTokens: 200, totalTokens: 280 },
    },
    costUsd: 0.005,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 300,
  });

const complianceLlmResponse = (flags: string[] = []) =>
  Result.ok({
    completion: {
      id: 'llm-compliance-1',
      content: JSON.stringify({ flags }),
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
    costUsd: 0.003,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 250,
  });

const llmSuccessResponse = Result.ok({
  completion: {
    id: 'llm-resp-1',
    content: 'ETH shows bullish momentum with strong support at 2900',
    finishReason: 'stop',
    usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
  },
  costUsd: 0.002,
  provider: 'openai',
  wasFallback: false,
  latencyMs: 150,
});

const auditSuccessResponse = () =>
  Result.ok({
    id: 'audit-001',
    previousHash: null,
    currentHash: 'abc123',
    sequence: 1,
    timestamp: new Date(),
  });

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  multiApproverServiceAvailable = true;

  // hr defaults
  mockContractStore.create.mockResolvedValue({ id: 'contract-001' });
  mockContractStore.updateStatus.mockResolvedValue(undefined);
  mockLlmGateway.complete
    .mockResolvedValueOnce(draftLlmResponse())
    .mockResolvedValueOnce(complianceLlmResponse());

  // hitl single-approver defaults
  mockHitlService.createRequest.mockResolvedValue(
    Result.ok({
      requestId: 'hitl-req-1',
      tokenHash: 'hash-1',
      token: 'jwt-token-1',
      tokenExpiresAt: new Date().toISOString(),
      approveUrl: 'http://localhost:3000/hitl/hitl-req-1?action=approve&token=jwt-token-1',
      rejectUrl: 'http://localhost:3000/hitl/hitl-req-1?action=reject&token=jwt-token-1',
    }),
  );

  // multi-approver defaults
  mockPolicyStore.create.mockResolvedValue({
    id: 'policy-001',
    name: 'test-policy',
    type: 'sequential',
    threshold: null,
    approverRoles: ['hr_reviewer', 'legal_reviewer'],
    maxRetries: 3,
    timeoutSeconds: 86400,
    escalationPolicy: null,
    createdAt: new Date(),
  });

  mockMultiApproverService.createMultiApproverRequest.mockResolvedValue(
    Result.ok({
      requestId: 'multi-req-1',
      policyId: 'policy-001',
      approvers: [
        { approverId: 'approver-1', token: 'tok-1', tokenHash: 'hash-1', tokenExpiresAt: new Date(), approveUrl: 'http://localhost:3000/hitl/multi-req-1/approve?token=tok-1', rejectUrl: 'http://localhost:3000/hitl/multi-req-1/reject?token=tok-1' },
        { approverId: 'approver-2', token: 'tok-2', tokenHash: 'hash-2', tokenExpiresAt: new Date(), approveUrl: 'http://localhost:3000/hitl/multi-req-1/approve?token=tok-2', rejectUrl: 'http://localhost:3000/hitl/multi-req-1/reject?token=tok-2' },
      ],
    }),
  );

  // crypto defaults
  mockTradeSignalStore.findById.mockResolvedValue(mockSignal);
  mockTradeSignalStore.updateStatus.mockResolvedValue(undefined);
  mockExecutionStore.findOpen.mockResolvedValue([]);
  mockExecutionStore.create.mockResolvedValue({ id: 'trade-1' });

  mockCreateRequest.mockResolvedValue(
    Result.ok({
      requestId: 'hitl-req-1',
      tokenHash: 'hash-1',
      token: 'jwt-token-1',
      tokenExpiresAt: new Date().toISOString(),
      approveUrl: 'http://localhost:3000/hitl/hitl-req-1?action=approve&token=jwt-token-1',
      rejectUrl: 'http://localhost:3000/hitl/hitl-req-1?action=reject&token=jwt-token-1',
    }),
  );

  // notification + audit defaults
  mockNotificationService.send.mockResolvedValue(Result.ok({ deliveryId: 'notif-1' }));
  mockAuditService.emit.mockResolvedValue(auditSuccessResponse());
});

// ---------------------------------------------------------------------------
// HR contract approval — multi-approver tests
// ---------------------------------------------------------------------------

describe('HITL2-07: HR Contract Approval — Multi-Approver Upgrade', () => {
  describe('sequential policy creation', () => {
    it('creates sequential policy with hr_reviewer and legal_reviewer roles', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'multi-req-1',
                decision: 'approved',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify policy store create was called with sequential type
      expect(mockPolicyStore.create).toHaveBeenCalledTimes(1);
      expect(mockPolicyStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sequential',
          approverRoles: ['hr_reviewer', 'legal_reviewer'],
        }),
      );
    });
  });

  describe('multi-approver request when service available', () => {
    it('uses createMultiApproverRequest with sequential policy', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'multi-req-1',
                decision: 'approved',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // verify multi-approver service was used
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledTimes(1);
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'hr',
          actionType: 'hr.contract.approval',
          policyId: 'policy-001',
          approverIds: expect.arrayContaining([expect.any(String)]),
        }),
      );

      // verify single-approver was NOT used
      expect(mockHitlService.createRequest).not.toHaveBeenCalled();

      // workflow completes
      expect(result).toMatchObject({ status: 'signed' });
    });

    it('emits hitl/multi.approval.requested event for multi-approver', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'multi-req-1',
                decision: 'approved',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify event emission
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/multi.approval.requested',
          data: expect.objectContaining({
            requestId: 'multi-req-1',
            policyId: 'policy-001',
            domain: 'hr',
          }),
        }),
      );
    });
  });

  describe('fallback to single-approver', () => {
    it('falls back to single-approver when multi-approver service is unavailable', async () => {
      multiApproverServiceAvailable = false;

      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // verify single-approver was used
      expect(mockHitlService.createRequest).toHaveBeenCalledTimes(1);
      expect(mockHitlService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'hr',
          actionType: 'hr.contract.approval',
        }),
      );

      // verify multi-approver was NOT used
      expect(mockMultiApproverService.createMultiApproverRequest).not.toHaveBeenCalled();

      // workflow still completes
      expect(result).toMatchObject({ status: 'signed' });
    });

    it('falls back to single-approver when multi-approver request fails', async () => {
      mockMultiApproverService.createMultiApproverRequest.mockResolvedValue(
        Result.err({ _tag: 'PersistenceError', message: 'db error', cause: new Error('connection failed') }),
      );

      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // both were attempted, single-approver succeeded as fallback
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledTimes(1);
      expect(mockHitlService.createRequest).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({ status: 'signed' });
    });
  });

  describe('request_changes handling', () => {
    it('returns changes-requested status and emits changes event', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: hrTriggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'multi-req-1',
                decision: 'request_changes',
                reviewerNotes: 'Please fix section 3',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'changes-requested',
        contractId: 'contract-001',
        candidateId: 'cand-001',
        comment: 'Please fix section 3',
      });

      // verify changes event was emitted
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/changes.requested',
          data: expect.objectContaining({
            requestId: 'multi-req-1',
            comment: 'Please fix section 3',
            retryCount: 1,
          }),
        }),
      );

      // contract should not be finalized
      expect(mockContractStore.updateStatus).toHaveBeenCalledWith('contract-001', 'pending_review');
      // should not have been called with 'signed' or 'rejected'
      expect(mockContractStore.updateStatus).not.toHaveBeenCalledWith('contract-001', 'signed');
      expect(mockContractStore.updateStatus).not.toHaveBeenCalledWith('contract-001', 'rejected');
    });
  });
});

// ---------------------------------------------------------------------------
// Crypto paper trade — multi-approver tests
// ---------------------------------------------------------------------------

describe('HITL2-07: Crypto Paper Trade — Multi-Approver Upgrade', () => {
  // reset llm mock for crypto tests since beforeEach sets it for HR
  beforeEach(() => {
    mockLlmGateway.complete.mockReset();
    mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse);

    // quorum policy for crypto
    mockPolicyStore.create.mockResolvedValue({
      id: 'policy-crypto-001',
      name: 'crypto-trade-signal-1',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['risk_analyst', 'risk_analyst', 'risk_manager'],
      maxRetries: 3,
      timeoutSeconds: 900,
      escalationPolicy: null,
      createdAt: new Date(),
    });

    mockMultiApproverService.createMultiApproverRequest.mockResolvedValue(
      Result.ok({
        requestId: 'multi-crypto-req-1',
        policyId: 'policy-crypto-001',
        approvers: [
          { approverId: 'analyst-1', token: 'tok-a1', tokenHash: 'hash-a1', tokenExpiresAt: new Date(), approveUrl: 'url-a1', rejectUrl: 'url-r1' },
          { approverId: 'analyst-2', token: 'tok-a2', tokenHash: 'hash-a2', tokenExpiresAt: new Date(), approveUrl: 'url-a2', rejectUrl: 'url-r2' },
          { approverId: 'manager-1', token: 'tok-m1', tokenHash: 'hash-m1', tokenExpiresAt: new Date(), approveUrl: 'url-a3', rejectUrl: 'url-r3' },
        ],
      }),
    );
  });

  describe('quorum policy creation', () => {
    it('creates quorum policy with 2-of-3 threshold and risk roles', async () => {
      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'multi-crypto-req-1',
                decision: 'approved',
                approverId: 'analyst-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify policy store create was called with quorum type
      expect(mockPolicyStore.create).toHaveBeenCalledTimes(1);
      expect(mockPolicyStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quorum',
          threshold: 2,
          approverRoles: ['risk_analyst', 'risk_analyst', 'risk_manager'],
        }),
      );
    });
  });

  describe('multi-approver request when service available', () => {
    it('uses createMultiApproverRequest with quorum policy', async () => {
      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'multi-crypto-req-1',
                decision: 'approved',
                approverId: 'analyst-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // verify multi-approver service was used
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledTimes(1);
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'crypto',
          actionType: 'trade-approval',
          policyId: 'policy-crypto-001',
          approverIds: expect.arrayContaining([expect.any(String)]),
          ttlSeconds: 900,
        }),
      );

      // verify single-approver was NOT used
      expect(mockCreateRequest).not.toHaveBeenCalled();

      // workflow completes
      expect(result).toMatchObject({ status: 'executed' });
    });

    it('emits hitl/multi.approval.requested event for multi-approver', async () => {
      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'multi-crypto-req-1',
                decision: 'approved',
                approverId: 'analyst-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify event emission
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/multi.approval.requested',
          data: expect.objectContaining({
            requestId: 'multi-crypto-req-1',
            policyId: 'policy-crypto-001',
            domain: 'crypto',
          }),
        }),
      );
    });
  });

  describe('fallback to single-approver', () => {
    it('falls back to single-approver when multi-approver service is unavailable', async () => {
      multiApproverServiceAvailable = false;

      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // verify single-approver was used
      expect(mockCreateRequest).toHaveBeenCalledTimes(1);

      // verify multi-approver was NOT used
      expect(mockMultiApproverService.createMultiApproverRequest).not.toHaveBeenCalled();

      // workflow still completes
      expect(result).toMatchObject({ status: 'executed' });
    });

    it('falls back to single-approver when multi-approver request fails', async () => {
      mockMultiApproverService.createMultiApproverRequest.mockResolvedValue(
        Result.err({ _tag: 'PersistenceError', message: 'db error', cause: new Error('connection failed') }),
      );

      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // both were attempted, single-approver succeeded as fallback
      expect(mockMultiApproverService.createMultiApproverRequest).toHaveBeenCalledTimes(1);
      expect(mockCreateRequest).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({ status: 'executed' });
    });
  });

  describe('request_changes handling', () => {
    it('returns changes-requested status and emits changes event', async () => {
      const engine = engineFor(paperTradeFn, {
        events: cryptoTriggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'multi-crypto-req-1',
                decision: 'request_changes',
                reason: 'Risk parameters need adjustment',
                approverId: 'analyst-1',
                decidedAt: '2026-03-17T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'changes-requested',
        signalId: 'signal-1',
        comment: 'Risk parameters need adjustment',
      });

      // verify changes event was emitted
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'hitl/changes.requested',
          data: expect.objectContaining({
            requestId: 'multi-crypto-req-1',
            comment: 'Risk parameters need adjustment',
            retryCount: 1,
          }),
        }),
      );

      // no trade execution should have happened
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// HitlV2Events type registration
// ---------------------------------------------------------------------------

describe('HITL2-07: HitlV2Events type registration', () => {
  it('inngest client accepts hitl/multi.approval.requested event', async () => {
    // if HitlV2Events were not in the union, this send call would fail type-check
    // at runtime we verify the mock was callable with these event names
    const { inngest } = await import('../src/lib/inngest.js');

    // the inngest client should accept these event types without error
    // (actual send is mocked, we just verify the shape is valid)
    expect(() =>
      inngest.send({
        name: 'hitl/multi.approval.requested',
        data: {
          requestId: 'req-1',
          policyId: 'pol-1',
          approverIds: ['a1', 'a2'],
          domain: 'hr',
        },
      }),
    ).not.toThrow();
  });

  it('inngest client accepts hitl/multi.decision.finalized event', async () => {
    const { inngest } = await import('../src/lib/inngest.js');

    expect(() =>
      inngest.send({
        name: 'hitl/multi.decision.finalized',
        data: {
          requestId: 'req-1',
          aggregate: 'approved',
          policyId: 'pol-1',
        },
      }),
    ).not.toThrow();
  });

  it('inngest client accepts hitl/changes.requested event', async () => {
    const { inngest } = await import('../src/lib/inngest.js');

    expect(() =>
      inngest.send({
        name: 'hitl/changes.requested',
        data: {
          requestId: 'req-1',
          approverId: 'a1',
          comment: 'fix this',
          retryCount: 1,
        },
      }),
    ).not.toThrow();
  });
});
