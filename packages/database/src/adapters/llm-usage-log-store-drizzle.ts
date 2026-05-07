/**
 * P1.5-02: LLM usage log store — drizzle adapter
 * @task P1.5-02
 *
 * implements UsageStore from @aptivo/llm-gateway to persist usage records
 * into the llmUsageLogs table.
 */

import type { DrizzleClient } from './types.js';
import { llmUsageLogs } from '../schema/llm-usage.js';

// S18-C1b: UsageRecord + UsageStore now live in @aptivo/types so the
// gateway and the database adapter share one definition instead of
// mirroring the shape across two packages with drift-risk comments.
// The earlier "DRIFT RISK / S17 task" comment block here documented
// exactly this consolidation as the next step; that step is now done.
// Re-exported for back-compat with anyone who imported from
// '@aptivo/database/adapters'.
export type { UsageRecord, UsageStore } from '@aptivo/types';
import type { UsageRecord, UsageStore } from '@aptivo/types';

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
          departmentId: record.departmentId ?? null,
        });
    },
  };
}
