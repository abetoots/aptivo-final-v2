/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §2-5
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

// Result type and helpers
export { Result } from './result.js';
export type { Success, Failure, Result as ResultType } from './result.js';

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
