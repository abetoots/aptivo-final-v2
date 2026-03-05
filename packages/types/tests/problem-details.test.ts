/**
 * FW-04: Shared Types Package — ProblemDetails tests
 * @task FW-04
 */

import { describe, it, expect } from 'vitest';
import { toProblemDetails, ERROR_TYPES } from '../src/problem-details.js';
import type { ProblemDetails } from '../src/problem-details.js';
import {
  validationError,
  notFoundError,
  duplicateError,
  persistenceError,
  networkError,
  timeoutError,
  authorizationError,
} from '../src/errors.js';

describe('ERROR_TYPES', () => {
  it('contains all expected error type URIs', () => {
    expect(ERROR_TYPES).toStrictEqual({
      VALIDATION: '/errors/validation',
      NOT_FOUND: '/errors/not-found',
      DUPLICATE: '/errors/duplicate',
      INTERNAL: '/errors/internal',
      NETWORK: '/errors/external-service',
      TIMEOUT: '/errors/timeout',
      UNAUTHORIZED: '/errors/unauthorized',
      FORBIDDEN: '/errors/forbidden',
    });
  });
});

describe('toProblemDetails', () => {
  // -------------------------------------------------------------------------
  // ValidationError
  // -------------------------------------------------------------------------
  describe('ValidationError mapping', () => {
    it('maps to status 400 with field and detail', () => {
      const error = validationError('email', 'must be a valid email');
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.VALIDATION);
      expect(pd.title).toBe('Validation Error');
      expect(pd.status).toBe(400);
      expect(pd.detail).toBe('must be a valid email');
      expect(pd.field).toBe('email');
    });

    it('includes traceId when provided', () => {
      const error = validationError('name', 'required');
      const pd = toProblemDetails(error, 'trace-123');

      expect(pd.traceId).toBe('trace-123');
    });

    it('omits traceId when not provided', () => {
      const error = validationError('name', 'required');
      const pd = toProblemDetails(error);

      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // NotFoundError
  // -------------------------------------------------------------------------
  describe('NotFoundError mapping', () => {
    it('maps to status 404 with entity and instance', () => {
      const error = notFoundError('Candidate', '01HXYZ');
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.NOT_FOUND);
      expect(pd.title).toBe('Not Found');
      expect(pd.status).toBe(404);
      expect(pd.detail).toBe("Candidate with id '01HXYZ' not found");
      expect(pd.entity).toBe('Candidate');
      expect(pd.instance).toBe('/Candidate/01HXYZ');
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(notFoundError('User', '1'), 'trace-456');
      expect(pd.traceId).toBe('trace-456');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(notFoundError('User', '1'));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // DuplicateError
  // -------------------------------------------------------------------------
  describe('DuplicateError mapping', () => {
    it('maps to status 409 with detail', () => {
      const error = duplicateError('Candidate', 'email', 'john@example.com');
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.DUPLICATE);
      expect(pd.title).toBe('Conflict');
      expect(pd.status).toBe(409);
      expect(pd.detail).toBe("Candidate with email 'john@example.com' already exists");
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(duplicateError('E', 'f', 'v'), 'trace-789');
      expect(pd.traceId).toBe('trace-789');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(duplicateError('E', 'f', 'v'));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // PersistenceError
  // -------------------------------------------------------------------------
  describe('PersistenceError mapping', () => {
    it('maps to status 500 without exposing internal details', () => {
      const error = persistenceError('write', new Error('connection reset'));
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.INTERNAL);
      expect(pd.title).toBe('Internal Server Error');
      expect(pd.status).toBe(500);
      // Must NOT expose the underlying cause
      expect(pd.detail).toBeUndefined();
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(persistenceError('read', null), 'trace-abc');
      expect(pd.traceId).toBe('trace-abc');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(persistenceError('read', null));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // NetworkError
  // -------------------------------------------------------------------------
  describe('NetworkError mapping', () => {
    it('maps to status 502 with service detail', () => {
      const error = networkError('PaymentGateway', 'charge', new Error('timeout'));
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.NETWORK);
      expect(pd.title).toBe('Bad Gateway');
      expect(pd.status).toBe(502);
      expect(pd.detail).toBe("External service 'PaymentGateway' failed during 'charge'");
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(networkError('svc', 'op', null), 'trace-net');
      expect(pd.traceId).toBe('trace-net');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(networkError('svc', 'op', null));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // TimeoutError
  // -------------------------------------------------------------------------
  describe('TimeoutError mapping', () => {
    it('maps to status 504 with timeout detail', () => {
      const error = timeoutError('EmailService', 5000);
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.TIMEOUT);
      expect(pd.title).toBe('Gateway Timeout');
      expect(pd.status).toBe(504);
      expect(pd.detail).toBe("Service 'EmailService' timed out after 5000ms");
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(timeoutError('svc', 100), 'trace-to');
      expect(pd.traceId).toBe('trace-to');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(timeoutError('svc', 100));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // AuthorizationError
  // -------------------------------------------------------------------------
  describe('AuthorizationError mapping', () => {
    it('maps to status 403 with action detail', () => {
      const error = authorizationError('delete', 'Candidate', 'insufficient permissions');
      const pd = toProblemDetails(error);

      expect(pd.type).toBe(ERROR_TYPES.FORBIDDEN);
      expect(pd.title).toBe('Forbidden');
      expect(pd.status).toBe(403);
      expect(pd.detail).toBe('Cannot delete on Candidate: insufficient permissions');
    });

    it('includes traceId when provided', () => {
      const pd = toProblemDetails(authorizationError('a', 'r', 'x'), 'trace-auth');
      expect(pd.traceId).toBe('trace-auth');
    });

    it('omits traceId when not provided', () => {
      const pd = toProblemDetails(authorizationError('a', 'r', 'x'));
      expect(pd).not.toHaveProperty('traceId');
    });
  });

  // -------------------------------------------------------------------------
  // ProblemDetails interface compliance
  // -------------------------------------------------------------------------
  describe('ProblemDetails structure', () => {
    it('always returns type, title, and status', () => {
      const allErrors = [
        validationError('f', 'm'),
        notFoundError('E', '1'),
        duplicateError('E', 'f', 'v'),
        persistenceError('read', null),
        networkError('s', 'o', null),
        timeoutError('s', 1000),
        authorizationError('a', 'r', 'x'),
      ] as const;

      for (const error of allErrors) {
        const pd: ProblemDetails = toProblemDetails(error);
        expect(pd.type).toBeTruthy();
        expect(pd.title).toBeTruthy();
        expect(typeof pd.status).toBe('number');
        expect(pd.status).toBeGreaterThanOrEqual(400);
        expect(pd.status).toBeLessThan(600);
      }
    });
  });
});
