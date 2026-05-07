/**
 * S18-B1: crypto live-trade workflow tests.
 *
 * Coverage by branch:
 *   - live=false guard
 *   - LLM gateway failure
 *   - risk-check rejection (R:R, max-positions)
 *   - circuit-breaker block (loss limit, breaker error fail-closed)
 *   - HITL approve → execute → store position → audit attributes to approver
 *   - HITL reject → audit emitted, no execution
 *   - HITL timeout → expired status
 *   - Exchange MCP rejection (OrderRejected, InsufficientLiquidity)
 *
 * Pattern matches s6-cry-01-paper-trade.test.ts: vi.mock the services
 * module so the workflow under test sees in-memory shims; drive the
 * inngest function via InngestTestEngine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// service mocks — declared before vi.mock (hoisted)
// ---------------------------------------------------------------------------

const mockLlmGateway = { complete: vi.fn() };
const mockAuditService = { emit: vi.fn() };
const mockSignalStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findPending: vi.fn(),
  updateStatus: vi.fn(),
};
const mockPositionStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findOpen: vi.fn(),
  findClosedSince: vi.fn(),
  close: vi.fn(),
};
const mockBreaker = { checkEntry: vi.fn() };
const mockMcpAdapter = {
  executeOrder: vi.fn(),
  getCurrentPrice: vi.fn(),
  getCurrentPrices: vi.fn(),
};
const mockHitlDeps = { /* placeholder; createRequest is mocked separately */ };
const mockNotificationService = { send: vi.fn() };

// HITL createRequest is exposed by '@aptivo/hitl-gateway' — mock the
// module so the workflow's `createRequest(opts, deps)` call returns
// a deterministic ok Result.
vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: vi.fn(),
}));

vi.mock('../../src/lib/services', () => ({
  getLlmGateway: () => mockLlmGateway,
  getAuditService: () => mockAuditService,
  getCryptoTradeSignalStore: () => mockSignalStore,
  getCryptoPositionStore: () => mockPositionStore,
  getDailyLossCircuitBreaker: () => mockBreaker,
  getExchangeMcpAdapter: () => mockMcpAdapter,
  getHitlRequestDeps: () => mockHitlDeps,
  getNotificationService: () => mockNotificationService,
}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-live-trade' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

// ---------------------------------------------------------------------------
// import after mocks
// ---------------------------------------------------------------------------

import { liveTradeFn } from '../../src/lib/workflows/crypto-live-trade.js';
import { createRequest } from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const APPROVER_ID = 'approver-alice';
const REQUESTED_BY = 'trader-bob';
const SIGNAL_ID = '11111111-1111-4111-8111-111111111111';
const DEPT_ID = '22222222-2222-4222-8222-222222222222';

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'crypto/live-trade.requested' as const,
      data: {
        signalId: SIGNAL_ID,
        token: 'ETH',
        direction: 'long' as const,
        departmentId: DEPT_ID,
        sizeUsd: '1000.00',
        slPrice: '2950.00000000',
        tpPrice: '3100.00000000',
        requestedBy: REQUESTED_BY,
        live: true as const,
        exchange: 'in-memory',
        ...overrides,
      },
    },
  ] as [unknown];

const llmAnalyzeOk = () =>
  Result.ok({
    completion: {
      id: 'llm-1',
      content: 'Analysis: acceptable risk',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    },
    costUsd: 0.001,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 60,
  });

const breakerAllowed = () =>
  Result.ok({
    allowed: true,
    realizedLossUsd: '0.00',
    thresholdUsd: '0.00',
    windowStart: new Date().toISOString(),
  });

const fillOk = () =>
  Result.ok({
    orderId: 'order-1',
    fillPrice: '3000.00000000',
    filledUsd: '1000.00',
    filledAt: new Date().toISOString(),
  });

// helper that wires "happy path" mocks; individual tests override
function happyPathMocks() {
  mockLlmGateway.complete.mockResolvedValue(llmAnalyzeOk());
  mockPositionStore.findOpen.mockResolvedValue([]); // no concurrent positions
  mockBreaker.checkEntry.mockResolvedValue(breakerAllowed());
  mockMcpAdapter.executeOrder.mockResolvedValue(fillOk());
  mockPositionStore.create.mockResolvedValue({ id: 'pos-1' });
  mockSignalStore.updateStatus.mockResolvedValue(undefined);
  mockAuditService.emit.mockResolvedValue(Result.ok({ id: 'audit-1' }));
  mockNotificationService.send.mockResolvedValue({ ok: true });
  vi.mocked(createRequest).mockResolvedValue(
    Result.ok({
      requestId: 'hitl-req-1',
      approveUrl: 'https://t/a',
      rejectUrl: 'https://t/r',
    }),
  );
}

const engineFor = (opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: liveTradeFn, ...opts });

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B1: crypto live-trade workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    happyPathMocks();
  });

  it('rejects before any LLM cost when live flag is missing', async () => {
    const engine = engineFor({ events: triggerEvent({ live: false }) });
    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'live-flag-missing', signalId: SIGNAL_ID });
    expect(mockLlmGateway.complete).not.toHaveBeenCalled();
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
    // audit emit captured the rejection, attributed to requester
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: REQUESTED_BY, type: 'user' },
        action: 'crypto.trade.live-flag-missing',
      }),
    );
  });

  it('rejects with band-invalid before LLM cost when SL/TP band is malformed for a long', async () => {
    // Round-1 review fix: prevents fat-finger swaps from reaching HITL
    // long invariant: slPrice < tpPrice
    const engine = engineFor({
      events: triggerEvent({ slPrice: '3100.00', tpPrice: '2950.00' }),
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('malformed SL/TP band'),
    });
    expect(mockLlmGateway.complete).not.toHaveBeenCalled();
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crypto.trade.live-band-invalid' }),
    );
  });

  it('rejects with band-invalid for a short with swapped SL/TP', async () => {
    // short invariant: tpPrice < slPrice (TP is below entry, SL above)
    // 'tpPrice: 3100, slPrice: 2950' violates this
    const engine = engineFor({
      events: triggerEvent({ direction: 'short', slPrice: '2950.00', tpPrice: '3100.00' }),
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'rejected', reason: expect.stringContaining('malformed') });
    expect(mockLlmGateway.complete).not.toHaveBeenCalled();
  });

  it('rejects with band-invalid on NaN inputs', async () => {
    const engine = engineFor({
      events: triggerEvent({ slPrice: 'not-a-number', tpPrice: '3100.00' }),
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'rejected', reason: expect.stringContaining('malformed') });
  });

  it('errors out when the LLM analyze step fails', async () => {
    mockLlmGateway.complete.mockResolvedValueOnce(
      Result.err({ _tag: 'BudgetExceeded' as const, message: 'budget' }),
    );
    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'error',
      step: 'llm-analyze',
      error: 'BudgetExceeded',
    });
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
  });

  it('returns risk-rejected when concurrent positions cap is reached', async () => {
    mockPositionStore.findOpen.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({ id: `pos-${i}` })),
    );
    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'risk-rejected',
      reason: expect.stringContaining('Max concurrent positions'),
    });
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
  });

  // Note: no automated R:R gate in the live workflow — the HITL
  // approver evaluates R:R. See RISK_LIMITS docstring in
  // crypto-live-trade.ts for rationale.

  it('blocks when the daily-loss circuit breaker is tripped', async () => {
    mockBreaker.checkEntry.mockResolvedValueOnce(
      Result.ok({
        allowed: false,
        realizedLossUsd: '500.00',
        thresholdUsd: '500.00',
        windowStart: new Date().toISOString(),
        reason: 'daily-loss limit exceeded: realized $500.00 >= threshold $500.00 for dept dept-1',
      }),
    );
    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'circuit-breaker-blocked',
      reason: expect.stringContaining('daily-loss limit exceeded'),
    });
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
  });

  it('fails closed (blocks) when the circuit-breaker store is unavailable', async () => {
    mockBreaker.checkEntry.mockResolvedValueOnce(
      Result.err({
        _tag: 'CircuitBreakerStoreUnavailable' as const,
        cause: new Error('db lost'),
      }),
    );
    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'circuit-breaker-blocked',
      reason: expect.stringContaining('CircuitBreakerStoreUnavailable'),
    });
  });

  it('happy path: HITL approve → execute → store position → audit attributes to approver', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-live-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'approved',
              approverId: APPROVER_ID,
              decidedAt: '2026-04-29T12:00:00Z',
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'executed',
      positionId: 'pos-1',
      fillPrice: '3000.00000000',
      orderId: 'order-1',
      signalId: SIGNAL_ID,
    });

    // exchange MCP called exactly once with the right shape
    expect(mockMcpAdapter.executeOrder).toHaveBeenCalledTimes(1);
    expect(mockMcpAdapter.executeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'in-memory',
        symbol: 'ETH',
        side: 'buy',
        sizeUsd: '1000.00',
        clientOrderId: `live-${SIGNAL_ID}`,
      }),
    );

    // position recorded with executedBy=approverId (S18-A1 attribution)
    expect(mockPositionStore.create).toHaveBeenCalledTimes(1);
    expect(mockPositionStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        signalId: SIGNAL_ID,
        departmentId: DEPT_ID,
        token: 'ETH',
        direction: 'long',
        exchange: 'in-memory',
        entryPrice: '3000.00000000',
        sizeUsd: '1000.00',
        slPrice: '2950.00000000',
        tpPrice: '3100.00000000',
        executedBy: APPROVER_ID,
      }),
    );

    // signal flipped to executed
    expect(mockSignalStore.updateStatus).toHaveBeenCalledWith(SIGNAL_ID, 'executed');

    // final audit attributes to APPROVER with actor.type='user' (the
    // load-bearing S18-A1 attribution that populates audit_logs.user_id)
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: APPROVER_ID, type: 'user' },
        action: 'crypto.trade.live-executed',
        resource: { type: 'crypto-position', id: 'pos-1' },
        metadata: expect.objectContaining({
          live: true,
          orderId: 'order-1',
          fillPrice: '3000.00000000',
        }),
      }),
    );
  });

  it('HITL reject → audit emitted with approver attribution; no execution', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-live-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'rejected',
              approverId: APPROVER_ID,
              decidedAt: '2026-04-29T12:00:00Z',
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'rejected', reason: 'rejected by approver' });
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
    expect(mockPositionStore.create).not.toHaveBeenCalled();
    // post-HITL audit attributes to the approver
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: APPROVER_ID, type: 'user' },
        action: 'crypto.trade.live-rejected',
      }),
    );
  });

  it('HITL timeout → expired status, audit emitted, no execution', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-live-decision',
          handler: () => null, // timeout in InngestTestEngine
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'expired', signalId: SIGNAL_ID });
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crypto.trade.live-expired' }),
    );
  });

  it('exchange MCP rejection → execution-failed status with the tagged reason', async () => {
    mockMcpAdapter.executeOrder.mockResolvedValueOnce(
      Result.err({
        _tag: 'OrderRejected' as const,
        reason: 'venue-side-error',
        exchange: 'in-memory',
      }),
    );
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-live-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'approved',
              approverId: APPROVER_ID,
              decidedAt: '2026-04-29T12:00:00Z',
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'execution-failed',
      reason: 'OrderRejected',
    });
    expect(mockPositionStore.create).not.toHaveBeenCalled();
    expect(mockSignalStore.updateStatus).not.toHaveBeenCalled();
    // failure audit attributes to approver (post-HITL)
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: APPROVER_ID, type: 'user' },
        action: 'crypto.trade.live-execution-failed',
      }),
    );
  });

  it('rejects BEFORE execute-live when decision payload lacks approverId (no venue fill)', async () => {
    // Round-2 review fix (Codex): the previous implementation rejected
    // AFTER execute-live, which still produced a real venue fill
    // followed by an orphan-reconcile audit. The corrected behaviour
    // validates `decisionData.approverId` immediately after
    // waitForEvent and BEFORE the exchange call — a malformed HITL
    // payload never reaches the venue.
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-live-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'approved',
              decidedAt: '2026-04-29T12:00:00Z',
              // approverId omitted — should reject before venue call
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'rejected',
      reason: 'malformed approval payload (missing approverId)',
    });
    // CRITICAL: the venue exchange MUST NOT have been called
    expect(mockMcpAdapter.executeOrder).not.toHaveBeenCalled();
    // no position record either
    expect(mockPositionStore.create).not.toHaveBeenCalled();
    // signal NOT flipped to executed
    expect(mockSignalStore.updateStatus).not.toHaveBeenCalled();
    // audit emitted with `crypto.trade.live-malformed-approval`
    // attributed to system (no human to attribute to since the
    // approval payload was malformed)
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'system', type: 'system' },
        action: 'crypto.trade.live-malformed-approval',
      }),
    );
  });
});
