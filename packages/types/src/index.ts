/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §2-5
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

// Result type and helpers
export { Result } from './result.js';
export type { Success, Failure, Result as ResultType } from './result.js';

// WFE3-02: WebSocket protocol contract (shared between apps/ws-server and
// any UI consumer). Zod frame schemas + close-code enum.
export * from './websocket-events.js';

// S17-CT-1: ticket lifecycle Inngest event schemas (Epic 4)
export * from './events/ticket.js';

// Tagged union error types and factory functions
export type {
  ValidationError,
  NotFoundError,
  DuplicateError,
  PersistenceError,
  NetworkError,
  TimeoutError,
  AuthorizationError,
  BaseError,
} from './errors.js';
export {
  validationError,
  notFoundError,
  duplicateError,
  persistenceError,
  networkError,
  timeoutError,
  authorizationError,
} from './errors.js';

// RFC 7807 Problem Details
export type { ProblemDetails } from './problem-details.js';
export { ERROR_TYPES, toProblemDetails } from './problem-details.js';

// Event envelope schema
export { EventEnvelopeSchema } from './schemas/event-envelope.js';
export type { EventEnvelope } from './schemas/event-envelope.js';

// S18-A1: centralized ActorType literal — emit-side (workflow audit calls)
// and query-side (audit aggregate / anomaly gate) share one source of truth
export { ACTOR_TYPES } from './actor.js';
export type { ActorType } from './actor.js';

// S18-A1: centralized HITL decision-event payload — replaces ad-hoc
// `as` casts across the workflow tree (3 sites at last count) with one
// canonical shape; `approverId` is what the audit-emitter migration
// uses to populate audit_logs.user_id.
export { HITL_DECISION_VALUES } from './events/hitl.js';
export type { HitlDecision, HitlDecisionPayload } from './events/hitl.js';

// Auth types (ID2-02: shared across OIDC + SAML adapters)
export { ClaimMappingSchema, SamlAssertionSchema } from './auth.js';
export type {
  ClaimMapping,
  ClaimMappingConfig,
  SamlAssertion,
  SamlError,
  SamlLoginResult,
  SamlMetadata,
  SamlAdapter,
} from './auth.js';
