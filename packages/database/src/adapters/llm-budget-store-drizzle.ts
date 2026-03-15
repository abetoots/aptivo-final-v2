/**
 * P1.5-02: LLM budget store — drizzle adapter
 * @task P1.5-02
 *
 * implements BudgetStore from @aptivo/llm-gateway using drizzle queries
 * against llmBudgetConfigs and llmUsageLogs tables.
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { llmBudgetConfigs } from '../schema/llm-budget-configs.js';
import { llmUsageLogs } from '../schema/llm-usage.js';

// -- local types (mirroring @aptivo/llm-gateway BudgetStore) --

type Domain = 'crypto' | 'hr' | 'core';

export interface BudgetConfig {
  domain: Domain;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  dailyWarningThreshold: number;
  blockOnExceed: boolean;
}

export interface BudgetStore {
  getConfig(domain: Domain): Promise<BudgetConfig | null>;
  getDailySpend(domain: Domain): Promise<number>;
  getMonthlySpend(domain: Domain): Promise<number>;
}

// -- factory --

export function createDrizzleBudgetStore(db: DrizzleClient): BudgetStore {
  return {
    async getConfig(domain: Domain) {
      const rows = await db
        .select()
        .from(llmBudgetConfigs)
        .where(eq(llmBudgetConfigs.domain, domain))
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      // numeric columns come back as strings from drizzle — convert with Number()
      return {
        domain: row.domain as Domain,
        dailyLimitUsd: Number(row.dailyLimitUsd),
        monthlyLimitUsd: Number(row.monthlyLimitUsd),
        dailyWarningThreshold: Number(row.dailyWarningThreshold),
        blockOnExceed: row.blockOnExceed ?? true,
      };
    },

    async getDailySpend(domain: Domain) {
      // use gte (>=) not gt (>) for time boundaries — P1.5-09 fix
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const rows = await db
        .select({
          total: sql<string>`coalesce(sum(${llmUsageLogs.costUsd}), 0)`,
        })
        .from(llmUsageLogs)
        .where(
          and(
            eq(llmUsageLogs.domain, domain),
            gte(llmUsageLogs.timestamp, startOfDay),
          ),
        );

      return Number(rows[0]?.total ?? 0);
    },

    async getMonthlySpend(domain: Domain) {
      // use gte (>=) not gt (>) for time boundaries — P1.5-09 fix
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      const rows = await db
        .select({
          total: sql<string>`coalesce(sum(${llmUsageLogs.costUsd}), 0)`,
        })
        .from(llmUsageLogs)
        .where(
          and(
            eq(llmUsageLogs.domain, domain),
            gte(llmUsageLogs.timestamp, startOfMonth),
          ),
        );

      return Number(rows[0]?.total ?? 0);
    },
  };
}
