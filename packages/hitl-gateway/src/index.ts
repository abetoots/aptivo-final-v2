/**
 * @aptivo/hitl-gateway — HITL approval subsystem
 *
 * Provides:
 * - JWT token security (SP-11/HITL-03/04)
 * - Event authenticity (SP-14)
 * - Pluggable replay stores (CF-03)
 * - Request creation service (HITL-05)
 * - Decision recording service (HITL-06)
 * - Novu notification adapter (HITL-08)
 * - RBAC middleware (ID-02)
 * - Session revocation (HITL-11)
 *
 * @see docs/06-sprints/sprint-2-plan.md
 */

// tokens
export {
  generateHitlToken,
  verifyHitlToken,
  hashToken,
  clearJtiStore,
} from './tokens/index.js';

export type {
  HitlTokenPayload,
  TokenGenerationOptions,
  TokenGenerationResult,
  TokenRejectionReason,
  VerifyOptions,
} from './tokens/index.js';

// events
export {
  signEvent,
  verifyEventSignature,
  verifyEventSignatureAsync,
  clearNonceStore,
} from './events/index.js';

export type { SignedEvent, RejectionReason } from './events/index.js';

// replay stores (CF-03)
export type { ReplayStore, ClaimResult } from './replay/index.js';
export { InMemoryReplayStore } from './replay/index.js';
export { RedisReplayStore, type RedisClient } from './replay/index.js';

// request service (HITL-05)
export { createRequest } from './request/index.js';
export { CreateRequestInputSchema } from './request/index.js';
export type {
  RequestStore,
  RequestServiceConfig,
  RequestServiceDeps,
  CreateRequestInput,
  CreateRequestResult,
  HitlRequestRecord,
  RequestError,
} from './request/index.js';

// multi-approver request service (HITL2-02)
export { createMultiApproverRequestService } from './request/index.js';
export { CreateMultiApproverRequestInputSchema } from './request/index.js';
export type {
  MultiRequestServiceDeps,
  CreateMultiApproverRequestInput,
  ApproverTokenResult,
  MultiApproverRequestResult,
  MultiRequestError,
  HitlRequestTokenRecord,
  RequestTokenStore,
} from './request/index.js';

// resubmit service (HITL2-05)
export { createResubmitService } from './request/index.js';
export type {
  ResubmitError,
  ResubmitResult,
  ResubmitStoreDeps,
  ResubmitServiceDeps,
} from './request/index.js';

// decision service (HITL-06)
export { recordDecision } from './decision/index.js';
export { RecordDecisionInputSchema } from './decision/index.js';
export type {
  DecisionStore,
  DecisionEventEmitter,
  DecisionServiceConfig,
  DecisionServiceDeps,
  RecordDecisionInput,
  RecordDecisionResult,
  HitlDecisionRecord,
  RequestSnapshot,
  ExistingDecision,
  DecisionError,
} from './decision/index.js';

// multi-approver decision service (HITL2-03)
export { createMultiDecisionService } from './decision/index.js';
export { RecordMultiApproverDecisionInputSchema } from './decision/index.js';
export type {
  MultiDecisionStoreDeps,
  MultiDecisionServiceDeps,
  RecordMultiApproverDecisionInput,
  MultiDecisionResult,
  MultiDecisionError,
} from './decision/index.js';

// workflow integration (HITL-07)
export { createHitlApprovalFunction } from './workflow/index.js';
export { HITL_EVENTS } from './workflow/index.js';
export type {
  HitlWorkflowDeps,
  HitlWorkflowConfig,
  HitlApprovalRequestData,
  HitlDecisionRecordedData,
  HitlChangesRequestedData,
  HitlApprovalResult,
} from './workflow/index.js';

// parent/child workflow orchestration (HITL2-06)
export { createWorkflowOrchestrator, ORCHESTRATION_EVENTS } from './workflow/index.js';
export { ChildSpawnedEventSchema, ChildCompletedEventSchema } from './workflow/index.js';
export type {
  EventSender,
  WorkflowStep,
  WorkflowOrchestratorDeps,
  ChildSpawnedEvent,
  ChildCompletedEvent,
  OrchestratorConfig,
  ChildResult,
  OrchestrationResult,
  OrchestratorError,
} from './workflow/index.js';

// notifications (HITL-08)
export { sendApprovalNotification, createSendNotification } from './notifications/index.js';
export { DEFAULT_NOTIFICATION_CONFIG } from './notifications/index.js';
export type {
  NovuClient,
  NovuTriggerPayload,
  NovuTriggerResult,
  ApprovalNotificationParams,
  NotificationError,
  NotificationAdapterConfig,
} from './notifications/index.js';

// approval policy (HITL2-01)
export { ApprovalPolicyType, ApprovalPolicySchema, EscalationPolicySchema } from './policy/index.js';
export type {
  ApprovalPolicy,
  EscalationPolicy,
  ApprovalPolicyRecord,
  ApprovalPolicyStore,
} from './policy/index.js';

// quorum engine (HITL2-03)
export { createQuorumEngine } from './policy/index.js';
export type { QuorumResult, QuorumError, DecisionRecord } from './policy/index.js';

// sequential chain runner (HITL2-04)
export { createSequentialChainRunner } from './policy/index.js';
export type { ChainDecisionRecord, ChainState, ChainError } from './policy/index.js';

// rbac middleware (ID-02)
export { RbacService } from './auth/index.js';
export { DEFAULT_RBAC_CONFIG } from './auth/index.js';
export type {
  RbacStore,
  RbacConfig,
  AuthzResult,
  RoleRecord,
  RolePermissionRecord,
} from './auth/index.js';

// session revocation (HITL-11)
export { revokeSession, isSessionRevoked } from './auth/index.js';
export type {
  SessionStore,
  RevocationError,
  RevokeSessionInput,
  RevokeSessionResult,
} from './auth/index.js';
