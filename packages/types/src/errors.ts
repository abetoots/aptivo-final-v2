/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §3
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

/** Client-fixable validation errors. */
export type ValidationError = {
  readonly _tag: 'ValidationError';
  readonly field: string;
  readonly message: string;
  readonly code?: string;
};

/** Entity not found. */
export type NotFoundError = {
  readonly _tag: 'NotFoundError';
  readonly entity: string;
  readonly id: string;
};

/** Duplicate / conflict. */
export type DuplicateError = {
  readonly _tag: 'DuplicateError';
  readonly entity: string;
  readonly field: string;
  readonly value: string;
};

/** Database / persistence errors. */
export type PersistenceError = {
  readonly _tag: 'PersistenceError';
  readonly operation: 'read' | 'write' | 'delete';
  readonly cause: unknown;
};

/** External service errors. */
export type NetworkError = {
  readonly _tag: 'NetworkError';
  readonly service: string;
  readonly operation: string;
  readonly cause: unknown;
};

/** Timeout errors. */
export type TimeoutError = {
  readonly _tag: 'TimeoutError';
  readonly service: string;
  readonly timeoutMs: number;
};

/** Authorization errors. */
export type AuthorizationError = {
  readonly _tag: 'AuthorizationError';
  readonly action: string;
  readonly resource: string;
  readonly reason: string;
};

/** Common base error union used across all services. */
export type BaseError =
  | ValidationError
  | NotFoundError
  | DuplicateError
  | PersistenceError
  | NetworkError
  | TimeoutError
  | AuthorizationError;

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** Creates a ValidationError. */
export const validationError = (
  field: string,
  message: string,
  code?: string,
): ValidationError => ({
  _tag: 'ValidationError',
  field,
  message,
  ...(code !== undefined && { code }),
});

/** Creates a NotFoundError. */
export const notFoundError = (entity: string, id: string): NotFoundError => ({
  _tag: 'NotFoundError',
  entity,
  id,
});

/** Creates a DuplicateError. */
export const duplicateError = (
  entity: string,
  field: string,
  value: string,
): DuplicateError => ({
  _tag: 'DuplicateError',
  entity,
  field,
  value,
});

/** Creates a PersistenceError. */
export const persistenceError = (
  operation: 'read' | 'write' | 'delete',
  cause: unknown,
): PersistenceError => ({
  _tag: 'PersistenceError',
  operation,
  cause,
});

/** Creates a NetworkError. */
export const networkError = (
  service: string,
  operation: string,
  cause: unknown,
): NetworkError => ({
  _tag: 'NetworkError',
  service,
  operation,
  cause,
});

/** Creates a TimeoutError. */
export const timeoutError = (
  service: string,
  timeoutMs: number,
): TimeoutError => ({
  _tag: 'TimeoutError',
  service,
  timeoutMs,
});

/** Creates an AuthorizationError. */
export const authorizationError = (
  action: string,
  resource: string,
  reason: string,
): AuthorizationError => ({
  _tag: 'AuthorizationError',
  action,
  resource,
  reason,
});
