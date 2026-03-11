/**
 * HITL-07: Workflow Integration — barrel export
 * @task HITL-07
 */

export { createHitlApprovalFunction } from './hitl-step.js';
export type { HitlWorkflowDeps, HitlWorkflowConfig } from './hitl-step.js';

export { HITL_EVENTS } from './event-schemas.js';
export type {
  HitlApprovalRequestData,
  HitlDecisionRecordedData,
  HitlApprovalResult,
} from './event-schemas.js';
