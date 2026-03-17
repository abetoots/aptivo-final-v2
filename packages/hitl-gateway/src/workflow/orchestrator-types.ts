/**
 * HITL2-06: Parent/Child Workflow Orchestration Types
 * @task HITL2-06
 *
 * type definitions for parent/child workflow coordination via Inngest.
 * decoupled from Inngest internals — uses abstract interfaces.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// child lifecycle event schemas
// ---------------------------------------------------------------------------

export const ChildSpawnedEventSchema = z.object({
  parentWorkflowId: z.string().min(1),
  childWorkflowId: z.string().min(1),
  childEventName: z.string().min(1),
  spawnedAt: z.string(), // iso timestamp
});

export const ChildCompletedEventSchema = z.object({
  parentWorkflowId: z.string().min(1),
  childWorkflowId: z.string().min(1),
  result: z.unknown(), // child's return value
  completedAt: z.string(), // iso timestamp
});

export type ChildSpawnedEvent = z.infer<typeof ChildSpawnedEventSchema>;
export type ChildCompletedEvent = z.infer<typeof ChildCompletedEventSchema>;

// ---------------------------------------------------------------------------
// orchestrator config
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  parentWorkflowId: string;
  childTimeout: string; // inngest duration string, e.g., '30m'
}

// ---------------------------------------------------------------------------
// child result (per child)
// ---------------------------------------------------------------------------

export interface ChildResult {
  childWorkflowId: string;
  status: 'completed' | 'timed_out';
  result?: unknown;
}

// ---------------------------------------------------------------------------
// orchestration result (aggregate)
// ---------------------------------------------------------------------------

export interface OrchestrationResult {
  parentWorkflowId: string;
  children: ChildResult[];
  allCompleted: boolean;
  completedCount: number;
  timedOutCount: number;
}

// ---------------------------------------------------------------------------
// orchestrator errors
// ---------------------------------------------------------------------------

export type OrchestratorError =
  | { readonly _tag: 'OrchestratorSpawnError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'OrchestratorTimeoutError'; readonly parentWorkflowId: string; readonly timedOutChildren: string[] }
  | { readonly _tag: 'OrchestratorError'; readonly message: string; readonly cause: unknown };
