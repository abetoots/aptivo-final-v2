/**
 * P1.5-02: LLM usage log store — drizzle adapter
 * @task P1.5-02
 *
 * implements UsageStore from @aptivo/llm-gateway to persist usage records
 * into the llmUsageLogs table.
 */

import type { DrizzleClient } from './types.js';
import { llmUsageLogs } from '../schema/llm-usage.js';

// -- local types (mirroring @aptivo/llm-gateway UsageStore) --

export interface UsageRecord {
  workflowId?: string;
  workflowStepId?: string;
  domain: string;
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

export interface UsageStore {
  insert(record: UsageRecord): Promise<void>;
}

// -- factory --

export function createDrizzleUsageLogStore(db: DrizzleClient): UsageStore {
  return {
    async insert(record: UsageRecord) {
      await db
        .insert(llmUsageLogs)
        .values({
          workflowId: record.workflowId ?? null,
          workflowStepId: record.workflowStepId ?? null,
          domain: record.domain,
          provider: record.provider,
          model: record.model,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          totalTokens: record.totalTokens,
          costUsd: String(record.costUsd),
          requestType: record.requestType,
          latencyMs: record.latencyMs,
          wasFallback: record.wasFallback,
          primaryProvider: record.primaryProvider ?? null,
        });
    },
  };
}
