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
//
// DRIFT RISK: this interface is intentionally duplicated from
// `packages/llm-gateway/src/usage/usage-logger.ts` so the database
// package doesn't depend on llm-gateway (architectural layering:
// database is a leaf of domain packages). Any widening of the
// gateway's `requestType` union (e.g. adding 'safety_inference' in
// LLM3-02) must be mirrored here manually.
//
// S17 task: move `UsageRecord` to `@aptivo/types` so one definition
// serves both sides. Until then, any PR that touches the gateway's
// UsageRecord must also touch this file.

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
  // 'safety_inference' added in LLM3-02 for the ML injection classifier so
  // its spend is attributed alongside completion/embedding traffic. The DB
  // column is varchar(50) with no check constraint — TS union is authoritative.
  requestType: 'completion' | 'embedding' | 'vision' | 'safety_inference';
  latencyMs: number;
  wasFallback: boolean;
  primaryProvider?: string;
  // S17-B1: department attribution. Mirrors the gateway's UsageRecord
  // field (full @aptivo/types consolidation remains an S18 refactor).
  // Column on llm_usage_logs is nullable; unstamped rows write null.
  departmentId?: string;
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
          departmentId: record.departmentId ?? null,
        });
    },
  };
}
