/**
 * P1.5-02: env-gated LLM provider initialization tests
 * @task P1.5-02
 *
 * verifies that the composition root correctly wires LLM providers
 * based on the presence of API key environment variables, and uses
 * real drizzle-backed budget/usage stores.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock dependencies — must be declared before vi.mock calls
// ---------------------------------------------------------------------------

const mockBudgetStore = {
  getConfig: vi.fn().mockResolvedValue(null),
  getDailySpend: vi.fn().mockResolvedValue(0),
  getMonthlySpend: vi.fn().mockResolvedValue(0),
};

const mockUsageLogStore = {
  insert: vi.fn().mockResolvedValue(undefined),
};

const mockCreateDrizzleBudgetStore = vi.fn().mockReturnValue(mockBudgetStore);
const mockCreateDrizzleUsageLogStore = vi.fn().mockReturnValue(mockUsageLogStore);

vi.mock('@aptivo/database/adapters', () => ({
  createDrizzleAuditStore: vi.fn(),
  createDrizzleDlqStore: vi.fn(),
  createDrizzlePreferenceStore: vi.fn(),
  createDrizzleDeliveryLogStore: vi.fn(),
  createDrizzleTemplateStore: vi.fn(),
  createDrizzleTradeSignalStore: vi.fn(),
  createDrizzleTradeExecutionStore: vi.fn(),
  createDrizzleCandidateStore: vi.fn(),
  createDrizzleApplicationStore: vi.fn(),
  createDrizzleInterviewStore: vi.fn(),
  createDrizzleSecurityReportStore: vi.fn(),
  createDrizzleContractStore: vi.fn(),
  createDrizzlePositionStore: vi.fn(),
  createMetricQueries: vi.fn(),
  createDrizzleAdminStore: vi.fn(),
  createDrizzleLlmUsageStore: vi.fn(),
  createDrizzleHitlRequestStore: vi.fn(),
  createDrizzleHitlDecisionStore: vi.fn(),
  createDrizzleBudgetStore: mockCreateDrizzleBudgetStore,
  createDrizzleUsageLogStore: mockCreateDrizzleUsageLogStore,
  createDrizzleMcpRegistryAdapter: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
  getDb: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/audit', () => ({
  createAuditService: vi.fn().mockReturnValue({}),
  DEFAULT_MASKING_CONFIG: {},
}));

vi.mock('@aptivo/audit/async', () => ({
  createProcessAuditEvent: vi.fn().mockReturnValue({}),
  createReplayDlqEvents: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/notifications', () => ({
  createNotificationService: vi.fn().mockReturnValue({}),
  NovuNotificationAdapter: vi.fn().mockImplementation(() => ({})),
  createTemplateRegistry: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/file-storage', () => ({
  InMemoryStorageAdapter: vi.fn().mockImplementation(() => ({})),
  createS3StorageAdapter: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/mcp-layer', () => ({
  createMcpWrapper: vi.fn().mockReturnValue({}),
  McpRateLimiter: vi.fn().mockImplementation(() => ({})),
  InMemoryRateLimitStore: vi.fn().mockImplementation(() => ({})),
  CircuitBreakerRegistry: vi.fn().mockImplementation(() => ({})),
  InMemoryTransportAdapter: vi.fn().mockImplementation(() => ({})),
  InMemoryCacheStore: vi.fn().mockImplementation(() => ({})),
  createAgentKitTransportAdapter: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/mcp-layer/workflows', () => ({
  createDataDeletionHandler: vi.fn().mockReturnValue({}),
}));

vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: vi.fn(),
  recordDecision: vi.fn(),
}));

vi.mock('../src/lib/observability/metric-service', () => ({
  createMetricService: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('LLM provider env-gated initialization', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockCreateDrizzleBudgetStore.mockClear();
    mockCreateDrizzleUsageLogStore.mockClear();
    // clear all llm-related env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates gateway with empty providers when no keys are set', async () => {
    // neither key is set — graceful degradation
    const { getLlmGateway } = await import('../src/lib/services.js');
    const gateway = getLlmGateway();

    expect(gateway).toBeDefined();
    expect(typeof gateway.complete).toBe('function');
  });

  it('registers openai provider when OPENAI_API_KEY is set and sdk is installed', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai-key';

    // sdk is installed — provider should be registered without warning
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getLlmGateway } = await import('../src/lib/services.js');
    const gateway = getLlmGateway();

    expect(gateway).toBeDefined();
    expect(typeof gateway.complete).toBe('function');
    // no warning — sdk found and loaded
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('openai sdk not installed'),
    );
    warnSpy.mockRestore();
  });

  it('registers anthropic provider when ANTHROPIC_API_KEY is set and sdk is installed', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getLlmGateway } = await import('../src/lib/services.js');
    const gateway = getLlmGateway();

    expect(gateway).toBeDefined();
    expect(typeof gateway.complete).toBe('function');
    // no warning — sdk found and loaded
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('anthropic sdk not installed'),
    );
    warnSpy.mockRestore();
  });

  it('registers both providers when both keys are set and sdks are installed', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getLlmGateway } = await import('../src/lib/services.js');
    const gateway = getLlmGateway();

    expect(gateway).toBeDefined();
    expect(typeof gateway.complete).toBe('function');
    // no sdk-not-installed warnings
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('sdk not installed'),
    );
    warnSpy.mockRestore();
  });

  it('uses real drizzle budget store instead of stub', async () => {
    const { getLlmGateway } = await import('../src/lib/services.js');
    getLlmGateway();

    // verify the real budget store factory was called
    expect(mockCreateDrizzleBudgetStore).toHaveBeenCalled();
  });

  it('uses real drizzle usage log store instead of stub', async () => {
    const { getLlmGateway } = await import('../src/lib/services.js');
    getLlmGateway();

    // verify the real usage log store factory was called
    expect(mockCreateDrizzleUsageLogStore).toHaveBeenCalled();
  });
});
