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
  /**
   * Request type. `safety_inference` added in LLM3-02 for the ML injection
   * classifier so its spend is attributed alongside completion/embedding
   * traffic. The DB column is a varchar(50) with no check constraint — the
   * TS union is the source of truth.
   */
  requestType: 'completion' | 'embedding' | 'vision' | 'safety_inference';
  latencyMs: number;
  wasFallback: boolean;
  primaryProvider?: string;
  /**
   * S17-B1: department attribution. Stamped by the gateway from the
   * resolved actor (`ActorContext.departmentId`). When unset the row
   * goes in unstamped — the column on `llm_usage_logs` is nullable.
   * `DepartmentBudgetService.getSpendReport` reports `coverageLevel:
   * 'none'` for ranges where every row is unstamped.
   */
  departmentId?: string;
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
    opts?: { wasFallback?: boolean; primaryProvider?: string; departmentId?: string },
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
   * `domain` is typed as `string` (not the narrow providers.Domain union)
   * so the safety package's `SafetyInferenceRecord` — which uses `string`
   * for cross-boundary compatibility — can be forwarded without a cast.
   */
  async logSafetyInference(input: {
    domain: string;
    provider: string;
    model: string;
    costUsd: number;
    latencyMs: number;
  }): Promise<void> {
    await this.store.insert({
      // cast at the boundary: `UsageRecord.domain` is the narrow
      // providers.Domain union; the safety package (and the DB column
      // itself) accept any string. The narrow type is a conservative
      // TS-level constraint, not a runtime enforcement.
      domain: input.domain as Domain,
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
