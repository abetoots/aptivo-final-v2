/**
 * SP-08: LLM Cost Tracking Spike
 * @spike SP-08
 * @brd BO-CORE-008, BRD §6.9 (Build: Cost Management)
 * @frd FR-CORE-WFE-009 (Cost attribution)
 * @add ADD §3.6 (Cost Tracking)
 * @warnings S7-W17 (unbounded LLM spend), S7-W18 (budget cap boundary)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-08
 */

// spike validation: verify token counting, cost attribution per tenant/workflow,
// and budget enforcement mechanisms

import { Result } from '@aptivo/types';

export const SP_08_CONFIG = {
  name: 'SP-08: LLM Cost Tracking',
  risk: 'HIGH' as const,
  validations: [
    'Token counting accuracy (input/output)',
    'Cost calculation per model',
    'Per-tenant cost attribution',
    'Per-workflow cost attribution',
    'Budget threshold alerts',
    'Hard budget limit enforcement',
  ],
} as const;

// ---------------------------------------------------------------------------
// model pricing
// ---------------------------------------------------------------------------

/** pricing per model for input/output tokens */
export interface ModelPricing {
  modelId: string;
  inputCostPer1k: number;  // cost per 1K input tokens
  outputCostPer1k: number; // cost per 1K output tokens
}

/** registry of known model pricing (simulated, not real-world rates) */
export const MODEL_PRICING = new Map<string, ModelPricing>([
  ['claude-sonnet', { modelId: 'claude-sonnet', inputCostPer1k: 0.003, outputCostPer1k: 0.015 }],
  ['claude-haiku', { modelId: 'claude-haiku', inputCostPer1k: 0.00025, outputCostPer1k: 0.00125 }],
  ['claude-opus', { modelId: 'claude-opus', inputCostPer1k: 0.015, outputCostPer1k: 0.075 }],
  ['gpt-4o', { modelId: 'gpt-4o', inputCostPer1k: 0.005, outputCostPer1k: 0.015 }],
  ['gpt-4o-mini', { modelId: 'gpt-4o-mini', inputCostPer1k: 0.00015, outputCostPer1k: 0.0006 }],
  ['gemini-pro', { modelId: 'gemini-pro', inputCostPer1k: 0.00125, outputCostPer1k: 0.005 }],
]);

// ---------------------------------------------------------------------------
// token counting
// ---------------------------------------------------------------------------

/**
 * Simple whitespace-based token approximation.
 * Splits by spaces/punctuation and multiplies by a subword factor of 1.3
 * to approximate BPE tokenizer behavior.
 */
export function countTokens(text: string): number {
  if (text.length === 0) return 0;

  // split on whitespace and common punctuation boundaries
  const words = text.split(/[\s,.;:!?()[\]{}"'`\-/\\]+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  // multiply by subword factor to approximate BPE tokenization
  const SUBWORD_FACTOR = 1.3;
  return Math.ceil(words.length * SUBWORD_FACTOR);
}

// ---------------------------------------------------------------------------
// cost calculation
// ---------------------------------------------------------------------------

export type CostError = { _tag: 'UnknownModel'; modelId: string };

/**
 * Calculates cost in USD for a given model and token counts.
 * Returns Result.err if the model is not in the pricing registry.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Result<number, CostError> {
  const pricing = MODEL_PRICING.get(modelId);
  if (!pricing) {
    return Result.err({ _tag: 'UnknownModel', modelId });
  }

  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1k;
  return Result.ok(inputCost + outputCost);
}

// ---------------------------------------------------------------------------
// cost ledger
// ---------------------------------------------------------------------------

/** single usage record in the ledger */
export interface UsageRecord {
  tenantId: string;
  workflowId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: Date;
}

/**
 * Tracks spend per tenant and workflow.
 * In production this would be backed by a database; here it's in-memory.
 */
export class CostLedger {
  private readonly records: UsageRecord[] = [];

  /** records a usage entry and returns the calculated cost */
  recordUsage(
    tenantId: string,
    workflowId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): Result<number, CostError> {
    const costResult = calculateCost(modelId, inputTokens, outputTokens);
    if (!costResult.ok) return costResult;

    this.records.push({
      tenantId,
      workflowId,
      modelId,
      inputTokens,
      outputTokens,
      costUsd: costResult.value,
      timestamp: new Date(),
    });

    return Result.ok(costResult.value);
  }

  /** returns total spend across all time for a tenant */
  getTenantSpend(tenantId: string): number {
    return this.records
      .filter((r) => r.tenantId === tenantId)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** returns spend for a specific workflow within a tenant */
  getWorkflowSpend(tenantId: string, workflowId: string): number {
    return this.records
      .filter((r) => r.tenantId === tenantId && r.workflowId === workflowId)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** returns today's spend for a tenant (UTC day boundary) */
  getDailySpend(tenantId: string): number {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    return this.records
      .filter((r) => r.tenantId === tenantId && r.timestamp >= todayStart)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** returns this month's spend for a tenant (UTC month boundary) */
  getMonthlySpend(tenantId: string): number {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    return this.records
      .filter((r) => r.tenantId === tenantId && r.timestamp >= monthStart)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** returns all records (for inspection in tests) */
  getRecords(): readonly UsageRecord[] {
    return this.records;
  }
}

// ---------------------------------------------------------------------------
// budget enforcer
// ---------------------------------------------------------------------------

export type BudgetStatus = 'ok' | 'daily-exceeded' | 'monthly-exceeded';

export type BudgetError =
  | { _tag: 'DailyBudgetExceeded'; currentSpend: number; limit: number }
  | { _tag: 'MonthlyBudgetExceeded'; currentSpend: number; limit: number }
  | { _tag: 'PreRequestDailyExceeded'; projectedSpend: number; limit: number }
  | { _tag: 'PreRequestMonthlyExceeded'; projectedSpend: number; limit: number };

/**
 * Enforces per-tenant budget limits.
 * S7-W18: validates $50 daily / $500 monthly cap boundaries.
 */
export class BudgetEnforcer {
  constructor(
    public readonly dailyLimitUsd: number,
    public readonly monthlyLimitUsd: number,
  ) {}

  /** checks current spend against budget limits */
  checkBudget(tenantId: string, ledger: CostLedger): Result<BudgetStatus, BudgetError> {
    const dailySpend = ledger.getDailySpend(tenantId);
    if (dailySpend >= this.dailyLimitUsd) {
      return Result.err({
        _tag: 'DailyBudgetExceeded',
        currentSpend: dailySpend,
        limit: this.dailyLimitUsd,
      });
    }

    const monthlySpend = ledger.getMonthlySpend(tenantId);
    if (monthlySpend >= this.monthlyLimitUsd) {
      return Result.err({
        _tag: 'MonthlyBudgetExceeded',
        currentSpend: monthlySpend,
        limit: this.monthlyLimitUsd,
      });
    }

    return Result.ok('ok');
  }

  /**
   * Pre-request enforcement: checks if the estimated cost would push
   * spend over budget limits. Fail-closed: blocks the request.
   */
  enforcePreRequest(
    tenantId: string,
    estimatedCostUsd: number,
    ledger: CostLedger,
  ): Result<'approved', BudgetError> {
    const dailySpend = ledger.getDailySpend(tenantId);
    const projectedDaily = dailySpend + estimatedCostUsd;
    if (projectedDaily > this.dailyLimitUsd) {
      return Result.err({
        _tag: 'PreRequestDailyExceeded',
        projectedSpend: projectedDaily,
        limit: this.dailyLimitUsd,
      });
    }

    const monthlySpend = ledger.getMonthlySpend(tenantId);
    const projectedMonthly = monthlySpend + estimatedCostUsd;
    if (projectedMonthly > this.monthlyLimitUsd) {
      return Result.err({
        _tag: 'PreRequestMonthlyExceeded',
        projectedSpend: projectedMonthly,
        limit: this.monthlyLimitUsd,
      });
    }

    return Result.ok('approved');
  }
}

// ---------------------------------------------------------------------------
// stream cost interceptor
// ---------------------------------------------------------------------------

/**
 * Simulates streaming cost monitoring.
 * Tracks accumulated tokens during a stream and can signal termination
 * if the budget is about to be exceeded.
 */
export class StreamCostInterceptor {
  private modelId: string = '';
  private budgetRemainingUsd: number = 0;
  private accumulatedTokens: number = 0;
  private pricing: ModelPricing | null = null;
  private started: boolean = false;

  /** initializes stream monitoring for a given model and remaining budget */
  startStream(
    modelId: string,
    budgetRemainingUsd: number,
  ): Result<void, CostError> {
    const pricing = MODEL_PRICING.get(modelId);
    if (!pricing) {
      return Result.err({ _tag: 'UnknownModel', modelId });
    }

    this.modelId = modelId;
    this.budgetRemainingUsd = budgetRemainingUsd;
    this.accumulatedTokens = 0;
    this.pricing = pricing;
    this.started = true;
    return Result.ok(undefined);
  }

  /** accumulates tokens from a streaming chunk */
  onChunk(tokenCount: number): void {
    this.accumulatedTokens += tokenCount;
  }

  /**
   * Returns true if accumulated cost exceeds the remaining budget.
   * Fail-closed: returns true (terminate) if stream was never started.
   */
  shouldTerminate(): boolean {
    if (!this.started || !this.pricing) return true;

    const currentCost = (this.accumulatedTokens / 1000) * this.pricing.outputCostPer1k;
    return currentCost >= this.budgetRemainingUsd;
  }

  /** returns the total cost of the stream so far */
  getFinalCost(): number {
    if (!this.pricing) return 0;
    return (this.accumulatedTokens / 1000) * this.pricing.outputCostPer1k;
  }

  /** returns accumulated token count */
  getAccumulatedTokens(): number {
    return this.accumulatedTokens;
  }
}
