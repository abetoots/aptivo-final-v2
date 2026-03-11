/**
 * LLM-06: Cost Calculator Tests
 * @task LLM-06
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateCost, calculateTotalCost } from '../../src/cost/calculator.js';

describe('calculateCost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates correct breakdown for gpt-4o', () => {
    const result = calculateCost('gpt-4o', 1000, 2000);

    // input: 1000/1M * 2.50 = 0.0025
    expect(result.inputCost).toBeCloseTo(0.0025, 8);
    // output: 2000/1M * 10.00 = 0.02
    expect(result.outputCost).toBeCloseTo(0.02, 8);
    // llm: 0.0225
    expect(result.llmCost).toBeCloseTo(0.0225, 8);
    // infra: 0.0225 * 0.05 = 0.001125
    expect(result.infraCost).toBeCloseTo(0.001125, 8);
    // total: 0.023625
    expect(result.totalCost).toBeCloseTo(0.023625, 8);
    expect(result.model).toBe('gpt-4o');
  });

  it('calculates correct breakdown for claude-3-5-haiku', () => {
    const result = calculateCost('claude-3-5-haiku', 10000, 5000);

    // input: 10000/1M * 0.25 = 0.0025
    expect(result.inputCost).toBeCloseTo(0.0025, 8);
    // output: 5000/1M * 1.25 = 0.00625
    expect(result.outputCost).toBeCloseTo(0.00625, 8);
  });

  it('handles zero tokens', () => {
    const result = calculateCost('gpt-4o', 0, 0);
    expect(result.totalCost).toBe(0);
  });

  it('falls back to gpt-4o-mini rates for unknown model', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = calculateCost('unknown-model', 1000, 2000);

    // should use gpt-4o-mini rates: input 0.15/1M, output 0.60/1M
    const expectedInput = (1000 / 1_000_000) * 0.15;
    const expectedOutput = (2000 / 1_000_000) * 0.60;
    expect(result.inputCost).toBeCloseTo(expectedInput, 10);
    expect(result.outputCost).toBeCloseTo(expectedOutput, 10);
  });

  it('includes infrastructure overhead (S2-W11)', () => {
    const result = calculateCost('gpt-4o', 1000, 1000);
    expect(result.infraCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(result.llmCost);
    expect(result.totalCost).toBeCloseTo(result.llmCost * 1.05, 10);
  });
});

describe('calculateTotalCost', () => {
  it('returns total including infra overhead', () => {
    const total = calculateTotalCost('gpt-4o', 1000, 2000);
    const breakdown = calculateCost('gpt-4o', 1000, 2000);
    expect(total).toBeCloseTo(breakdown.totalCost, 10);
  });
});
