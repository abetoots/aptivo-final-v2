/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §4
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

import type { BaseError } from './errors.js';

/**
 * RFC 7807 Problem Details response format.
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly field?: string;
  readonly entity?: string;
}

/** Error type URI constants (relative to API base). */
export const ERROR_TYPES = {
  VALIDATION: '/errors/validation',
  NOT_FOUND: '/errors/not-found',
  DUPLICATE: '/errors/duplicate',
  INTERNAL: '/errors/internal',
  NETWORK: '/errors/external-service',
  TIMEOUT: '/errors/timeout',
  UNAUTHORIZED: '/errors/unauthorized',
  FORBIDDEN: '/errors/forbidden',
} as const;

/**
 * Maps a BaseError to an RFC 7807 ProblemDetails object.
 *
 * @param error - The domain error to map
 * @param traceId - Optional correlation / trace ID for debugging
 * @returns A ProblemDetails object suitable for HTTP responses
 */
export const toProblemDetails = (
  error: BaseError,
  traceId?: string,
): ProblemDetails => {
  switch (error._tag) {
    case 'ValidationError':
      return {
        type: ERROR_TYPES.VALIDATION,
        title: 'Validation Error',
        status: 400,
        detail: error.message,
        field: error.field,
        ...(traceId !== undefined && { traceId }),
      };

    case 'NotFoundError':
      return {
        type: ERROR_TYPES.NOT_FOUND,
        title: 'Not Found',
        status: 404,
        detail: `${error.entity} with id '${error.id}' not found`,
        entity: error.entity,
        instance: `/${error.entity}/${error.id}`,
        ...(traceId !== undefined && { traceId }),
      };

    case 'DuplicateError':
      return {
        type: ERROR_TYPES.DUPLICATE,
        title: 'Conflict',
        status: 409,
        detail: `${error.entity} with ${error.field} '${error.value}' already exists`,
        ...(traceId !== undefined && { traceId }),
      };

    case 'PersistenceError':
      return {
        type: ERROR_TYPES.INTERNAL,
        title: 'Internal Server Error',
        status: 500,
        ...(traceId !== undefined && { traceId }),
      };

    case 'NetworkError':
      return {
        type: ERROR_TYPES.NETWORK,
        title: 'Bad Gateway',
        status: 502,
        detail: `External service '${error.service}' failed during '${error.operation}'`,
        ...(traceId !== undefined && { traceId }),
      };

    case 'TimeoutError':
      return {
        type: ERROR_TYPES.TIMEOUT,
        title: 'Gateway Timeout',
        status: 504,
        detail: `Service '${error.service}' timed out after ${String(error.timeoutMs)}ms`,
        ...(traceId !== undefined && { traceId }),
      };

    case 'AuthorizationError':
      return {
        type: ERROR_TYPES.FORBIDDEN,
        title: 'Forbidden',
        status: 403,
        detail: `Cannot ${error.action} on ${error.resource}: ${error.reason}`,
        ...(traceId !== undefined && { traceId }),
      };
  }
};
