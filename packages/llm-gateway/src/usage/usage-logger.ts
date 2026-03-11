/**
 * LLM-08: Usage Logger
 * @task LLM-08
 * @spec docs/04-specs/platform-core/llm-gateway.md §3.3
 * @reuse SP-08 CostLedger rewritten as DB-backed
 */

import type { CompletionRequest, CompletionResponse, Domain } from '../providers/types.js';
import { calculateTotalCost } from '../cost/calculator.js';

// ---------------------------------------------------------------------------
// usage record
// ---------------------------------------------------------------------------

export interface UsageRecord {
  workflowId?: string;
  workflowStepId?: string;
  domain: Domain;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestType: 'completion' | 'embedding' | 'vision';
  latencyMs: number;
  wasFallback: boolean;
  primaryProvider?: string;
}

// ---------------------------------------------------------------------------
// usage store interface (dependency injection for DB)
// ---------------------------------------------------------------------------

export interface UsageStore {
  /** inserts a usage record (idempotent by request context) */
  insert(record: UsageRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// usage logger
// ---------------------------------------------------------------------------

export class UsageLogger {
  constructor(private readonly store: UsageStore) {}

  /**
   * Logs a completed LLM request's usage and cost.
   */
  async logUsage(
    request: CompletionRequest,
    response: CompletionResponse,
    provider: string,
    latencyMs: number,
    opts?: { wasFallback?: boolean; primaryProvider?: string },
  ): Promise<void> {
    const costUsd = calculateTotalCost(
      request.model,
      response.usage.promptTokens,
      response.usage.completionTokens,
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
    });
  }
}
