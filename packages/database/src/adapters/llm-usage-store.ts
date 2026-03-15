/**
 * S7-INT-03: LLM usage aggregation store
 * @task S7-INT-03
 * @warning S2-W12
 */

import { sql, and, gte, eq } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { llmUsageLogs } from '../schema/llm-usage.js';

// -- types --

export interface CostByDomain {
  domain: string;
  totalCost: string;
  requestCount: number;
}

export interface CostByProvider {
  provider: string;
  model: string;
  totalCost: string;
  requestCount: number;
}

export interface DailyTotal {
  date: string;
  totalCost: string;
  requestCount: number;
}

export interface BudgetStatus {
  dailySpend: string;
  monthlySpend: string;
  alertDomains: string[]; // domains exceeding $5/day
}

export interface LlmUsageStore {
  getCostByDomain(windowMs: number): Promise<CostByDomain[]>;
  getCostByProvider(windowMs: number): Promise<CostByProvider[]>;
  getDailyTotals(days: number): Promise<DailyTotal[]>;
  getDailySpend(): Promise<string>;
  getMonthlySpend(): Promise<string>;
  getDomainDailySpend(domain: string): Promise<string>;
  getAlertDomains(thresholdUsd: number): Promise<string[]>;
}

// -- factory --

export function createDrizzleLlmUsageStore(db: DrizzleClient): LlmUsageStore {
  return {
    async getCostByDomain(windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({
          domain: llmUsageLogs.domain,
          totalCost: sql<string>`sum(${llmUsageLogs.costUsd})::text`,
          requestCount: sql<number>`count(*)::int`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, cutoff))
        .groupBy(llmUsageLogs.domain);
      return rows.map((r: { domain: string; totalCost: string | null; requestCount: number | null }) => ({
        domain: r.domain,
        totalCost: r.totalCost ?? '0',
        requestCount: r.requestCount ?? 0,
      }));
    },

    async getCostByProvider(windowMs) {
      const cutoff = new Date(Date.now() - windowMs);
      const rows = await db
        .select({
          provider: llmUsageLogs.provider,
          model: llmUsageLogs.model,
          totalCost: sql<string>`sum(${llmUsageLogs.costUsd})::text`,
          requestCount: sql<number>`count(*)::int`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, cutoff))
        .groupBy(llmUsageLogs.provider, llmUsageLogs.model);
      return rows.map((r: { provider: string; model: string; totalCost: string | null; requestCount: number | null }) => ({
        provider: r.provider,
        model: r.model,
        totalCost: r.totalCost ?? '0',
        requestCount: r.requestCount ?? 0,
      }));
    },

    async getDailyTotals(days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          date: sql<string>`date(${llmUsageLogs.timestamp})::text`,
          totalCost: sql<string>`sum(${llmUsageLogs.costUsd})::text`,
          requestCount: sql<number>`count(*)::int`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, cutoff))
        .groupBy(sql`date(${llmUsageLogs.timestamp})`)
        .orderBy(sql`date(${llmUsageLogs.timestamp})`);
      return rows.map((r: { date: string | null; totalCost: string | null; requestCount: number | null }) => ({
        date: r.date ?? '',
        totalCost: r.totalCost ?? '0',
        requestCount: r.requestCount ?? 0,
      }));
    },

    async getDailySpend() {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          total: sql<string>`coalesce(sum(${llmUsageLogs.costUsd}), 0)::text`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, startOfDay));
      return rows[0]?.total ?? '0';
    },

    async getMonthlySpend() {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          total: sql<string>`coalesce(sum(${llmUsageLogs.costUsd}), 0)::text`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, startOfMonth));
      return rows[0]?.total ?? '0';
    },

    async getDomainDailySpend(domain) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          total: sql<string>`coalesce(sum(${llmUsageLogs.costUsd}), 0)::text`,
        })
        .from(llmUsageLogs)
        .where(and(
          eq(llmUsageLogs.domain, domain),
          gte(llmUsageLogs.timestamp, startOfDay),
        ));
      return rows[0]?.total ?? '0';
    },

    async getAlertDomains(thresholdUsd) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          domain: llmUsageLogs.domain,
          total: sql<string>`sum(${llmUsageLogs.costUsd})::text`,
        })
        .from(llmUsageLogs)
        .where(gte(llmUsageLogs.timestamp, startOfDay))
        .groupBy(llmUsageLogs.domain)
        .having(sql`sum(${llmUsageLogs.costUsd}) > ${thresholdUsd}`);
      return rows.map((r: { domain: string; total: string | null }) => r.domain);
    },
  };
}
