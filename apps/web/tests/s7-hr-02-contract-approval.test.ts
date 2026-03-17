/**
 * S7-HR-02: contract approval workflow tests
 * @task S7-HR-02
 *
 * verifies the 6-step contract approval pipeline using @inngest/test
 * for deterministic step execution.
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

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getContractStore: () => mockContractStore,
  getLlmGateway: () => mockLlmGateway,
  getHitlService: () => mockHitlService,
  getHitlMultiApproverService: () => null, // single-approver fallback for legacy tests
  getNotificationService: () => mockNotificationService,
  getAuditService: () => mockAuditService,
}));

// mock inngest.send for the emit-contract-approved step
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-contract' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { contractApprovalFn } from '../src/lib/workflows/hr-contract-approval.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'hr/contract.approval.requested' as const,
      data: {
        candidateId: 'cand-001',
        positionId: 'pos-001',
        templateSlug: 'employment-agreement',
        terms: { salary: 120000, startDate: '2026-04-01', noticePeriod: '30 days' },
        requestedBy: 'user-001',
        domain: 'hr' as const,
        ...overrides,
      },
    },
  ] as [any];

// default LLM response for drafting
const draftLlmResponse = () =>
  Result.ok({
    completion: {
      id: 'llm-draft-1',
      content: 'This Employment Agreement is entered into between Company and Employee...',
      finishReason: 'stop',
      usage: { promptTokens: 80, completionTokens: 200, totalTokens: 280 },
    },
    costUsd: 0.005,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 300,
  });

// default LLM response for compliance check
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

// standard audit response
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

  // default: contract store succeeds
  mockContractStore.create.mockResolvedValue({ id: 'contract-001' });
  mockContractStore.updateStatus.mockResolvedValue(undefined);

  // default: LLM gateway succeeds — first call drafts, second checks compliance
  mockLlmGateway.complete
    .mockResolvedValueOnce(draftLlmResponse())
    .mockResolvedValueOnce(complianceLlmResponse());

  // default: HITL service succeeds
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

  // default: notification succeeds
  mockNotificationService.send.mockResolvedValue(Result.ok({ deliveryId: 'notif-1' }));

  // default: audit succeeds
  mockAuditService.emit.mockResolvedValue(auditSuccessResponse());
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S7-HR-02: Contract Approval Workflow', () => {
  // -------------------------------------------------------------------------
  // 1. happy path — full approval flow
  // -------------------------------------------------------------------------
  describe('happy path — approved', () => {
    it('drafts contract, checks compliance, gets HITL approval, finalizes as signed, and records audit', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                reviewerNotes: 'Looks good',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // assert result
      expect(result).toMatchObject({
        status: 'signed',
        contractId: 'contract-001',
        candidateId: 'cand-001',
      });

      // verify LLM called twice (draft + compliance)
      expect(mockLlmGateway.complete).toHaveBeenCalledTimes(2);

      // verify contract created with version 1 and status 'draft'
      expect(mockContractStore.create).toHaveBeenCalledTimes(1);
      expect(mockContractStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'cand-001',
          templateSlug: 'employment-agreement',
          version: 1,
          status: 'draft',
          complianceFlags: [],
        }),
      );

      // verify contract status updated to pending_review then signed
      expect(mockContractStore.updateStatus).toHaveBeenCalledWith('contract-001', 'pending_review');
      expect(mockContractStore.updateStatus).toHaveBeenCalledWith('contract-001', 'signed');

      // verify HITL request created
      expect(mockHitlService.createRequest).toHaveBeenCalledTimes(1);

      // verify notification sent for approval
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cand-001',
          templateSlug: 'hr-contract-approved',
        }),
      );

      // verify audit recorded
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'hr.contract.finalized',
          domain: 'hr',
          resource: { type: 'contract', id: 'contract-001' },
          metadata: expect.objectContaining({
            candidateId: 'cand-001',
            positionId: 'pos-001',
            status: 'signed',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. rejection flow — decision is 'rejected'
  // -------------------------------------------------------------------------
  describe('rejection flow', () => {
    it('updates contract status to rejected when decision is rejected', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'rejected',
                reviewerNotes: 'Salary too high',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'rejected',
        contractId: 'contract-001',
        candidateId: 'cand-001',
        reason: 'Salary too high',
      });

      // verify contract status updated to rejected
      expect(mockContractStore.updateStatus).toHaveBeenCalledWith('contract-001', 'rejected');

      // verify rejection notification sent
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cand-001',
          templateSlug: 'hr-contract-rejected',
        }),
      );

      // verify audit recorded with rejected status
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            status: 'rejected',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. timeout flow — waitForEvent returns null
  // -------------------------------------------------------------------------
  describe('timeout flow', () => {
    it('updates contract status to expired when decision times out', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => null, // simulates timeout
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'expired',
        contractId: 'contract-001',
        candidateId: 'cand-001',
      });

      // verify contract status updated to expired
      expect(mockContractStore.updateStatus).toHaveBeenCalledWith('contract-001', 'expired');

      // no notification or audit for finalization (only expire)
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. compliance flags passed to HITL request payload
  // -------------------------------------------------------------------------
  describe('compliance flags in HITL payload', () => {
    it('passes compliance flags from LLM check to HITL request details', async () => {
      const flags = ['Non-compete exceeds 2-year limit', 'Notice period below legal minimum'];

      // override compliance response to include flags
      mockLlmGateway.complete
        .mockReset()
        .mockResolvedValueOnce(draftLlmResponse())
        .mockResolvedValueOnce(complianceLlmResponse(flags));

      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
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

      await engine.execute();

      // verify HITL request contains compliance flags
      expect(mockHitlService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            complianceFlags: flags,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. LLM failure in draft step → workflow errors
  // -------------------------------------------------------------------------
  describe('LLM failure in draft step', () => {
    it('returns error result at draft-contract step when LLM gateway fails', async () => {
      mockLlmGateway.complete
        .mockReset()
        .mockResolvedValueOnce(
          Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
        );

      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'draft-contract',
        error: 'ServiceUnavailable',
      });

      // no downstream calls
      expect(mockContractStore.create).not.toHaveBeenCalled();
      expect(mockHitlService.createRequest).not.toHaveBeenCalled();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockAuditService.emit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 6. notification sent on approval
  // -------------------------------------------------------------------------
  describe('notification on approval', () => {
    it('sends hr-contract-approved notification to candidate', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
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

      await engine.execute();

      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cand-001',
          channel: 'email',
          templateSlug: 'hr-contract-approved',
          variables: expect.objectContaining({
            candidateId: 'cand-001',
            contractId: 'contract-001',
            status: 'signed',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. notification sent on rejection
  // -------------------------------------------------------------------------
  describe('notification on rejection', () => {
    it('sends hr-contract-rejected notification to candidate', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'rejected',
                reviewerNotes: 'Terms unacceptable',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      await engine.execute();

      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'cand-001',
          channel: 'email',
          templateSlug: 'hr-contract-rejected',
          variables: expect.objectContaining({
            candidateId: 'cand-001',
            contractId: 'contract-001',
            status: 'rejected',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. audit event recorded with correct action and metadata
  // -------------------------------------------------------------------------
  describe('audit trail', () => {
    it('records audit event with hr.contract.finalized action and correct metadata', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
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

      await engine.execute();

      expect(mockAuditService.emit).toHaveBeenCalledTimes(1);
      expect(mockAuditService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { id: 'system', type: 'workflow' },
          action: 'hr.contract.finalized',
          resource: { type: 'contract', id: 'contract-001' },
          domain: 'hr',
          metadata: {
            candidateId: 'cand-001',
            positionId: 'pos-001',
            status: 'signed',
          },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. contract created with version 1 and status 'draft'
  // -------------------------------------------------------------------------
  describe('contract initial creation', () => {
    it('creates contract with version 1, status draft, and empty complianceFlags', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
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

      await engine.execute();

      expect(mockContractStore.create).toHaveBeenCalledTimes(1);
      expect(mockContractStore.create).toHaveBeenCalledWith({
        candidateId: 'cand-001',
        templateSlug: 'employment-agreement',
        terms: { salary: 120000, startDate: '2026-04-01', noticePeriod: '30 days' },
        version: 1,
        status: 'draft',
        complianceFlags: [],
      });
    });
  });

  // -------------------------------------------------------------------------
  // 10. HITL request contains contract details
  // -------------------------------------------------------------------------
  describe('HITL request payload', () => {
    it('creates HITL request with contract details including candidateId and positionId', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
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

      await engine.execute();

      expect(mockHitlService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'hr',
          actionType: 'hr.contract.approval',
          summary: 'Contract approval needed for cand-001',
          details: expect.objectContaining({
            contractId: 'contract-001',
            candidateId: 'cand-001',
            positionId: 'pos-001',
            contractText: expect.any(String),
          }),
          expiresInMs: 72 * 60 * 60 * 1000,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 11. compliance check LLM failure → error at compliance-check step
  // -------------------------------------------------------------------------
  describe('LLM failure in compliance step', () => {
    it('returns error result at compliance-check step when second LLM call fails', async () => {
      mockLlmGateway.complete
        .mockReset()
        .mockResolvedValueOnce(draftLlmResponse())
        .mockResolvedValueOnce(
          Result.err({ _tag: 'RateLimited', provider: 'openai' }),
        );

      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'compliance-check',
        error: 'RateLimited',
      });

      // contract was created but HITL was never reached
      expect(mockContractStore.create).toHaveBeenCalledTimes(1);
      expect(mockHitlService.createRequest).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 12. rejection without reviewerNotes defaults reason
  // -------------------------------------------------------------------------
  describe('rejection without reviewer notes', () => {
    it('uses default reason when reviewerNotes is not provided', async () => {
      const engine = engineFor(contractApprovalFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-contract-decision',
            handler: () => ({
              name: 'hr/contract.decision.submitted',
              data: {
                requestId: 'hitl-req-1',
                decision: 'rejected',
                domain: 'hr',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'rejected',
        reason: 'rejected by reviewer',
      });
    });
  });
});
