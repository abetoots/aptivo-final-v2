/**
 * S12-00: Sprint 11 Carry-Over Bundle tests
 * @task S12-00
 *
 * verifies:
 * - F-3: changes.requested event includes retryCount from request record
 * - F-4: workflow falls back to single-approver when policy creation throws
 * - F-6: TSD does not contain stale `approverOrder` column reference
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordDecision,
  type DecisionServiceDeps,
  type DecisionStore,
  type DecisionEventEmitter,
} from '@aptivo/hitl-gateway';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const APPROVER_ID = '11111111-1111-4111-a111-111111111111';
const TOKEN = 'valid-jwt-token';

// ---------------------------------------------------------------------------
// mock token verification (hoisted)
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
// mock services for workflow tests (hoisted declarations)
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

vi.mock('@aptivo/hitl-gateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aptivo/hitl-gateway')>();
  return {
    ...actual,
    createRequest: (...args: unknown[]) => mockCreateRequest(...args),
  };
});

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-s12-00' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

// ---------------------------------------------------------------------------
// imports under test (after mocks)
// ---------------------------------------------------------------------------

import { contractApprovalFn } from '../src/lib/workflows/hr-contract-approval.js';
import { paperTradeFn } from '../src/lib/workflows/crypto-paper-trade.js';

// ---------------------------------------------------------------------------
// helpers: decision service mock deps
// ---------------------------------------------------------------------------

function createMockDecisionStore(overrides: Partial<DecisionStore> = {}): DecisionStore {
  return {
    getRequest: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      approverId: APPROVER_ID,
      status: 'pending',
      tokenHash: 'hash-123',
      tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
      retryCount: 2,
    }),
    getDecisionByRequestId: vi.fn().mockResolvedValue(null),
    insertDecisionAndUpdateRequest: vi.fn().mockResolvedValue({ id: 'dec-001' }),
    ...overrides,
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
// helpers: workflow engine
// ---------------------------------------------------------------------------

const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

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

const hrTriggerEvent = () =>
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
      },
    },
  ] as [any];

const cryptoTriggerEvent = () =>
  [
    {
      name: 'crypto/signal.created' as const,
      data: {
        signalId: 'signal-1',
        token: 'ETH',
        direction: 'long',
        confidenceScore: 85,
      },
    },
  ] as [any];

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
        { approverId: 'approver-1', token: 'tok-1', tokenHash: 'hash-1', tokenExpiresAt: new Date(), approveUrl: 'url-1', rejectUrl: 'url-r1' },
        { approverId: 'approver-2', token: 'tok-2', tokenHash: 'hash-2', tokenExpiresAt: new Date(), approveUrl: 'url-2', rejectUrl: 'url-r2' },
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
// F-3: changes.requested event includes retryCount
// ---------------------------------------------------------------------------

describe('F-3: hitl/changes.requested event includes retryCount', () => {
  it('includes retryCount from request record in changes.requested event', async () => {
    const store = createMockDecisionStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        approverId: APPROVER_ID,
        status: 'pending',
        tokenHash: 'hash-123',
        tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
        retryCount: 2,
      }),
    });
    const deps = defaultDecisionDeps({ store });

    const result = await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Need more details',
        channel: 'web',
      },
      deps,
    );

    expect(result.ok).toBe(true);

    // wait for fire-and-forget event emission
    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hitl/changes.requested',
        data: expect.objectContaining({
          requestId: REQUEST_ID,
          retryCount: 2,
        }),
      }),
    );
  });

  it('defaults retryCount to 0 when request has no retryCount', async () => {
    const store = createMockDecisionStore({
      getRequest: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        approverId: APPROVER_ID,
        status: 'pending',
        tokenHash: 'hash-123',
        tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
        // no retryCount field
      }),
    });
    const deps = defaultDecisionDeps({ store });

    await recordDecision(
      {
        requestId: REQUEST_ID,
        token: TOKEN,
        decision: 'request_changes',
        comment: 'Fix the budget',
        channel: 'web',
      },
      deps,
    );

    await new Promise((r) => setTimeout(r, 10));

    const emitter = deps.eventEmitter!;
    expect(vi.mocked(emitter.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retryCount: 0,
        }),
      }),
    );
  });

  it('does not include retryCount in approved decision events', async () => {
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
    const calls = vi.mocked(emitter.emit).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0].data).not.toHaveProperty('retryCount');
  });
});

// ---------------------------------------------------------------------------
// F-4: workflow falls back to single-approver when policy creation throws
// ---------------------------------------------------------------------------

describe('F-4: workflow falls back to single-approver when policyStore.create throws', () => {
  describe('HR contract approval', () => {
    it('falls back to single-approver when policyStore.create throws', async () => {
      // make policy creation throw (not return Result.err)
      mockPolicyStore.create.mockRejectedValue(new Error('DB constraint violation'));

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

      // policy create was called and threw
      expect(mockPolicyStore.create).toHaveBeenCalledTimes(1);

      // single-approver should be used as fallback
      expect(mockHitlService.createRequest).toHaveBeenCalledTimes(1);

      // workflow completes successfully
      expect(result).toMatchObject({ status: 'signed' });
    });
  });

  describe('Crypto paper trade', () => {
    beforeEach(() => {
      mockLlmGateway.complete.mockReset();
      mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse);
    });

    it('falls back to single-approver when policyStore.create throws', async () => {
      // make policy creation throw (not return Result.err)
      mockPolicyStore.create.mockRejectedValue(new Error('DB constraint violation'));

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

      // policy create was called and threw
      expect(mockPolicyStore.create).toHaveBeenCalledTimes(1);

      // single-approver should be used as fallback
      expect(mockCreateRequest).toHaveBeenCalledTimes(1);

      // workflow completes successfully
      expect(result).toMatchObject({ status: 'executed' });
    });
  });
});

// ---------------------------------------------------------------------------
// F-6: TSD does not contain `approverOrder`
// ---------------------------------------------------------------------------

// @testtype doc-lint
describe('F-6: TSD column name correctness', () => {
  it('hitl-gateway.md does not contain approverOrder', () => {
    const tsdPath = path.resolve(
      import.meta.dirname,
      '../../../docs/04-specs/platform-core/hitl-gateway.md',
    );
    const content = fs.readFileSync(tsdPath, 'utf-8');
    expect(content).not.toContain('approverOrder');
  });

  it('hitl-gateway.md contains approverId (correct column name)', () => {
    const tsdPath = path.resolve(
      import.meta.dirname,
      '../../../docs/04-specs/platform-core/hitl-gateway.md',
    );
    const content = fs.readFileSync(tsdPath, 'utf-8');
    expect(content).toContain('approverId');
  });
});
