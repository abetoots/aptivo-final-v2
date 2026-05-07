/**
 * LLM-08: Usage Logger
 * @task LLM-08
 * @spec docs/04-specs/platform-core/llm-gateway.md §3.3
 * @reuse SP-08 CostLedger rewritten as DB-backed
 */

import type { CompletionRequest, CompletionResponse } from '../providers/types.js';
import { calculateTotalCost } from '../cost/calculator.js';
import type { PricingLogger } from '../cost/pricing.js';

// ---------------------------------------------------------------------------
// S18-C1b: UsageRecord + UsageStore now live in @aptivo/types so the
// gateway and the database adapter share one source of truth instead
// of mirroring the shape across two packages with drift-risk comments.
// Re-exported here for back-compat with any caller that imported from
// '@aptivo/llm-gateway'.
// ---------------------------------------------------------------------------

export type { UsageRecord, UsageStore } from '@aptivo/types';
import type { UsageRecord, UsageStore } from '@aptivo/types';

// ---------------------------------------------------------------------------
// usage logger
// ---------------------------------------------------------------------------

export class UsageLogger {
  // S17-B4: optional logger forwarded into calculateTotalCost so
  // unknown-model fallback warnings emit through the structured
  // logger instead of console.warn.
  constructor(
    private readonly store: UsageStore,
    private readonly pricingLogger?: PricingLogger,
  ) {}

  /**
   * Logs a completed LLM request's usage and cost.
   */
  async logUsage(
    request: CompletionRequest,
    response: CompletionResponse,
    provider: string,
    latencyMs: number,
    opts?: { wasFallback?: boolean; primaryProvider?: string; departmentId?: string },
  ): Promise<void> {
    const costUsd = calculateTotalCost(
      request.model,
      response.usage.promptTokens,
      response.usage.completionTokens,
      this.pricingLogger,
    );

    await this.store.insert({
      workflowId: request.workflowId,
      workflowStepId: request.workflowStepId,
      domain: request.domain,
      provider,
      model: request.model,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      costUsd,
      requestType: 'completion',
      latencyMs,
      wasFallback: opts?.wasFallback ?? false,
      primaryProvider: opts?.primaryProvider,
      // S17-B1: opts.departmentId is the actor's department from
      // request.actor or deps.resolveActor; falls back to request.actor
      // for callers that bypass the gateway pipeline (rare).
      departmentId: opts?.departmentId ?? request.actor?.departmentId,
    });
  }

  /**
   * LLM3-02: Records a safety-inference call (e.g. the ML injection
   * classifier). These calls don't produce tokens or completions — only
   * a per-call cost and latency — so the token fields are zeroed.
   *
   * Post-S18-C1b: `UsageRecord.domain` is `string` in the canonical
   * @aptivo/types definition, so this method's `domain: string` input
   * can be forwarded directly with no cast. The earlier `as Domain`
   * narrowing was a TS-level constraint that the runtime never enforced.
   */
  async logSafetyInference(input: {
    domain: string;
    provider: string;
    model: string;
    costUsd: number;
    latencyMs: number;
  }): Promise<void> {
    await this.store.insert({
      domain: input.domain,
      provider: input.provider,
      model: input.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: input.costUsd,
      requestType: 'safety_inference',
      latencyMs: input.latencyMs,
      wasFallback: false,
    });
  }
}
