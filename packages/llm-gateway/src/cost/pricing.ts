/**
 * LLM-06: Model Pricing Registry
 * @task LLM-06
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.1
 * @reuse SP-08 MODEL_PRICING adapted to per-1M-token format
 */

export interface ModelPricingEntry {
  /** cost per 1M input tokens in USD */
  input: number;
  /** cost per 1M output tokens in USD */
  output: number;
}

/** pricing version for cache invalidation */
export const PRICING_VERSION = '2026-03' as const;

/**
 * Immutable pricing registry keyed by model ID.
 * Prices are per 1M tokens in USD.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricingEntry>> = Object.freeze({
  // openai
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // anthropic
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.25, output: 1.25 },
  // google
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
});

/** default model used for unknown model fallback pricing */
export const FALLBACK_MODEL = 'gpt-4o-mini' as const;

/**
 * Returns pricing for a model, falling back to gpt-4o-mini rates
 * with a console warning if the model is unknown.
 */
export function getModelPricing(model: string): ModelPricingEntry {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing;

  console.warn(`unknown model pricing: ${model}, using ${FALLBACK_MODEL} rates`);
  // fallback is guaranteed to exist
  return MODEL_PRICING[FALLBACK_MODEL]!;
}
