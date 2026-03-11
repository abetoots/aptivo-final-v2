/**
 * S7-CRY-01: crypto security detection workflow tests
 * @task S7-CRY-01
 *
 * verifies the 4-step security scan pipeline using @inngest/test
 * for deterministic step execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock services — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockSecurityReportStore = {
  findRecent: vi.fn(),
  findByToken: vi.fn(),
  create: vi.fn(),
};

const mockMcpWrapper = {
  executeTool: vi.fn(),
};

const mockAuditService = {
  emit: vi.fn(),
};

// ---------------------------------------------------------------------------
// mock modules
// ---------------------------------------------------------------------------

vi.mock('../src/lib/services', () => ({
  getSecurityReportStore: () => mockSecurityReportStore,
  getMcpWrapper: () => mockMcpWrapper,
  getAuditService: () => mockAuditService,
}));

// ---------------------------------------------------------------------------
// import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { securityScanFn } from '../src/lib/workflows/crypto-security-scan.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any, opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: fn, ...opts });

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'crypto/security.scan.requested' as const,
      data: {
        tokenAddress: '0xdead1234',
        chain: 'ethereum',
        requestedBy: 'user-1',
        domain: 'crypto' as const,
        ...overrides,
      },
    },
  ] as [any];

// cached report fixture
const cachedReport = {
  id: 'report-cached-1',
  tokenAddress: '0xdead1234',
  chain: 'ethereum',
  liquidityUsd: '50000',
  isHoneypot: false,
  isMintable: false,
  ownershipRenounced: true,
  riskScore: 0,
  reasons: [],
  status: 'safe',
  scannedAt: new Date(),
};

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // default: no cached report
  mockSecurityReportStore.findRecent.mockResolvedValue(null);
  mockSecurityReportStore.create.mockResolvedValue({ id: 'report-1' });

  // default: MCP liquidity check succeeds
  mockMcpWrapper.executeTool.mockImplementation(
    async (_serverId: string, toolName: string, _input: Record<string, unknown>) => {
      if (toolName === 'check-liquidity') {
        return Result.ok({
          content: { liquidityUsd: 50_000 },
          isError: false,
          durationMs: 120,
        });
      }
      if (toolName === 'scan-contract') {
        return Result.ok({
          content: {
            isHoneypot: false,
            isMintable: false,
            ownershipRenounced: true,
          },
          isError: false,
          durationMs: 200,
        });
      }
      return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
    },
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

describe('S7-CRY-01: Crypto Security Scan Workflow', () => {
  // -----------------------------------------------------------------------
  // 1. cached report — returns early, skips MCP calls
  // -----------------------------------------------------------------------
  describe('cache hit', () => {
    it('returns cached report when findRecent returns a result', async () => {
      mockSecurityReportStore.findRecent.mockResolvedValue(cachedReport);

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'cached',
        report: {
          tokenAddress: '0xdead1234',
          chain: 'ethereum',
          riskScore: 0,
          riskStatus: 'safe',
        },
      });

      // mcp calls should not have been made
      expect(mockMcpWrapper.executeTool).not.toHaveBeenCalled();

      // no new report stored
      expect(mockSecurityReportStore.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. full pipeline — no cache, all steps run
  // -----------------------------------------------------------------------
  describe('full pipeline', () => {
    it('runs all steps: cache miss -> liquidity -> contract -> risk scoring', async () => {
      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result).toMatchObject({
        status: 'scanned',
        report: {
          tokenAddress: '0xdead1234',
          chain: 'ethereum',
          liquidityUsd: 50_000,
          isHoneypot: false,
          isMintable: false,
          ownershipRenounced: true,
          riskScore: 0,
          riskStatus: 'safe',
        },
      });

      // verify MCP was called for both tools
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledTimes(2);
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'crypto-scanner',
        'check-liquidity',
        { tokenAddress: '0xdead1234', chain: 'ethereum' },
      );
      expect(mockMcpWrapper.executeTool).toHaveBeenCalledWith(
        'crypto-scanner',
        'scan-contract',
        { tokenAddress: '0xdead1234', chain: 'ethereum' },
      );

      // verify report stored
      expect(mockSecurityReportStore.create).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 3. honeypot token -> dangerous
  // -----------------------------------------------------------------------
  describe('honeypot detection', () => {
    it('scores >= 60 and status dangerous for honeypot token', async () => {
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'check-liquidity') {
            return Result.ok({
              content: { liquidityUsd: 500 },
              isError: false,
              durationMs: 100,
            });
          }
          if (toolName === 'scan-contract') {
            return Result.ok({
              content: {
                isHoneypot: true,
                isMintable: true,
                ownershipRenounced: false,
              },
              isError: false,
              durationMs: 150,
            });
          }
          return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      // 40 (honeypot) + 25 (mintable) + 15 (!renounced) + 20 (low liq) = 100
      expect(result.status).toBe('scanned');
      expect(result.report.riskScore).toBe(100);
      expect(result.report.riskStatus).toBe('dangerous');
      expect(result.report.isHoneypot).toBe(true);
      expect(result.report.isMintable).toBe(true);
      expect(result.report.ownershipRenounced).toBe(false);
      expect(result.report.reasons).toContain('honeypot detected');
      expect(result.report.reasons).toContain('mintable token');
    });
  });

  // -----------------------------------------------------------------------
  // 4. safe token — good liquidity, no flags
  // -----------------------------------------------------------------------
  describe('safe token', () => {
    it('scores 0 and status safe for clean token with good liquidity', async () => {
      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result.status).toBe('scanned');
      expect(result.report.riskScore).toBe(0);
      expect(result.report.riskStatus).toBe('safe');
      expect(result.report.isHoneypot).toBe(false);
      expect(result.report.isMintable).toBe(false);
      expect(result.report.ownershipRenounced).toBe(true);
      expect(result.report.liquidityUsd).toBe(50_000);
      expect(result.report.reasons).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 5. MCP liquidity failure — defaults to 0, adds +20
  // -----------------------------------------------------------------------
  describe('MCP liquidity failure', () => {
    it('defaults to liquidityUsd=0 and adds +20 risk when MCP fails', async () => {
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'check-liquidity') {
            return Result.err({
              _tag: 'TransportError' as const,
              tool: 'check-liquidity',
              message: 'Connection refused',
            });
          }
          if (toolName === 'scan-contract') {
            return Result.ok({
              content: {
                isHoneypot: false,
                isMintable: false,
                ownershipRenounced: true,
              },
              isError: false,
              durationMs: 150,
            });
          }
          return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result.status).toBe('scanned');
      // only +20 from low liquidity (default 0 < 50000)
      expect(result.report.liquidityUsd).toBe(0);
      expect(result.report.riskScore).toBe(20);
      expect(result.report.riskStatus).toBe('safe');
      expect(result.report.reasons).toContain('low liquidity ($0)');
    });
  });

  // -----------------------------------------------------------------------
  // 6. MCP contract scan failure — worst-case flags
  // -----------------------------------------------------------------------
  describe('MCP contract scan failure', () => {
    it('uses worst-case flags when contract scan MCP call fails', async () => {
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'check-liquidity') {
            return Result.ok({
              content: { liquidityUsd: 50_000 },
              isError: false,
              durationMs: 100,
            });
          }
          if (toolName === 'scan-contract') {
            return Result.err({
              _tag: 'TransportError' as const,
              tool: 'scan-contract',
              message: 'Timeout',
            });
          }
          return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result.status).toBe('scanned');
      // 40 (honeypot) + 25 (mintable) + 15 (!renounced) = 80
      expect(result.report.isHoneypot).toBe(true);
      expect(result.report.isMintable).toBe(true);
      expect(result.report.ownershipRenounced).toBe(false);
      expect(result.report.riskScore).toBe(80);
      expect(result.report.riskStatus).toBe('dangerous');
    });
  });

  // -----------------------------------------------------------------------
  // 7. audit event recorded with correct action
  // -----------------------------------------------------------------------
  describe('audit trail', () => {
    it('records audit event with action crypto.security.scanned', async () => {
      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      await engine.execute();

      expect(mockAuditService.emit).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditService.emit.mock.calls[0]![0];

      expect(auditCall).toMatchObject({
        actor: { id: 'user-1', type: 'user' },
        action: 'crypto.security.scanned',
        resource: { type: 'security-report', id: '0xdead1234' },
        domain: 'crypto',
        metadata: expect.objectContaining({
          chain: 'ethereum',
          riskScore: 0,
          riskStatus: 'safe',
        }),
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8. report stored with all fields
  // -----------------------------------------------------------------------
  describe('report storage', () => {
    it('stores report with all required fields', async () => {
      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      await engine.execute();

      expect(mockSecurityReportStore.create).toHaveBeenCalledTimes(1);
      const createCall = mockSecurityReportStore.create.mock.calls[0]![0];

      expect(createCall).toMatchObject({
        tokenAddress: '0xdead1234',
        chain: 'ethereum',
        liquidityUsd: '50000',
        isHoneypot: false,
        isMintable: false,
        ownershipRenounced: true,
        riskScore: 0,
        reasons: [],
        status: 'safe',
      });
    });

    it('stores honeypot report with all risk reasons', async () => {
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'check-liquidity') {
            return Result.ok({
              content: { liquidityUsd: 100 },
              isError: false,
              durationMs: 100,
            });
          }
          if (toolName === 'scan-contract') {
            return Result.ok({
              content: {
                isHoneypot: true,
                isMintable: true,
                ownershipRenounced: false,
              },
              isError: false,
              durationMs: 150,
            });
          }
          return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      await engine.execute();

      const createCall = mockSecurityReportStore.create.mock.calls[0]![0];

      expect(createCall.riskScore).toBe(100);
      expect(createCall.status).toBe('dangerous');
      expect(createCall.reasons).toEqual(
        expect.arrayContaining([
          'honeypot detected',
          'mintable token',
          'ownership not renounced',
          expect.stringContaining('low liquidity'),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 9. warning status for moderate risk
  // -----------------------------------------------------------------------
  describe('warning risk level', () => {
    it('returns warning status for risk score between 30 and 59', async () => {
      // mintable (25) + !renounced (15) = 40 -> warning
      mockMcpWrapper.executeTool.mockImplementation(
        async (_serverId: string, toolName: string) => {
          if (toolName === 'check-liquidity') {
            return Result.ok({
              content: { liquidityUsd: 50_000 },
              isError: false,
              durationMs: 100,
            });
          }
          if (toolName === 'scan-contract') {
            return Result.ok({
              content: {
                isHoneypot: false,
                isMintable: true,
                ownershipRenounced: false,
              },
              isError: false,
              durationMs: 150,
            });
          }
          return Result.err({ _tag: 'ToolNotFound' as const, tool: toolName, server: _serverId });
        },
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result.status).toBe('scanned');
      expect(result.report.riskScore).toBe(40);
      expect(result.report.riskStatus).toBe('warning');
    });
  });

  // -----------------------------------------------------------------------
  // 10. both MCP calls fail — worst case everything
  // -----------------------------------------------------------------------
  describe('both MCP calls fail', () => {
    it('applies worst-case defaults for all values', async () => {
      mockMcpWrapper.executeTool.mockResolvedValue(
        Result.err({
          _tag: 'TransportError' as const,
          tool: 'any',
          message: 'All services down',
        }),
      );

      const engine = engineFor(securityScanFn, {
        events: triggerEvent(),
      });

      const { result } = await engine.execute();

      expect(result.status).toBe('scanned');
      // 40 + 25 + 15 + 20 = 100
      expect(result.report.riskScore).toBe(100);
      expect(result.report.riskStatus).toBe('dangerous');
      expect(result.report.liquidityUsd).toBe(0);
      expect(result.report.isHoneypot).toBe(true);
      expect(result.report.isMintable).toBe(true);
      expect(result.report.ownershipRenounced).toBe(false);
    });
  });
});
