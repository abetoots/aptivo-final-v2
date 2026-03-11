/**
 * LLM-07: Budget Enforcement Service
 * @task LLM-07
 * @spec docs/04-specs/platform-core/llm-gateway.md §4
 * @reuse SP-08 BudgetEnforcer adapted to DB-backed queries
 * @warning S7-W17 unbounded LLM spend, S7-W18 budget cap boundary
 */

import { Result } from '@aptivo/types';
import type { LLMError, Domain } from '../providers/types.js';

// ---------------------------------------------------------------------------
// budget store interface (dependency injection for DB)
// ---------------------------------------------------------------------------

export interface BudgetConfig {
  domain: Domain;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  dailyWarningThreshold: number; // 0.0-1.0, default 0.90
  blockOnExceed: boolean;
}

export interface BudgetStatus {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  warningTriggered: boolean;
}

export interface BudgetStore {
  /** retrieves budget config for a domain */
  getConfig(domain: Domain): Promise<BudgetConfig | null>;
  /** gets today's spend for a domain (UTC day boundary) */
  getDailySpend(domain: Domain): Promise<number>;
  /** gets this month's spend for a domain (UTC month boundary) */
  getMonthlySpend(domain: Domain): Promise<number>;
}

// ---------------------------------------------------------------------------
// budget service
// ---------------------------------------------------------------------------

export class BudgetService {
  constructor(private readonly store: BudgetStore) {}

  /**
   * Checks current spend against budget limits for a domain.
   * Returns budget status or an error if limits are exceeded and blocking is enabled.
   */
  async checkBudget(domain: Domain): Promise<Result<BudgetStatus, LLMError>> {
    const config = await this.store.getConfig(domain);
    if (!config) {
      // fail-closed: no config means no budget, block the request
      return Result.err({
        _tag: 'DailyBudgetExceeded',
        dailyUsed: 0,
        dailyLimit: 0,
      });
    }

    const [dailyUsed, monthlyUsed] = await Promise.all([
      this.store.getDailySpend(domain),
      this.store.getMonthlySpend(domain),
    ]);

    // check daily limit
    if (config.blockOnExceed && dailyUsed >= config.dailyLimitUsd) {
      return Result.err({
        _tag: 'DailyBudgetExceeded',
        dailyUsed,
        dailyLimit: config.dailyLimitUsd,
      });
    }

    // check monthly limit
    if (config.blockOnExceed && monthlyUsed >= config.monthlyLimitUsd) {
      return Result.err({
        _tag: 'MonthlyBudgetExceeded',
        monthlyUsed,
        monthlyLimit: config.monthlyLimitUsd,
      });
    }

    const warningTriggered =
      dailyUsed >= config.dailyLimitUsd * config.dailyWarningThreshold ||
      monthlyUsed >= config.monthlyLimitUsd * config.dailyWarningThreshold;

    return Result.ok({
      dailyUsed,
      dailyLimit: config.dailyLimitUsd,
      monthlyUsed,
      monthlyLimit: config.monthlyLimitUsd,
      warningTriggered,
    });
  }

  /**
   * Pre-request enforcement: checks if the estimated cost would push
   * spend over budget limits. Fail-closed: blocks the request.
   */
  async enforcePreRequest(
    domain: Domain,
    estimatedCostUsd: number,
  ): Promise<Result<BudgetStatus, LLMError>> {
    const config = await this.store.getConfig(domain);
    if (!config) {
      return Result.err({
        _tag: 'DailyBudgetExceeded',
        dailyUsed: 0,
        dailyLimit: 0,
      });
    }

    const [dailyUsed, monthlyUsed] = await Promise.all([
      this.store.getDailySpend(domain),
      this.store.getMonthlySpend(domain),
    ]);

    const projectedDaily = dailyUsed + estimatedCostUsd;
    const projectedMonthly = monthlyUsed + estimatedCostUsd;

    // check daily with projection
    if (config.blockOnExceed && projectedDaily > config.dailyLimitUsd) {
      return Result.err({
        _tag: 'DailyBudgetExceeded',
        dailyUsed: projectedDaily,
        dailyLimit: config.dailyLimitUsd,
      });
    }

    // check monthly with projection
    if (config.blockOnExceed && projectedMonthly > config.monthlyLimitUsd) {
      return Result.err({
        _tag: 'MonthlyBudgetExceeded',
        monthlyUsed: projectedMonthly,
        monthlyLimit: config.monthlyLimitUsd,
      });
    }

    const warningTriggered =
      projectedDaily >= config.dailyLimitUsd * config.dailyWarningThreshold ||
      projectedMonthly >= config.monthlyLimitUsd * config.dailyWarningThreshold;

    return Result.ok({
      dailyUsed,
      dailyLimit: config.dailyLimitUsd,
      monthlyUsed,
      monthlyLimit: config.monthlyLimitUsd,
      warningTriggered,
    });
  }
}
