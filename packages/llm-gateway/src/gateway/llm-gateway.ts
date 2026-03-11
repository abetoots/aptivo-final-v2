/**
 * LLM-08: Gateway Service
 * @task LLM-08
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.3
 * @brd BO-CORE-003
 * @frd FR-CORE-LLM-001, FR-CORE-LLM-002, FR-CORE-LLM-003
 * @warning S1-W13 output validation, S7-W17 unbounded spend
 */

import { Result } from '@aptivo/types';
import type { z } from 'zod';
import type {
  LLMProvider,
  LLMError,
  CompletionRequest,
  CompletionResponse,
} from '../providers/types.js';
import { isRetryableError } from '../providers/types.js';
import type { BudgetService } from '../budget/budget-service.js';
import type { UsageLogger } from '../usage/usage-logger.js';
import type { TokenBucket } from '../rate-limit/token-bucket.js';
import { validateOutput, validateTextOutput } from '../validation/output-validator.js';

// ---------------------------------------------------------------------------
// gateway dependencies (functional core, imperative shell)
// ---------------------------------------------------------------------------

export interface GatewayDeps {
  providers: Map<string, LLMProvider>;
  budgetService: BudgetService;
  usageLogger: UsageLogger;
  rateLimiter?: TokenBucket;
  /** maps model ID to provider ID */
  modelToProvider: Record<string, string>;
  /** maps provider ID to fallback provider ID (one-hop) */
  fallbackMap?: Record<string, string>;
}

export interface GatewayRequestOptions {
  /** user ID for rate limiting */
  userId?: string;
  /** zod schema to validate LLM JSON output */
  outputSchema?: z.ZodType;
  /** estimated cost for pre-request budget check */
  estimatedCostUsd?: number;
}

export interface GatewayResponse {
  completion: CompletionResponse;
  costUsd: number;
  provider: string;
  wasFallback: boolean;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// provider resolution (pure)
// ---------------------------------------------------------------------------

function resolveProvider(
  model: string,
  modelToProvider: Record<string, string>,
  providers: Map<string, LLMProvider>,
): LLMProvider | null {
  const providerId = modelToProvider[model];
  if (!providerId) return null;
  return providers.get(providerId) ?? null;
}

// ---------------------------------------------------------------------------
// gateway factory
// ---------------------------------------------------------------------------

export function createLlmGateway(deps: GatewayDeps) {
  return {
    /**
     * Main completion flow:
     * 1. Rate limit check (if userId provided)
     * 2. Budget check → block if exceeded
     * 3. Resolve provider for model
     * 4. Call primary provider
     * 5. On retryable error → call fallback (one-hop)
     * 6. Validate output (if schema provided)
     * 7. Log usage
     * 8. Return Result
     */
    async complete(
      request: CompletionRequest,
      options: GatewayRequestOptions = {},
    ): Promise<Result<GatewayResponse, LLMError>> {
      // step 1: rate limit
      if (options.userId && deps.rateLimiter) {
        const rateResult = await deps.rateLimiter.enforce(options.userId);
        if (!rateResult.ok) return rateResult;
      }

      // step 2: budget check
      const budgetResult = options.estimatedCostUsd
        ? await deps.budgetService.enforcePreRequest(request.domain, options.estimatedCostUsd)
        : await deps.budgetService.checkBudget(request.domain);

      if (!budgetResult.ok) return budgetResult;

      if (budgetResult.value.warningTriggered) {
        console.warn(`llm budget warning: domain=${request.domain}`, budgetResult.value);
      }

      // step 3: resolve provider
      const primaryProvider = resolveProvider(request.model, deps.modelToProvider, deps.providers);
      if (!primaryProvider) {
        return Result.err({ _tag: 'ProviderNotFound', providerId: request.model });
      }

      // step 4: call primary provider
      const startMs = Date.now();
      let result = await primaryProvider.complete(request);
      let latencyMs = Date.now() - startMs;
      let usedProvider = primaryProvider;
      let wasFallback = false;

      // step 5: one-hop fallback on retryable error
      if (!result.ok && isRetryableError(result.error) && deps.fallbackMap) {
        const fallbackId = deps.fallbackMap[primaryProvider.id];
        if (fallbackId) {
          const fallbackProvider = deps.providers.get(fallbackId);
          if (fallbackProvider) {
            const fallbackStart = Date.now();
            result = await fallbackProvider.complete(request);
            latencyMs = Date.now() - fallbackStart;
            usedProvider = fallbackProvider;
            wasFallback = true;
          }
        }
      }

      if (!result.ok) return result;

      const completion = result.value;

      // step 6: validate output if schema provided
      if (options.outputSchema) {
        const validationResult = validateOutput(completion.content, options.outputSchema);
        if (!validationResult.ok) return validationResult;
      } else if (completion.content.length === 0 && completion.finishReason === 'stop') {
        const textResult = validateTextOutput(completion.content);
        if (!textResult.ok) return textResult;
      }

      // step 7: log usage (fire-and-forget, don't block response)
      const costUsd = await logUsageSafe(
        deps.usageLogger,
        request,
        completion,
        usedProvider.id,
        latencyMs,
        wasFallback,
        primaryProvider.id,
      );

      // step 8: return
      return Result.ok({
        completion,
        costUsd,
        provider: usedProvider.id,
        wasFallback,
        latencyMs,
      });
    },
  };
}

async function logUsageSafe(
  logger: UsageLogger,
  request: CompletionRequest,
  response: CompletionResponse,
  provider: string,
  latencyMs: number,
  wasFallback: boolean,
  primaryProviderId: string,
): Promise<number> {
  const { calculateTotalCost } = await import('../cost/calculator.js');
  const costUsd = calculateTotalCost(
    request.model,
    response.usage.promptTokens,
    response.usage.completionTokens,
  );

  try {
    await logger.logUsage(request, response, provider, latencyMs, {
      wasFallback,
      primaryProvider: wasFallback ? primaryProviderId : undefined,
    });
  } catch (err) {
    // usage logging failure must not block the response
    console.error('failed to log llm usage:', err);
  }

  return costUsd;
}

export type LlmGateway = ReturnType<typeof createLlmGateway>;
