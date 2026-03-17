/**
 * HITL-06: Decision Service — barrel export
 * @task HITL-06
 */

export { recordDecision } from './decision-service.js';
export type {
  DecisionStore,
  DecisionEventEmitter,
  DecisionServiceConfig,
  DecisionServiceDeps,
} from './decision-service.js';
export { RecordDecisionInputSchema } from './decision-types.js';
export type {
  RecordDecisionInput,
  RecordDecisionResult,
  HitlDecisionRecord,
  RequestSnapshot,
  ExistingDecision,
  DecisionError,
} from './decision-types.js';

// multi-approver decision service (HITL2-03)
export { createMultiDecisionService } from './multi-decision-service.js';
export type {
  MultiDecisionStoreDeps,
  MultiDecisionServiceDeps,
} from './multi-decision-service.js';
export { RecordMultiApproverDecisionInputSchema } from './multi-decision-types.js';
export type {
  RecordMultiApproverDecisionInput,
  MultiDecisionResult,
  MultiDecisionError,
} from './multi-decision-types.js';
