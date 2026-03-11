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
