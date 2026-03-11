/**
 * LLM-06: Pricing Registry Tests
 * @task LLM-06
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MODEL_PRICING, PRICING_VERSION, FALLBACK_MODEL, getModelPricing } from '../../src/cost/pricing.js';

describe('MODEL_PRICING', () => {
  it('includes all expected models', () => {
    const expectedModels = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
      'claude-3-opus', 'claude-3-5-sonnet', 'claude-3-5-haiku',
      'gemini-1.5-pro', 'gemini-1.5-flash',
    ];

    for (const model of expectedModels) {
      expect(MODEL_PRICING[model]).toBeDefined();
    }
  });

  it('has positive input and output prices', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input, `${model} input`).toBeGreaterThan(0);
      expect(pricing.output, `${model} output`).toBeGreaterThan(0);
    }
  });

  it('has a version stamp', () => {
    expect(PRICING_VERSION).toBe('2026-03');
  });

  it('is immutable (frozen)', () => {
    expect(() => {
      (MODEL_PRICING as Record<string, unknown>)['new-model'] = { input: 1, output: 1 };
    }).toThrow();
  });
});

describe('getModelPricing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns pricing for known model', () => {
    const pricing = getModelPricing('gpt-4o');
    expect(pricing.input).toBe(2.50);
    expect(pricing.output).toBe(10.00);
  });

  it('falls back to gpt-4o-mini for unknown model with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const pricing = getModelPricing('unknown-model');

    expect(pricing).toEqual(MODEL_PRICING[FALLBACK_MODEL]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown model pricing'),
    );
  });
});
