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
 * S17-B4: minimal pricing-logger contract. Kept narrow so callers can
 * pass any structured logger (composition root binds to the app's
 * SafeLogger). Optional — when unset, falls back to `console.warn` to
 * preserve legacy behaviour for callers that haven't been threaded.
 */
export interface PricingLogger {
  warn(event: string, context?: Record<string, unknown>): void;
}

/**
 * Returns pricing for a model, falling back to gpt-4o-mini rates
 * with a structured warning if the model is unknown. The optional
 * `logger` is the S17-B4 migration off `console.warn`; when omitted,
 * the message is emitted via `console.warn` to keep legacy callers
 * working without a forced refactor.
 */
export function getModelPricing(model: string, logger?: PricingLogger): ModelPricingEntry {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing;

  if (logger) {
    logger.warn('llm_pricing_unknown_model', { model, fallback: FALLBACK_MODEL });
  } else {
    console.warn(`unknown model pricing: ${model}, using ${FALLBACK_MODEL} rates`);
  }
  // fallback is guaranteed to exist
  return MODEL_PRICING[FALLBACK_MODEL]!;
}
