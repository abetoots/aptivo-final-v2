/**
 * @aptivo/llm-gateway
 * Provider-agnostic LLM abstraction with per-workflow cost tracking,
 * budget enforcement, and per-user rate limiting.
 *
 * @brd BO-CORE-003
 * @spec docs/04-specs/platform-core/llm-gateway.md
 */

// gateway (main entry)
export { createLlmGateway } from './gateway/index.js';
export type { GatewayDeps, GatewayRequestOptions, GatewayResponse, LlmGateway } from './gateway/index.js';

// providers
export type {
  LLMProvider,
  LLMError,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
  Tool,
  ToolCall,
  TokenCount,
  FinishReason,
  Domain,
  ActorContext,
} from './providers/index.js';
export { isRetryableError, OpenAIProvider, AnthropicProvider } from './providers/index.js';
export type { OpenAIClient } from './providers/index.js';
export type { AnthropicClient } from './providers/index.js';

// cost
export { calculateCost, calculateTotalCost, getModelPricing, MODEL_PRICING, PRICING_VERSION } from './cost/index.js';
export type { CostBreakdown, ModelPricingEntry } from './cost/index.js';

// budget
export { BudgetService } from './budget/index.js';
export type { BudgetConfig, BudgetStatus, BudgetStore } from './budget/index.js';

// usage
export { UsageLogger } from './usage/index.js';
export type { UsageRecord, UsageStore } from './usage/index.js';

// validation
export { validateOutput, validateTextOutput } from './validation/index.js';

// rate limiting
export { TokenBucket, InMemoryRateLimitStore } from './rate-limit/index.js';
export type { TokenBucketConfig, RateLimitStore } from './rate-limit/index.js';

// durable rate limiting (LLM2-03)
export { createRedisRateLimitStore, createDurableRateLimiter, DEFAULT_USER_RATE_LIMITS } from './rate-limit/index.js';
export type {
  RedisRateLimitClient,
  RedisRateLimitStoreConfig,
  DurableTokenBucketConfig,
  PerUserRateLimitConfig,
  RateLimitResult,
  DurableRateLimiter,
} from './rate-limit/index.js';

// safety — prompt injection detection (LLM2-01)
export { createInjectionClassifier, DEFAULT_INJECTION_PATTERNS, DEFAULT_DOMAIN_THRESHOLDS } from './safety/index.js';
export type {
  InjectionClassifier,
  InjectionVerdict,
  DomainThresholds,
  PatternCategory,
  InjectionClassifierConfig,
} from './safety/index.js';

// safety — content filtering pipeline (LLM2-02)
export { createContentFilter, DEFAULT_CONTENT_PATTERNS, DEFAULT_DOMAIN_TIERS, DEFAULT_TIER_CATEGORIES } from './safety/index.js';
export type {
  ContentFilter,
  ContentFilterError,
  ContentPattern,
  ContentFilterStage,
  ContentFilterVerdict,
  DomainPolicyTier,
  ContentFilterConfig,
} from './safety/index.js';

// safety — streaming content filter (LLM3-01)
export { createStreamingContentFilter } from './safety/index.js';
export type { StreamingFilterConfig, ChunkResult } from './safety/index.js';

// routing — multi-provider routing (LLM2-04)
export { createProviderRouter, createHealthTracker } from './routing/index.js';
export type {
  ProviderRouter,
  NoProviderAvailableError,
  HealthTracker,
  HealthTrackerDeps,
  RoutingStrategy,
  ProviderSelection,
  ProviderHealth,
  ProviderCost,
  ProviderRouterDeps,
} from './routing/index.js';
