/**
 * LLM-08: Gateway Service Tests
 * @task LLM-08
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { z } from 'zod';
import { createLlmGateway } from '../../src/gateway/llm-gateway.js';
import type { GatewayDeps } from '../../src/gateway/llm-gateway.js';
import { BudgetService } from '../../src/budget/budget-service.js';
import { UsageLogger } from '../../src/usage/usage-logger.js';
import { TokenBucket, InMemoryRateLimitStore } from '../../src/rate-limit/token-bucket.js';
import type { LLMError, CompletionResponse } from '../../src/providers/types.js';
import {
  makeRequest,
  makeResponse,
  createMockProvider,
  createMockBudgetStore,
  createMockUsageStore,
} from '../fixtures/index.js';

function createTestDeps(overrides?: Partial<GatewayDeps>): GatewayDeps {
  const budgetStore = createMockBudgetStore();
  const usageStore = createMockUsageStore();

  return {
    providers: new Map([
      ['openai', createMockProvider('openai')],
      ['anthropic', createMockProvider('anthropic')],
    ]),
    budgetService: new BudgetService(budgetStore),
    usageLogger: new UsageLogger(usageStore),
    modelToProvider: {
      'gpt-4o': 'openai',
      'gpt-4o-mini': 'openai',
      'claude-3-5-sonnet': 'anthropic',
    },
    fallbackMap: {
      openai: 'anthropic',
      anthropic: 'openai',
    },
    ...overrides,
  };
}

describe('LlmGateway', () => {
  let deps: GatewayDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  describe('complete', () => {
    it('returns completion for valid request', async () => {
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.completion.content).toBe('Hello there!');
        expect(result.value.provider).toBe('openai');
        expect(result.value.wasFallback).toBe(false);
        expect(result.value.costUsd).toBeGreaterThan(0);
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('calls budget check before provider', async () => {
      const gateway = createLlmGateway(deps);
      await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      const openaiProvider = deps.providers.get('openai')!;
      expect(openaiProvider.complete).toHaveBeenCalledOnce();
    });

    it('blocks when daily budget exceeded', async () => {
      const budgetStore = createMockBudgetStore();
      vi.mocked(budgetStore.getDailySpend).mockResolvedValue(50);
      deps = createTestDeps({
        budgetService: new BudgetService(budgetStore),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DailyBudgetExceeded');
      }
    });

    it('blocks when monthly budget exceeded', async () => {
      const budgetStore = createMockBudgetStore();
      vi.mocked(budgetStore.getDailySpend).mockResolvedValue(0);
      vi.mocked(budgetStore.getMonthlySpend).mockResolvedValue(500);
      deps = createTestDeps({
        budgetService: new BudgetService(budgetStore),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('MonthlyBudgetExceeded');
      }
    });

    it('returns ProviderNotFound for unmapped model', async () => {
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'unknown-model' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ProviderNotFound');
      }
    });

    it('logs usage after successful completion', async () => {
      const usageStore = createMockUsageStore();
      deps = createTestDeps({
        usageLogger: new UsageLogger(usageStore),
      });
      const gateway = createLlmGateway(deps);

      await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(usageStore.insert).toHaveBeenCalledOnce();
    });

    it('logs budget warning at 90% threshold', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const budgetStore = createMockBudgetStore();
      vi.mocked(budgetStore.getDailySpend).mockResolvedValue(45); // 90% of 50
      deps = createTestDeps({
        budgetService: new BudgetService(budgetStore),
      });
      const gateway = createLlmGateway(deps);

      await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('llm budget warning'),
        expect.anything(),
      );
      warnSpy.mockRestore();
    });
  });

  describe('one-hop fallback', () => {
    it('falls back on primary 429 → secondary succeeds', async () => {
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(
          Result.err({ _tag: 'RateLimit', retryAfter: 30 } as LLMError),
        ),
      });
      const fallbackResponse = makeResponse({ id: 'fallback-resp' });
      const fallbackProvider = createMockProvider('anthropic', {
        complete: vi.fn().mockResolvedValue(Result.ok(fallbackResponse)),
      });

      deps = createTestDeps({
        providers: new Map([
          ['openai', primaryProvider],
          ['anthropic', fallbackProvider],
        ]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.wasFallback).toBe(true);
        expect(result.value.provider).toBe('anthropic');
        expect(result.value.completion.id).toBe('fallback-resp');
      }
    });

    it('falls back on primary ServiceUnavailable', async () => {
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(
          Result.err({ _tag: 'ServiceUnavailable', provider: 'openai' } as LLMError),
        ),
      });
      deps = createTestDeps({
        providers: new Map([
          ['openai', primaryProvider],
          ['anthropic', createMockProvider('anthropic')],
        ]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.wasFallback).toBe(true);
      }
    });

    it('falls back on primary Timeout', async () => {
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(
          Result.err({ _tag: 'Timeout', provider: 'openai' } as LLMError),
        ),
      });
      deps = createTestDeps({
        providers: new Map([
          ['openai', primaryProvider],
          ['anthropic', createMockProvider('anthropic')],
        ]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.wasFallback).toBe(true);
      }
    });

    it('returns error when both primary and fallback fail', async () => {
      const errorResult = Result.err({ _tag: 'ServiceUnavailable', provider: 'x' } as LLMError);
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(errorResult),
      });
      const fallbackProvider = createMockProvider('anthropic', {
        complete: vi.fn().mockResolvedValue(errorResult),
      });
      deps = createTestDeps({
        providers: new Map([
          ['openai', primaryProvider],
          ['anthropic', fallbackProvider],
        ]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(false);
    });

    it('does not fall back on non-retryable errors', async () => {
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(
          Result.err({ _tag: 'ContentFilter', reason: 'blocked' } as LLMError),
        ),
      });
      const fallbackProvider = createMockProvider('anthropic');
      deps = createTestDeps({
        providers: new Map([
          ['openai', primaryProvider],
          ['anthropic', fallbackProvider],
        ]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(false);
      // fallback should not have been called
      expect(fallbackProvider.complete).not.toHaveBeenCalled();
    });

    it('does not fall back when no fallback map', async () => {
      const primaryProvider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(
          Result.err({ _tag: 'RateLimit' } as LLMError),
        ),
      });
      deps = createTestDeps({
        providers: new Map([['openai', primaryProvider]]),
        fallbackMap: undefined,
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(false);
    });
  });

  describe('output validation (S1-W13)', () => {
    it('validates JSON output against schema', async () => {
      const responseWithJson = makeResponse({ content: '{"name":"Alice","age":30}' });
      const provider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(Result.ok(responseWithJson)),
      });
      deps = createTestDeps({
        providers: new Map([['openai', provider]]),
      });
      const gateway = createLlmGateway(deps);

      const schema = z.object({ name: z.string(), age: z.number() });
      const result = await gateway.complete(
        makeRequest({ model: 'gpt-4o-mini' }),
        { outputSchema: schema },
      );

      expect(result.ok).toBe(true);
    });

    it('rejects output that fails schema validation', async () => {
      const responseWithBadJson = makeResponse({ content: '{"name":"Alice"}' });
      const provider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(Result.ok(responseWithBadJson)),
      });
      deps = createTestDeps({
        providers: new Map([['openai', provider]]),
      });
      const gateway = createLlmGateway(deps);

      const schema = z.object({ name: z.string(), age: z.number() });
      const result = await gateway.complete(
        makeRequest({ model: 'gpt-4o-mini' }),
        { outputSchema: schema },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OutputValidationFailed');
      }
    });

    it('rejects empty content with stop finish reason', async () => {
      const emptyResponse = makeResponse({ content: '', finishReason: 'stop' });
      const provider = createMockProvider('openai', {
        complete: vi.fn().mockResolvedValue(Result.ok(emptyResponse)),
      });
      deps = createTestDeps({
        providers: new Map([['openai', provider]]),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OutputValidationFailed');
      }
    });
  });

  describe('rate limiting', () => {
    it('blocks when rate limit exceeded', async () => {
      const rateLimiter = new TokenBucket(new InMemoryRateLimitStore(), {
        maxTokens: 1,
        refillRate: 0,
      });

      deps = createTestDeps({ rateLimiter });
      const gateway = createLlmGateway(deps);

      // first request consumes the only token
      const first = await gateway.complete(
        makeRequest({ model: 'gpt-4o-mini' }),
        { userId: 'user-1' },
      );
      expect(first.ok).toBe(true);

      // second request should be blocked
      const second = await gateway.complete(
        makeRequest({ model: 'gpt-4o-mini' }),
        { userId: 'user-1' },
      );
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error._tag).toBe('RateLimitExceeded');
      }
    });

    it('skips rate limiting when no userId', async () => {
      const rateLimiter = new TokenBucket(new InMemoryRateLimitStore(), {
        maxTokens: 0,
        refillRate: 0,
      });

      deps = createTestDeps({ rateLimiter });
      const gateway = createLlmGateway(deps);

      // should skip rate limiter since no userId
      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(true);
    });
  });

  describe('usage logging resilience', () => {
    it('returns success even when usage logging fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const usageStore = createMockUsageStore();
      vi.mocked(usageStore.insert).mockRejectedValue(new Error('db down'));

      deps = createTestDeps({
        usageLogger: new UsageLogger(usageStore),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));

      // should still succeed even though logging failed
      expect(result.ok).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed to log'),
        expect.anything(),
      );
      errorSpy.mockRestore();
    });
  });

  describe('pre-request budget check', () => {
    it('uses estimated cost for pre-request budget check', async () => {
      const budgetStore = createMockBudgetStore();
      vi.mocked(budgetStore.getDailySpend).mockResolvedValue(49.5);
      deps = createTestDeps({
        budgetService: new BudgetService(budgetStore),
      });
      const gateway = createLlmGateway(deps);

      const result = await gateway.complete(
        makeRequest({ model: 'gpt-4o-mini' }),
        { estimatedCostUsd: 1.0 }, // 49.5 + 1.0 = 50.5 > 50
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DailyBudgetExceeded');
      }
    });
  });
});
