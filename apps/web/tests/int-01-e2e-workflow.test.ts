/**
 * INT-01: E2E demo workflow tests
 * @task INT-01
 *
 * verifies the 6-subsystem demo workflow using @inngest/test
 * for deterministic step execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — must be declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockLlmGateway = {
  complete: vi.fn(),
};

const mockMcpWrapper = {
  executeTool: vi.fn(),
};

const mockAuditService = {
  emit: vi.fn(),
};

const mockNotificationService = {
  send: vi.fn(),
  upsertSubscriber: vi.fn(),
  setOptOut: vi.fn(),
};

const mockStorageAdapter = {
  createPresignedUpload: vi.fn(),
  createPresignedDownload: vi.fn(),
  deleteObject: vi.fn(),
  getMetadata: vi.fn(),
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

const mockCreateRequest = vi.fn();

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getLlmGateway: () => mockLlmGateway,
  getMcpWrapper: () => mockMcpWrapper,
  getAuditService: () => mockAuditService,
  getNotificationService: () => mockNotificationService,
  getStorageAdapter: () => mockStorageAdapter,
  getHitlRequestDeps: () => mockHitlRequestDeps,
}));

vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: (...args: unknown[]) => mockCreateRequest(...args),
}));

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { demoWorkflowFn } from '../src/lib/workflows/demo-workflow.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'demo/workflow.triggered' as const,
      data: {
        input: 'Analyze this quarterly report for risks',
        mcpServerId: 'server-01',
        mcpToolName: 'risk-scanner',
        requestedBy: 'user-123',
        ...overrides,
      },
    },
  ] as [any];

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // default: createRequest succeeds — overridden per test when needed
  mockCreateRequest.mockResolvedValue(
    Result.ok({
      requestId: 'hitl-req-1',
      tokenHash: 'hash-1',
      token: 'jwt-token-1',
      tokenExpiresAt: new Date(),
      approveUrl: 'http://localhost:3000/hitl/hitl-req-1?action=approve&token=jwt-token-1',
      rejectUrl: 'http://localhost:3000/hitl/hitl-req-1?action=reject&token=jwt-token-1',
    }),
  );
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('INT-01: E2E Demo Workflow', () => {
  // -------------------------------------------------------------------------
  // 1. full flow with all steps succeeding
  // -------------------------------------------------------------------------
  describe('full happy path', () => {
    it('executes all 6 subsystems and returns completed result', async () => {
      // arrange: all services return success
      mockLlmGateway.complete.mockResolvedValue(
        Result.ok({
          completion: {
            id: 'llm-resp-1',
            content: 'Risk analysis: 3 items identified',
            finishReason: 'stop',
            usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
          },
          costUsd: 0.002,
          provider: 'openai',
          wasFallback: false,
          latencyMs: 150,
        }),
      );

      mockNotificationService.send.mockResolvedValue(
        Result.ok({ deliveryId: 'notif-1' }),
      );

      mockMcpWrapper.executeTool.mockResolvedValue(
        Result.ok({
          content: { scanned: true, risks: ['budget', 'timeline'] },
          isError: false,
          durationMs: 200,
        }),
      );

      mockStorageAdapter.createPresignedUpload.mockResolvedValue(
        Result.ok({
          fileId: 'file-001',
          uploadUrl: 'https://s3.example.com/upload',
          key: 'demo-result.json',
          expiresAt: '2026-04-01T00:00:00Z',
        }),
      );

      mockAuditService.emit.mockResolvedValue(
        Result.ok({
          id: 'audit-001',
          previousHash: null,
          currentHash: 'abc123',
          sequence: 1,
          timestamp: new Date(),
        }),
      );

      const engine = engineFor(demoWorkflowFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'will-be-matched',
                decision: 'approved',
                approverId: 'approver-1',
                decidedAt: '2026-03-11T10:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'completed',
        llmOutput: 'Risk analysis: 3 items identified',
        mcpResult: { scanned: true, risks: ['budget', 'timeline'] },
        fileId: 'file-001',
        auditId: 'audit-001',
      });

      // verify each subsystem was called
      expect(mockLlmGateway.complete).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledTimes(1);
      expect(mockStorageAdapter.createPresignedUpload).toHaveBeenCalledTimes(1);
      // audit emit: once for the final audit-trail step
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. LLM failure → audit recorded, workflow returns error result
  // -------------------------------------------------------------------------
  describe('LLM failure', () => {
    it('returns error result and records audit when LLM gateway fails', async () => {
      mockLlmGateway.complete.mockResolvedValue(
        Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
      );

      mockAuditService.emit.mockResolvedValue(
        Result.ok({
          id: 'audit-fail-1',
          previousHash: null,
          currentHash: 'def456',
          sequence: 1,
          timestamp: new Date(),
        }),
      );

      const engine = engineFor(demoWorkflowFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'llm-analyze',
        error: 'ServiceUnavailable',
      });

      // mcp, storage should NOT be called
      expect(mockMcpWrapper.executeTool).not.toHaveBeenCalled();
      expect(mockStorageAdapter.createPresignedUpload).not.toHaveBeenCalled();

      // audit was recorded for the failure
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. HITL rejection → skips MCP step, returns rejection result
  // -------------------------------------------------------------------------
  describe('HITL rejection', () => {
    it('returns rejection result and skips MCP when decision is rejected', async () => {
      // llm succeeds
      mockLlmGateway.complete.mockResolvedValue(
        Result.ok({
          completion: {
            id: 'llm-resp-2',
            content: 'Analysis complete',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
          costUsd: 0.001,
          provider: 'openai',
          wasFallback: false,
          latencyMs: 100,
        }),
      );

      // notification succeeds
      mockNotificationService.send.mockResolvedValue(
        Result.ok({ deliveryId: 'notif-2' }),
      );

      const engine = engineFor(demoWorkflowFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'req-rejected',
                decision: 'rejected',
                reason: 'Budget exceeded',
                approverId: 'approver-2',
                decidedAt: '2026-03-11T11:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'rejected',
        reason: 'Budget exceeded',
      });

      // mcp and storage should NOT be called after rejection
      expect(mockMcpWrapper.executeTool).not.toHaveBeenCalled();
      expect(mockStorageAdapter.createPresignedUpload).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. MCP tool failure → file not stored, audit records failure
  // -------------------------------------------------------------------------
  describe('MCP tool failure', () => {
    it('returns error result when MCP tool fails', async () => {
      // llm succeeds
      mockLlmGateway.complete.mockResolvedValue(
        Result.ok({
          completion: {
            id: 'llm-resp-3',
            content: 'Analysis done',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
          costUsd: 0.001,
          provider: 'openai',
          wasFallback: false,
          latencyMs: 100,
        }),
      );

      // notification succeeds
      mockNotificationService.send.mockResolvedValue(
        Result.ok({ deliveryId: 'notif-3' }),
      );

      // mcp fails
      mockMcpWrapper.executeTool.mockResolvedValue(
        Result.err({ _tag: 'TransportError', tool: 'risk-scanner', message: 'Connection refused' }),
      );

      // audit succeeds
      mockAuditService.emit.mockResolvedValue(
        Result.ok({
          id: 'audit-mcp-fail',
          previousHash: null,
          currentHash: 'ghi789',
          sequence: 1,
          timestamp: new Date(),
        }),
      );

      const engine = engineFor(demoWorkflowFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-decision',
            handler: () => ({
              name: 'hitl/decision.recorded',
              data: {
                requestId: 'req-approved',
                decision: 'approved',
                approverId: 'approver-3',
                decidedAt: '2026-03-11T12:00:00Z',
              },
            }),
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'error',
        step: 'mcp-action',
        error: 'TransportError',
      });

      // storage should NOT be called when mcp fails
      expect(mockStorageAdapter.createPresignedUpload).not.toHaveBeenCalled();

      // audit was recorded for the mcp failure
      expect(mockAuditService.emit).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. HITL timeout → returns expired result
  // -------------------------------------------------------------------------
  describe('HITL timeout', () => {
    it('returns expired result when no decision arrives within timeout', async () => {
      // llm succeeds
      mockLlmGateway.complete.mockResolvedValue(
        Result.ok({
          completion: {
            id: 'llm-resp-4',
            content: 'Analysis done',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
          costUsd: 0.001,
          provider: 'openai',
          wasFallback: false,
          latencyMs: 100,
        }),
      );

      // notification succeeds
      mockNotificationService.send.mockResolvedValue(
        Result.ok({ deliveryId: 'notif-4' }),
      );

      const engine = engineFor(demoWorkflowFn, {
        events: triggerEvent(),
        steps: [
          {
            id: 'wait-for-decision',
            handler: () => null, // simulates timeout
          },
        ],
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'expired',
      });
      expect(result.requestId).toBeDefined();

      // mcp and storage not called on timeout
      expect(mockMcpWrapper.executeTool).not.toHaveBeenCalled();
      expect(mockStorageAdapter.createPresignedUpload).not.toHaveBeenCalled();
    });
  });
});
