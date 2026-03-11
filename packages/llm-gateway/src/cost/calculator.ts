/**
 * LLM-06: Cost Calculator
 * @task LLM-06
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.1
 * @reuse SP-08 calculateCost adapted to per-1M-token format
 * @warning S2-W11 cost attribution covers LLM + infrastructure
 */

import { getModelPricing } from './pricing.js';

/** breakdown of costs for a single request */
export interface CostBreakdown {
  /** model used for calculation */
  model: string;
  /** cost of input tokens in USD */
  inputCost: number;
  /** cost of output tokens in USD */
  outputCost: number;
  /** total LLM cost in USD */
  llmCost: number;
  /** infrastructure overhead in USD (platform margin) */
  infraCost: number;
  /** total cost in USD */
  totalCost: number;
}

/** platform infrastructure overhead percentage (5%) */
const INFRA_OVERHEAD_RATE = 0.05;

/**
 * Calculates the cost breakdown for a given model and token counts.
 * Uses per-1M-token pricing. Unknown models fall back to gpt-4o-mini rates.
 *
 * @param model - model ID string
 * @param promptTokens - number of input tokens
 * @param completionTokens - number of output tokens
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): CostBreakdown {
  const pricing = getModelPricing(model);

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const llmCost = inputCost + outputCost;
  const infraCost = llmCost * INFRA_OVERHEAD_RATE;
  const totalCost = llmCost + infraCost;

  return { model, inputCost, outputCost, llmCost, infraCost, totalCost };
}

/**
 * Calculates just the total USD cost (convenience shorthand).
 */
export function calculateTotalCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  return calculateCost(model, promptTokens, completionTokens).totalCost;
}
