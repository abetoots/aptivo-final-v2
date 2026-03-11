/**
 * LLM-03: Provider Abstraction Contract Tests
 * @task LLM-03
 */

import { describe, it, expect } from 'vitest';
import { isRetryableError } from '../../src/providers/types.js';
import type { LLMError } from '../../src/providers/types.js';

describe('LLMError type', () => {
  it('represents all required error variants', () => {
    const errors: LLMError[] = [
      { _tag: 'ProviderNotFound', providerId: 'unknown' },
      { _tag: 'ModelNotSupported', model: 'bad', provider: 'openai' },
      { _tag: 'RateLimit', retryAfter: 30 },
      { _tag: 'ServiceUnavailable', provider: 'openai' },
      { _tag: 'Timeout', provider: 'openai' },
      { _tag: 'ContentFilter', reason: 'blocked' },
      { _tag: 'InvalidRequest', message: 'bad input' },
      { _tag: 'DailyBudgetExceeded', dailyUsed: 50, dailyLimit: 50 },
      { _tag: 'MonthlyBudgetExceeded', monthlyUsed: 500, monthlyLimit: 500 },
      { _tag: 'RateLimitExceeded', userId: 'u1', limit: 20 },
      { _tag: 'OutputValidationFailed', zodErrors: 'invalid' },
      { _tag: 'NetworkError', cause: new Error('fail') },
    ];

    expect(errors).toHaveLength(12);
    // each variant has a unique _tag
    const tags = errors.map((e) => e._tag);
    expect(new Set(tags).size).toBe(12);
  });
});

describe('isRetryableError', () => {
  it('returns true for RateLimit', () => {
    expect(isRetryableError({ _tag: 'RateLimit' })).toBe(true);
  });

  it('returns true for ServiceUnavailable', () => {
    expect(isRetryableError({ _tag: 'ServiceUnavailable', provider: 'x' })).toBe(true);
  });

  it('returns true for Timeout', () => {
    expect(isRetryableError({ _tag: 'Timeout', provider: 'x' })).toBe(true);
  });

  it('returns true for NetworkError', () => {
    expect(isRetryableError({ _tag: 'NetworkError', cause: null })).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError({ _tag: 'ModelNotSupported', model: 'x', provider: 'y' })).toBe(false);
    expect(isRetryableError({ _tag: 'ContentFilter', reason: 'x' })).toBe(false);
    expect(isRetryableError({ _tag: 'InvalidRequest', message: 'x' })).toBe(false);
    expect(isRetryableError({ _tag: 'DailyBudgetExceeded', dailyUsed: 50, dailyLimit: 50 })).toBe(false);
  });
});
