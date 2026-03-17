/**
 * S12-LLM2-04: Multi-Provider Routing
 * @task LLM2-04
 *
 * verifies provider router with three routing strategies, health tracker
 * integration, gateway router wiring, and backward compat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import {
  createProviderRouter,
  createHealthTracker,
} from '@aptivo/llm-gateway/routing';
import type {
  RoutingStrategy,
  ProviderRouterDeps,
  ProviderHealth,
  HealthTrackerDeps,
} from '@aptivo/llm-gateway/routing';
import { createLlmGateway } from '@aptivo/llm-gateway';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  LLMError,
} from '@aptivo/llm-gateway';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockProvider(id: string, result?: Result<CompletionResponse, LLMError>): LLMProvider {
  const defaultResponse: CompletionResponse = {
    id: `resp-${id}`,
    content: `hello from ${id}`,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
  return {
    id,
    name: id,
    supportsStreaming: false,
    complete: vi.fn(async () => result ?? Result.ok(defaultResponse)),
    stream: vi.fn(async function* () {}),
    estimateCost: vi.fn(() => 0.001),
    isAvailable: vi.fn(async () => true),
  };
}

function makeRequest(model = 'gpt-4o'): CompletionRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'test' }],
    domain: 'core',
  };
}

// minimal budget service stub
function stubBudgetService() {
  return {
    checkBudget: vi.fn(async () => Result.ok({ warningTriggered: false, remainingUsd: 100 })),
    enforcePreRequest: vi.fn(async () => Result.ok({ warningTriggered: false, remainingUsd: 100 })),
  };
}

// minimal usage logger stub
function stubUsageLogger() {
  return {
    logUsage: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// routing strategies
// ---------------------------------------------------------------------------

describe('LLM2-04: ProviderRouter — failover_only', () => {
  it('returns primary with fallbacks in original order', () => {
    const providers = new Map<string, unknown>([
      ['openai', { id: 'openai' }],
      ['anthropic', { id: 'anthropic' }],
      ['mistral', { id: 'mistral' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'openai' },
    });

    const result = router.selectProvider('gpt-4o', 'failover_only');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.primary.id).toBe('openai');
    expect(result.value.fallbacks).toHaveLength(2);
    expect(result.value.fallbacks[0]!.id).toBe('anthropic');
    expect(result.value.fallbacks[1]!.id).toBe('mistral');
    expect(result.value.reason).toContain('failover');
    expect(result.value.reason).toContain('openai');
  });

  it('single provider yields empty fallbacks', () => {
    const providers = new Map<string, unknown>([['openai', { id: 'openai' }]]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'openai' },
    });

    const result = router.selectProvider('gpt-4o', 'failover_only');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.primary.id).toBe('openai');
    expect(result.value.fallbacks).toHaveLength(0);
  });
});

describe('LLM2-04: ProviderRouter — lowest_cost', () => {
  it('sorts providers by cost, cheapest first', () => {
    const providers = new Map<string, unknown>([
      ['expensive', { id: 'expensive' }],
      ['cheap', { id: 'cheap' }],
      ['mid', { id: 'mid' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'expensive' },
      getCost: (providerId: string) => {
        const costs: Record<string, number> = { expensive: 10, mid: 5, cheap: 1 };
        return costs[providerId] ?? 999;
      },
    });

    const result = router.selectProvider('gpt-4o', 'lowest_cost');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.primary.id).toBe('cheap');
    expect(result.value.fallbacks[0]!.id).toBe('mid');
    expect(result.value.fallbacks[1]!.id).toBe('expensive');
    expect(result.value.reason).toContain('lowest_cost');
    expect(result.value.reason).toContain('cheap');
  });

  it('falls back to insertion order when no getCost provided', () => {
    const providers = new Map<string, unknown>([
      ['alpha', { id: 'alpha' }],
      ['beta', { id: 'beta' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'model-x': 'alpha' },
      // no getCost — all get 999, so original order preserved
    });

    const result = router.selectProvider('model-x', 'lowest_cost');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // both have same cost (999), so order is preserved from candidates
    expect(result.value.primary.id).toBe('alpha');
  });
});

describe('LLM2-04: ProviderRouter — latency_optimized', () => {
  it('healthy providers come before unhealthy', () => {
    const providers = new Map<string, unknown>([
      ['unhealthy-provider', { id: 'unhealthy-provider' }],
      ['healthy-provider', { id: 'healthy-provider' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'unhealthy-provider' },
      getHealth: (id: string): ProviderHealth => {
        if (id === 'unhealthy-provider') return { healthy: false, latencyP50Ms: 50, errorRate: 0.5 };
        return { healthy: true, latencyP50Ms: 200, errorRate: 0 };
      },
    });

    const result = router.selectProvider('gpt-4o', 'latency_optimized');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // healthy-provider should be primary despite higher latency
    expect(result.value.primary.id).toBe('healthy-provider');
    expect(result.value.reason).toContain('latency_optimized');
  });

  it('sorts by latency among healthy providers', () => {
    const providers = new Map<string, unknown>([
      ['slow', { id: 'slow' }],
      ['fast', { id: 'fast' }],
      ['medium', { id: 'medium' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'slow' },
      getHealth: (id: string): ProviderHealth => {
        const latencies: Record<string, number> = { slow: 500, medium: 200, fast: 50 };
        return { healthy: true, latencyP50Ms: latencies[id] ?? 100, errorRate: 0 };
      },
    });

    const result = router.selectProvider('gpt-4o', 'latency_optimized');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.primary.id).toBe('fast');
    expect(result.value.fallbacks[0]!.id).toBe('medium');
    expect(result.value.fallbacks[1]!.id).toBe('slow');
  });

  it('uses default health tracker when no getHealth provided', () => {
    const providers = new Map<string, unknown>([
      ['a', { id: 'a' }],
      ['b', { id: 'b' }],
    ]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'a' },
      // no getHealth — default tracker assumes all healthy
    });

    const result = router.selectProvider('gpt-4o', 'latency_optimized');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // all healthy with same latency, so order is preserved
    expect(result.value.primary.id).toBe('a');
  });
});

describe('LLM2-04: ProviderRouter — error cases', () => {
  it('returns NoProviderAvailable when model has no mapping', () => {
    const providers = new Map<string, unknown>([['openai', { id: 'openai' }]]);
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'openai' },
    });

    const result = router.selectProvider('unknown-model', 'failover_only');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error._tag).toBe('NoProviderAvailable');
    expect(result.error.model).toBe('unknown-model');
  });

  it('returns NoProviderAvailable when provider map is empty', () => {
    const providers = new Map<string, unknown>();
    const router = createProviderRouter({
      providers,
      modelToProvider: { 'gpt-4o': 'openai' },
    });

    const result = router.selectProvider('gpt-4o', 'failover_only');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error._tag).toBe('NoProviderAvailable');
  });
});

// ---------------------------------------------------------------------------
// health tracker
// ---------------------------------------------------------------------------

describe('LLM2-04: HealthTracker', () => {
  it('returns healthy when no circuit breaker info', () => {
    const tracker = createHealthTracker();
    const health = tracker.getHealth('any-provider');
    expect(health.healthy).toBe(true);
    expect(health.latencyP50Ms).toBe(100);
    expect(health.errorRate).toBe(0);
  });

  it('returns healthy when circuit breaker is closed', () => {
    const tracker = createHealthTracker({
      getCircuitBreakerState: () => ({ state: 'closed', failureCount: 0 }),
    });
    const health = tracker.getHealth('openai');
    expect(health.healthy).toBe(true);
    expect(health.latencyP50Ms).toBe(100);
    expect(health.errorRate).toBe(0);
  });

  it('returns unhealthy when circuit breaker is open', () => {
    const tracker = createHealthTracker({
      getCircuitBreakerState: () => ({ state: 'open', failureCount: 10 }),
    });
    const health = tracker.getHealth('openai');
    expect(health.healthy).toBe(false);
    expect(health.latencyP50Ms).toBe(5000);
    expect(health.errorRate).toBeGreaterThan(0);
  });

  it('returns unhealthy when circuit breaker is half-open', () => {
    const tracker = createHealthTracker({
      getCircuitBreakerState: () => ({ state: 'half-open', failureCount: 3 }),
    });
    const health = tracker.getHealth('any-provider');
    expect(health.healthy).toBe(false);
    expect(health.latencyP50Ms).toBe(5000);
  });

  it('error rate derived from failure count', () => {
    const tracker = createHealthTracker({
      getCircuitBreakerState: () => ({ state: 'closed', failureCount: 25 }),
    });
    const health = tracker.getHealth('openai');
    expect(health.healthy).toBe(true);
    expect(health.errorRate).toBe(0.25); // 25 / 100
  });
});

// ---------------------------------------------------------------------------
// gateway integration — with router
// ---------------------------------------------------------------------------

describe('LLM2-04: Gateway integration — with router', () => {
  it('uses router.selectProvider when router is set', async () => {
    const openai = mockProvider('openai');
    const anthropic = mockProvider('anthropic');
    const providers = new Map<string, LLMProvider>([
      ['openai', openai],
      ['anthropic', anthropic],
    ]);
    const modelToProvider = { 'gpt-4o': 'openai' };

    const router = createProviderRouter({
      providers,
      modelToProvider,
    });

    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider,
      router,
    });

    const result = await gateway.complete(makeRequest('gpt-4o'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.provider).toBe('openai');
    expect(openai.complete).toHaveBeenCalled();
  });

  it('falls back through router fallbacks on retryable error', async () => {
    const failProvider = mockProvider(
      'openai',
      Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
    );
    const successProvider = mockProvider('anthropic');
    const providers = new Map<string, LLMProvider>([
      ['openai', failProvider],
      ['anthropic', successProvider],
    ]);
    const modelToProvider = { 'gpt-4o': 'openai' };

    const router = createProviderRouter({
      providers,
      modelToProvider,
    });

    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider,
      router,
    });

    const result = await gateway.complete(makeRequest('gpt-4o'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.provider).toBe('anthropic');
    expect(result.value.wasFallback).toBe(true);
    expect(failProvider.complete).toHaveBeenCalledTimes(1);
    expect(successProvider.complete).toHaveBeenCalledTimes(1);
  });

  it('passes routingStrategy from options to router', async () => {
    const cheapProvider = mockProvider('cheap');
    const expensiveProvider = mockProvider('expensive');
    const providers = new Map<string, LLMProvider>([
      ['expensive', expensiveProvider],
      ['cheap', cheapProvider],
    ]);
    const modelToProvider = { 'gpt-4o': 'expensive' };

    const router = createProviderRouter({
      providers,
      modelToProvider,
      getCost: (id: string) => (id === 'cheap' ? 1 : 100),
    });

    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider,
      router,
    });

    const result = await gateway.complete(makeRequest('gpt-4o'), {
      routingStrategy: 'lowest_cost',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // cheap provider should be selected
    expect(result.value.provider).toBe('cheap');
    expect(cheapProvider.complete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// gateway integration — backward compat (no router)
// ---------------------------------------------------------------------------

describe('LLM2-04: Gateway backward compat — no router', () => {
  it('uses resolveProvider when no router set', async () => {
    const openai = mockProvider('openai');
    const providers = new Map<string, LLMProvider>([['openai', openai]]);
    const modelToProvider = { 'gpt-4o': 'openai' };

    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider,
      // no router
    });

    const result = await gateway.complete(makeRequest('gpt-4o'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.provider).toBe('openai');
    expect(openai.complete).toHaveBeenCalled();
  });

  it('uses legacy fallbackMap when no router set', async () => {
    const failProvider = mockProvider(
      'openai',
      Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' }),
    );
    const successProvider = mockProvider('anthropic');
    const providers = new Map<string, LLMProvider>([
      ['openai', failProvider],
      ['anthropic', successProvider],
    ]);
    const modelToProvider = { 'gpt-4o': 'openai' };

    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider,
      fallbackMap: { openai: 'anthropic' },
      // no router
    });

    const result = await gateway.complete(makeRequest('gpt-4o'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.provider).toBe('anthropic');
    expect(result.value.wasFallback).toBe(true);
  });

  it('returns ProviderNotFound for unknown model (no router)', async () => {
    const providers = new Map<string, LLMProvider>();
    const gateway = createLlmGateway({
      providers,
      budgetService: stubBudgetService() as any,
      usageLogger: stubUsageLogger() as any,
      modelToProvider: {},
    });

    const result = await gateway.complete(makeRequest('nonexistent-model'));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error._tag).toBe('ProviderNotFound');
  });
});

// ---------------------------------------------------------------------------
// composition root wiring
// ---------------------------------------------------------------------------

describe('LLM2-04: composition root & barrel exports', () => {
  it('createProviderRouter is exported from barrel', async () => {
    const mod = await import('@aptivo/llm-gateway');
    expect(typeof mod.createProviderRouter).toBe('function');
  });

  it('createHealthTracker is exported from barrel', async () => {
    const mod = await import('@aptivo/llm-gateway');
    expect(typeof mod.createHealthTracker).toBe('function');
  });

  it('routing subpath export is accessible', async () => {
    const mod = await import('@aptivo/llm-gateway/routing');
    expect(typeof mod.createProviderRouter).toBe('function');
    expect(typeof mod.createHealthTracker).toBe('function');
  });

  it('createProviderRouter returns a router with selectProvider', () => {
    const router = createProviderRouter({
      providers: new Map([['p1', {}]]),
      modelToProvider: { m1: 'p1' },
    });
    expect(typeof router.selectProvider).toBe('function');
  });

  it('getLlmGateway is still accessible from composition root', async () => {
    const mod = await import('../src/lib/services.js');
    expect(typeof mod.getLlmGateway).toBe('function');
  });
});
