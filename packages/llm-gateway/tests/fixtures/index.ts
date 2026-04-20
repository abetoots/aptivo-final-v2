/**
 * Shared test fixtures for llm-gateway tests
 */

import { Result } from '@aptivo/types';
import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  LLMError,
  StreamChunk,
  TokenCount,
} from '../../src/providers/types.js';
import type { BudgetConfig, BudgetStore } from '../../src/budget/budget-service.js';
import type { UsageStore } from '../../src/usage/usage-logger.js';
import type { Domain } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// request fixtures
// ---------------------------------------------------------------------------

export function makeRequest(overrides?: Partial<CompletionRequest>): CompletionRequest {
  return {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello' }],
    domain: 'core',
    ...overrides,
  };
}

export function makeResponse(overrides?: Partial<CompletionResponse>): CompletionResponse {
  return {
    id: 'resp-001',
    content: 'Hello there!',
    finishReason: 'stop',
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mock provider
// ---------------------------------------------------------------------------

export function createMockProvider(
  id: string,
  overrides?: Partial<LLMProvider>,
): LLMProvider {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    supportsStreaming: true,
    complete: vi.fn().mockResolvedValue(Result.ok(makeResponse())),
    stream: vi.fn(async function* (): AsyncGenerator<StreamChunk, void, unknown> {
      yield { content: 'Hello', finishReason: 'stop' };
    }),
    estimateCost: vi.fn((_model: string, _tokens: TokenCount) => 0.001),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mock budget store
// ---------------------------------------------------------------------------

export function createMockBudgetStore(overrides?: Partial<BudgetStore>): BudgetStore {
  const defaultConfig: BudgetConfig = {
    domain: 'core',
    dailyLimitUsd: 50,
    monthlyLimitUsd: 1000,
    dailyWarningThreshold: 0.90,
    blockOnExceed: true,
  };

  return {
    getConfig: vi.fn().mockResolvedValue(defaultConfig),
    getDailySpend: vi.fn().mockResolvedValue(0),
    getMonthlySpend: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

export function createBudgetConfig(overrides?: Partial<BudgetConfig>): BudgetConfig {
  return {
    domain: 'core' as Domain,
    dailyLimitUsd: 50,
    monthlyLimitUsd: 1000,
    dailyWarningThreshold: 0.90,
    blockOnExceed: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mock usage store
// ---------------------------------------------------------------------------

export function createMockUsageStore(): UsageStore & { inserted: unknown[] } {
  const inserted: unknown[] = [];
  return {
    inserted,
    insert: vi.fn(async (record) => {
      inserted.push(record);
    }),
  };
}
