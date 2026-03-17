/**
 * HITL-07: Workflow Integration — barrel export
 * @task HITL-07
 */

export { createHitlApprovalFunction } from './hitl-step.js';
export type { HitlWorkflowDeps, HitlWorkflowConfig } from './hitl-step.js';

export { HITL_EVENTS, ORCHESTRATION_EVENTS } from './event-schemas.js';
export type {
  HitlApprovalRequestData,
  HitlDecisionRecordedData,
  HitlChangesRequestedData,
  HitlApprovalResult,
} from './event-schemas.js';

// HITL2-06: parent/child workflow orchestration
export { createWorkflowOrchestrator } from './orchestrator.js';
export type { EventSender, WorkflowStep, WorkflowOrchestratorDeps } from './orchestrator.js';
export {
  ChildSpawnedEventSchema,
  ChildCompletedEventSchema,
} from './orchestrator-types.js';
export type {
  ChildSpawnedEvent,
  ChildCompletedEvent,
  OrchestratorConfig,
  ChildResult,
  OrchestrationResult,
  OrchestratorError,
} from './orchestrator-types.js';
