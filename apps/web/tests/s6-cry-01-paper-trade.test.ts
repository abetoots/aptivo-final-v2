/**
 * S6-CRY-01: crypto paper trading workflow tests
 * @task S6-CRY-01
 *
 * verifies the 6-step paper trading pipeline using @inngest/test
 * for deterministic step execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockLlmGateway = {
  complete: vi.fn(),
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

const mockNotificationService = {
  send: vi.fn().mockResolvedValue(Result.ok({ deliveryId: 'delivery-1' })),
};

const mockCreateRequest = vi.fn();

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getLlmGateway: () => mockLlmGateway,
  getAuditService: () => mockAuditService,
  getCryptoTradeSignalStore: () => mockTradeSignalStore,
  getCryptoExecutionStore: () => mockExecutionStore,
  getHitlRequestDeps: () => mockHitlRequestDeps,
  getHitlMultiApproverService: () => null, // single-approver fallback for legacy tests
  getNotificationService: () => mockNotificationService,
}));

vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: (...args: unknown[]) => mockCreateRequest(...args),
}));

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { paperTradeFn } from '../src/lib/workflows/crypto-paper-trade.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
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

// default mock signal returned by findById
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

// default LLM success response
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

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // default: LLM succeeds
  mockLlmGateway.complete.mockResolvedValue(llmSuccessResponse);

  // default: signal store returns a valid signal
  mockTradeSignalStore.findById.mockResolvedValue(mockSignal);
  mockTradeSignalStore.updateStatus.mockResolvedValue(undefined);

  // default: no open positions
  mockExecutionStore.findOpen.mockResolvedValue([]);
  mockExecutionStore.create.mockResolvedValue({ id: 'trade-1' });

  // default: createRequest succeeds
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

  // default: audit succeeds
  mockAuditService.emit.mockResolvedValue(
    Result.ok({
      id: 'audit-001',
      previousHash: null,
      currentHash: 'abc123',
      sequence: 1,
      timestamp: new Date().toISOString(),
    }),
  );
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S6-CRY-01: Crypto Paper Trading Workflow', () => {
  // -------------------------------------------------------------------------
  // 1. happy path: full pipeline → executed
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('executes full pipeline: LLM → risk → HITL → paper trade → audit', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'executed',
        tradeId: 'trade-1',
        signalId: 'signal-1',
      });
      expect(result.entryPrice).toBeDefined();

      // verify LLM was called
      expect(mockLlmGateway.complete).toHaveBeenCalledTimes(1);

      // verify risk checks ran
      expect(mockTradeSignalStore.findById).toHaveBeenCalledWith('signal-1');
      expect(mockExecutionStore.findOpen).toHaveBeenCalledTimes(1);

      // verify HITL request was created
      expect(mockCreateRequest).toHaveBeenCalledTimes(1);

      // verify trade was created
      expect(mockExecutionStore.create).toHaveBeenCalledTimes(1);

      // verify signal status updated to executed
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'executed');

      // verify audit trail recorded
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. LLM failure → error at llm-analyze step
  // -------------------------------------------------------------------------
  describe('LLM failure', () => {
    it('returns error result when LLM gateway fails', async () => {
      mockLlmGateway.complete.mockResolvedValue(
        Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
      );

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'llm-analyze',
        error: 'ServiceUnavailable',
      });

      // no downstream steps should execute
      expect(mockTradeSignalStore.findById).not.toHaveBeenCalled();
      expect(mockCreateRequest).not.toHaveBeenCalled();
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. max concurrent positions → risk-rejected
  // -------------------------------------------------------------------------
  describe('risk: max concurrent positions', () => {
    it('returns risk-rejected when max concurrent positions reached', async () => {
      // return 5 open positions (the max)
      mockExecutionStore.findOpen.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `trade-open-${i}`,
          signalId: `signal-open-${i}`,
          exchange: 'paper',
          status: 'open',
          isPaper: true,
        })),
      );

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'risk-rejected',
        signalId: 'signal-1',
        reason: 'Max concurrent positions (5) reached',
      });

      // signal status should be updated to rejected
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'rejected');

      // audit recorded for risk rejection
      expect(mockAuditService.emit).toHaveBeenCalled();

      // no HITL request or execution
      expect(mockCreateRequest).not.toHaveBeenCalled();
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. R:R ratio below 2:1 → risk-rejected
  // -------------------------------------------------------------------------
  describe('risk: bad reward/risk ratio', () => {
    it('returns risk-rejected when R:R ratio is below minimum', async () => {
      // signal with bad R:R: entry=3000, SL=2800 (risk=200), TP=3100 (reward=100) → 0.50
      mockTradeSignalStore.findById.mockResolvedValue({
        ...mockSignal,
        entryZone: '3000.00000000',
        stopLoss: '2800.00000000',
        takeProfit: '3100.00000000',
      });

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'risk-rejected',
        signalId: 'signal-1',
      });
      expect(result.reason).toContain('R:R ratio');
      expect(result.reason).toContain('below minimum');

      // signal rejected
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'rejected');

      // no downstream execution
      expect(mockCreateRequest).not.toHaveBeenCalled();
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4b. position-size exceeds 3% of portfolio → risk-rejected
  // -------------------------------------------------------------------------
  describe('risk: position-size exceeds 3%', () => {
    it('returns risk-rejected when trade size exceeds 3% of portfolio value', async () => {
      // portfolio value from open positions: 2 trades at $5k = $10k total.
      // new $1000 trade = 1000/10000 = 10% > 3% → rejected.
      mockExecutionStore.findOpen.mockResolvedValue([
        { id: 'trade-a', sizeUsd: '5000.00', status: 'open' },
        { id: 'trade-b', sizeUsd: '5000.00', status: 'open' },
      ]);

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'risk-rejected',
        signalId: 'signal-1',
      });
      expect(result.reason).toContain('exceeds max 3%');

      // signal rejected
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'rejected');

      // no HITL request or execution
      expect(mockCreateRequest).not.toHaveBeenCalled();
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. HITL rejection → rejected with reason
  // -------------------------------------------------------------------------
  describe('HITL rejection', () => {
    // S18-A1: the production HitlDecisionRecorded payload (per
    // packages/hitl-gateway/src/workflow/event-schemas.ts:40) carries
    // only requestId/decision/approverId/decidedAt/traceparent — no
    // free-form rejection reason. The fixture mirrors that shape; the
    // workflow surfaces a fixed 'rejected by approver' message.
    it('returns rejected status and updates signal when decision is rejected', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'rejected',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T11:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'rejected',
        signalId: 'signal-1',
        reason: 'rejected by approver',
      });

      // signal updated to rejected
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'rejected');

      // no trade execution
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 6. HITL timeout → expired
  // -------------------------------------------------------------------------
  describe('HITL timeout', () => {
    it('returns expired status and updates signal when decision times out', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => null, // simulates timeout
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'expired',
        signalId: 'signal-1',
      });

      // signal updated to expired
      expect(mockTradeSignalStore.updateStatus).toHaveBeenCalledWith('signal-1', 'expired');

      // no trade execution
      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 11. approver notification sent after HITL request
  // -------------------------------------------------------------------------
  describe('approver notification (S7-CF-03)', () => {
    it('sends notification to approver after HITL request creation', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify notification was sent
      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateSlug: 'crypto-signal-approval',
          variables: expect.objectContaining({
            token: 'ETH',
            direction: 'long',
          }),
        }),
      );
    });

    it('continues workflow even when notification fails', async () => {
      mockNotificationService.send.mockRejectedValueOnce(new Error('Notification service down'));

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      // workflow should still complete despite notification failure
      expect(result).toMatchObject({
        status: 'executed',
        tradeId: 'trade-1',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. execution creates trade with isPaper and correct slippage
  // -------------------------------------------------------------------------
  describe('paper execution details', () => {
    it('creates trade with isPaper: true and 0.5% slippage for long', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // verify execution store was called with correct params
      expect(mockExecutionStore.create).toHaveBeenCalledTimes(1);
      const createCall = mockExecutionStore.create.mock.calls[0]![0];

      expect(createCall.signalId).toBe('signal-1');
      expect(createCall.exchange).toBe('paper');
      expect(createCall.isPaper).toBe(true);
      expect(createCall.sizeUsd).toBe('1000.00');
      expect(createCall.status).toBe('open');

      // entry price should be base (3000) * 1.005 = 3015 for a long
      const expectedPrice = 3000 * 1.005;
      expect(createCall.entryPrice).toBe(expectedPrice.toFixed(8));

      // risk data should include slippage and fee info
      expect(createCall.riskData).toMatchObject({
        slippagePct: 0.005,
        feesPct: 0.001,
        feesUsd: 1, // 1000 * 0.001
      });
    });

    it('applies adverse slippage for short direction', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent({ direction: 'short' }),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      const createCall = mockExecutionStore.create.mock.calls[0]![0];

      // entry price should be base (3000) * 0.995 = 2985 for a short
      const expectedPrice = 3000 * 0.995;
      expect(createCall.entryPrice).toBe(expectedPrice.toFixed(8));
    });
  });

  // -------------------------------------------------------------------------
  // 8. audit trail recorded for successful execution
  // -------------------------------------------------------------------------
  describe('audit trail', () => {
    it('records audit event with trade details after successful execution', async () => {
      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-trade-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'hitl-req-1',
                decision: 'approved',
                approverId: 'trader-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      await engine.execute();

      // find the audit-trail call (last emit call)
      const auditCalls = mockAuditService.emit.mock.calls;
      expect(auditCalls.length).toBeGreaterThanOrEqual(1);

      const lastAuditCall = auditCalls[auditCalls.length - 1]![0];
      // S18-A1: post-HITL audit attributes to the approver (decisionData.approverId)
      // so audit_logs.user_id is populated and the anomaly aggregate matches.
      expect(lastAuditCall).toMatchObject({
        actor: { id: 'trader-1', type: 'user' },
        action: 'crypto.trade.paper-executed',
        resource: { type: 'trade-execution', id: 'trade-1' },
        domain: 'crypto',
        metadata: {
          signalId: 'signal-1',
          token: 'ETH',
          direction: 'long',
          isPaper: true,
          confidenceScore: 85,
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. signal not found during risk check → risk-rejected
  // -------------------------------------------------------------------------
  describe('risk: signal not found', () => {
    it('returns risk-rejected when signal cannot be found', async () => {
      mockTradeSignalStore.findById.mockResolvedValue(null);

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'risk-rejected',
        signalId: 'signal-1',
        reason: 'Signal not found',
      });

      expect(mockCreateRequest).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 10. HITL request creation failure → error
  // -------------------------------------------------------------------------
  describe('HITL request failure', () => {
    it('returns error when HITL request creation fails', async () => {
      mockCreateRequest.mockResolvedValue(
        Result.err({ _tag: 'ValidationError', message: 'Invalid approver' }),
      );

      const engine = engineFor(paperTradeFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'hitl-request',
        error: 'ValidationError: Invalid approver',
      });

      expect(mockExecutionStore.create).not.toHaveBeenCalled();
    });
  });
});
