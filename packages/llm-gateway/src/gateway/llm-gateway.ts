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
import type { AsyncInjectionClassifier } from '../safety/ml-injection-classifier.js';
import type { AnomalyGate } from '../safety/anomaly-gate.js';
import type { ContentFilter } from '../safety/content-filter.js';
import type { ProviderRouter } from '../routing/provider-router.js';
import type { RoutingStrategy } from '../routing/routing-types.js';

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
  /**
   * Optional injection classifier. Must be async-shaped so both the
   * rule-based (LLM2-01, sync) and ML wrapper (LLM3-02, HTTP) paths
   * share one branch. Callers holding a synchronous classifier should
   * wrap it via `asAsyncInjectionClassifier` at composition time — NOT
   * inside the gateway hot path (historical probe-based dispatch was
   * removed because it issued a real model call per request to detect
   * the return shape).
   */
  injectionClassifier?: AsyncInjectionClassifier;
  /**
   * Optional anomaly gate (LLM3-04). Invoked after injection, before
   * content filter. On block/throttle decisions the gateway surfaces
   * `AnomalyBlocked` via `LLMError`. Fail-open is the gate's
   * responsibility (cold-start, detector error) — the gateway treats
   * `{ action: 'pass' }` as permit.
   */
  anomalyGate?: AnomalyGate;
  /**
   * Request context for anomaly evaluation. When the anomaly gate is
   * wired, the gateway reads `request.userId` via this callback so the
   * gate can scope its aggregate query. Defaults to skipping anomaly
   * evaluation if the caller can't resolve an actor.
   */
  resolveActor?: (request: CompletionRequest) => string | undefined;
  /** optional content filter (LLM2-02) */
  contentFilter?: ContentFilter;
  /** optional multi-provider router (LLM2-04) */
  router?: ProviderRouter;
}

export interface GatewayRequestOptions {
  /** user ID for rate limiting */
  userId?: string;
  /** zod schema to validate LLM JSON output */
  outputSchema?: z.ZodType;
  /** estimated cost for pre-request budget check */
  estimatedCostUsd?: number;
  /** routing strategy for multi-provider selection (LLM2-04) */
  routingStrategy?: RoutingStrategy;
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
     * 3. Injection classifier (if provided) → block on 'block' verdict
     * 4. Content filter pre-request (if provided)
     * 5. Resolve provider for model
     * 6. Call primary provider
     * 7. On retryable error → call fallback (one-hop)
     * 8. Content filter post-response (if provided)
     * 9. Validate output (if schema provided)
     * 10. Log usage
     * 11. Return Result
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

      // step 3: injection classifier (optional). Gateway takes the async
      // shape only — composition root wraps sync classifiers once. No
      // per-request probe (removed after pre-commit review flagged it as
      // a per-request inference call).
      if (deps.injectionClassifier) {
        for (const msg of request.messages) {
          // extract text from string or ContentPart[]
          const text = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.filter((p: { type?: string; text?: string }) => p.type === 'text').map((p: { text?: string }) => p.text ?? '').join(' ')
              : '';
          if (!text) continue;
          const classifyResult = await deps.injectionClassifier.classify(text, request.domain);
          if (classifyResult.ok && classifyResult.value.verdict === 'block') {
            return Result.err({ _tag: 'PromptInjectionBlocked' as const, verdict: classifyResult.value });
          }
        }
      }

      // step 3b: anomaly gate (optional, LLM3-04). Runs after injection so
      // pattern-matching attacks block first (cheaper, deterministic); runs
      // before content filter so anomalous volumes aren't billed through the
      // pipeline. Actor resolution is pluggable — if the caller can't name an
      // actor, the gate is skipped.
      if (deps.anomalyGate) {
        const actor = deps.resolveActor?.(request);
        if (actor) {
          // resourceType reuses the request domain as a coarse scope key;
          // finer-grained scoping (e.g. per-table) is an audit-store concern.
          const decision = await deps.anomalyGate.evaluate(actor, request.domain);
          if (decision.action === 'block' || decision.action === 'throttle') {
            return Result.err({
              _tag: 'AnomalyBlocked' as const,
              reason: decision.reason,
              cooldownMs: decision.cooldownMs,
            });
          }
        }
      }

      // step 4: content filter pre-request (optional)
      if (deps.contentFilter) {
        // extract text content from messages for filtering (handles string + ContentPart[])
        const textMessages = request.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content.filter((p: { type?: string; text?: string }) => p.type === 'text').map((p: { text?: string }) => p.text ?? '').join(' ')
              : '',
        }));
        const filterResult = deps.contentFilter.filterRequest(textMessages, request.domain);
        if (!filterResult.ok) return Result.err(filterResult.error);
      }

      // step 5: resolve provider — use router when available (LLM2-04)
      let primaryProvider: LLMProvider;
      let routerFallbacks: LLMProvider[] = [];

      if (deps.router) {
        // multi-provider routing via router
        const strategy = options.routingStrategy ?? 'failover_only';
        const routeResult = deps.router.selectProvider(request.model, strategy);
        if (!routeResult.ok) {
          return Result.err({ _tag: 'ProviderNotFound' as const, providerId: request.model });
        }
        primaryProvider = routeResult.value.primary.provider as LLMProvider;
        routerFallbacks = routeResult.value.fallbacks.map((f) => f.provider as LLMProvider);
      } else {
        // legacy resolution — backward compatible
        const resolved = resolveProvider(request.model, deps.modelToProvider, deps.providers);
        if (!resolved) {
          return Result.err({ _tag: 'ProviderNotFound', providerId: request.model });
        }
        primaryProvider = resolved;
      }

      // step 6: call primary provider
      const startMs = Date.now();
      let result = await primaryProvider.complete(request);
      let latencyMs = Date.now() - startMs;
      let usedProvider = primaryProvider;
      let wasFallback = false;

      // step 7: fallback on retryable error
      if (!result.ok && isRetryableError(result.error)) {
        if (deps.router && routerFallbacks.length > 0) {
          // router-based fallback chain (LLM2-04)
          for (const fallbackProvider of routerFallbacks) {
            const fallbackStart = Date.now();
            result = await fallbackProvider.complete(request);
            latencyMs = Date.now() - fallbackStart;
            usedProvider = fallbackProvider;
            wasFallback = true;
            if (result.ok || !isRetryableError(result.error)) break;
          }
        } else if (deps.fallbackMap) {
          // legacy one-hop fallback
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
      }

      if (!result.ok) return result;

      const completion = result.value;

      // step 8: content filter post-response (optional)
      if (deps.contentFilter) {
        const postFilter = deps.contentFilter.filterResponse(completion.content, request.domain);
        if (!postFilter.ok) return Result.err(postFilter.error);
      }

      // step 9: validate output if schema provided
      if (options.outputSchema) {
        const validationResult = validateOutput(completion.content, options.outputSchema);
        if (!validationResult.ok) return validationResult;
      } else if (completion.content.length === 0 && completion.finishReason === 'stop') {
        const textResult = validateTextOutput(completion.content);
        if (!textResult.ok) return textResult;
      }

      // step 10: log usage (fire-and-forget, don't block response)
      const costUsd = await logUsageSafe(
        deps.usageLogger,
        request,
        completion,
        usedProvider.id,
        latencyMs,
        wasFallback,
        primaryProvider.id,
      );

      // step 11: return
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
