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
} from './providers/index.js';
export { isRetryableError, OpenAIProvider, AnthropicProvider } from './providers/index.js';

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
