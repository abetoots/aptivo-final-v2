/**
 * FW-04: Shared Types Package — Errors tests
 * @task FW-04
 */

import { describe, it, expect } from 'vitest';
import {
  validationError,
  notFoundError,
  duplicateError,
  persistenceError,
  networkError,
  timeoutError,
  authorizationError,
} from '../src/errors.js';
import type {
  ValidationError,
  NotFoundError,
  DuplicateError,
  PersistenceError,
  NetworkError,
  TimeoutError,
  AuthorizationError,
  BaseError,
} from '../src/errors.js';

describe('Error factory functions', () => {
  // -------------------------------------------------------------------------
  // validationError
  // -------------------------------------------------------------------------
  describe('validationError', () => {
    it('creates a ValidationError with required fields', () => {
      const err = validationError('email', 'must be a valid email');
      expect(err).toStrictEqual({
        _tag: 'ValidationError',
        field: 'email',
        message: 'must be a valid email',
      });
    });

    it('creates a ValidationError with optional code', () => {
      const err = validationError('age', 'must be >= 18', 'MIN_AGE');
      expect(err).toStrictEqual({
        _tag: 'ValidationError',
        field: 'age',
        message: 'must be >= 18',
        code: 'MIN_AGE',
      });
    });

    it('omits code when undefined', () => {
      const err = validationError('name', 'required');
      expect(err).not.toHaveProperty('code');
    });

    it('has the correct _tag', () => {
      const err = validationError('x', 'y');
      expect(err._tag).toBe('ValidationError');
    });
  });

  // -------------------------------------------------------------------------
  // notFoundError
  // -------------------------------------------------------------------------
  describe('notFoundError', () => {
    it('creates a NotFoundError', () => {
      const err = notFoundError('Candidate', '01HXYZ');
      expect(err).toStrictEqual({
        _tag: 'NotFoundError',
        entity: 'Candidate',
        id: '01HXYZ',
      });
    });

    it('has the correct _tag', () => {
      expect(notFoundError('User', '1')._tag).toBe('NotFoundError');
    });
  });

  // -------------------------------------------------------------------------
  // duplicateError
  // -------------------------------------------------------------------------
  describe('duplicateError', () => {
    it('creates a DuplicateError', () => {
      const err = duplicateError('Candidate', 'email', 'john@example.com');
      expect(err).toStrictEqual({
        _tag: 'DuplicateError',
        entity: 'Candidate',
        field: 'email',
        value: 'john@example.com',
      });
    });

    it('has the correct _tag', () => {
      expect(duplicateError('X', 'Y', 'Z')._tag).toBe('DuplicateError');
    });
  });

  // -------------------------------------------------------------------------
  // persistenceError
  // -------------------------------------------------------------------------
  describe('persistenceError', () => {
    it('creates a PersistenceError for read', () => {
      const cause = new Error('connection refused');
      const err = persistenceError('read', cause);
      expect(err).toStrictEqual({
        _tag: 'PersistenceError',
        operation: 'read',
        cause,
      });
    });

    it('creates a PersistenceError for write', () => {
      const err = persistenceError('write', 'disk full');
      expect(err.operation).toBe('write');
      expect(err.cause).toBe('disk full');
    });

    it('creates a PersistenceError for delete', () => {
      const err = persistenceError('delete', null);
      expect(err.operation).toBe('delete');
      expect(err.cause).toBeNull();
    });

    it('has the correct _tag', () => {
      expect(persistenceError('read', null)._tag).toBe('PersistenceError');
    });
  });

  // -------------------------------------------------------------------------
  // networkError
  // -------------------------------------------------------------------------
  describe('networkError', () => {
    it('creates a NetworkError', () => {
      const cause = new Error('ECONNREFUSED');
      const err = networkError('PaymentGateway', 'charge', cause);
      expect(err).toStrictEqual({
        _tag: 'NetworkError',
        service: 'PaymentGateway',
        operation: 'charge',
        cause,
      });
    });

    it('has the correct _tag', () => {
      expect(networkError('svc', 'op', null)._tag).toBe('NetworkError');
    });
  });

  // -------------------------------------------------------------------------
  // timeoutError
  // -------------------------------------------------------------------------
  describe('timeoutError', () => {
    it('creates a TimeoutError', () => {
      const err = timeoutError('EmailService', 5000);
      expect(err).toStrictEqual({
        _tag: 'TimeoutError',
        service: 'EmailService',
        timeoutMs: 5000,
      });
    });

    it('has the correct _tag', () => {
      expect(timeoutError('svc', 100)._tag).toBe('TimeoutError');
    });

    it('preserves zero timeout', () => {
      expect(timeoutError('svc', 0).timeoutMs).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // authorizationError
  // -------------------------------------------------------------------------
  describe('authorizationError', () => {
    it('creates an AuthorizationError', () => {
      const err = authorizationError('delete', 'Candidate', 'insufficient permissions');
      expect(err).toStrictEqual({
        _tag: 'AuthorizationError',
        action: 'delete',
        resource: 'Candidate',
        reason: 'insufficient permissions',
      });
    });

    it('has the correct _tag', () => {
      expect(authorizationError('a', 'r', 'x')._tag).toBe('AuthorizationError');
    });
  });

  // -------------------------------------------------------------------------
  // BaseError union compatibility
  // -------------------------------------------------------------------------
  describe('BaseError union', () => {
    it('all error types are assignable to BaseError', () => {
      const errors: BaseError[] = [
        validationError('field', 'msg'),
        notFoundError('Entity', '1'),
        duplicateError('Entity', 'field', 'val'),
        persistenceError('read', null),
        networkError('svc', 'op', null),
        timeoutError('svc', 1000),
        authorizationError('act', 'res', 'why'),
      ];

      expect(errors).toHaveLength(7);
      // Verify each has a unique _tag
      const tags = errors.map((e) => e._tag);
      expect(new Set(tags).size).toBe(7);
    });

    it('can be discriminated by _tag in a switch statement', () => {
      const error: BaseError = validationError('email', 'invalid');

      const describe = (e: BaseError): string => {
        switch (e._tag) {
          case 'ValidationError':
            return `validation: ${e.field}`;
          case 'NotFoundError':
            return `not found: ${e.entity}`;
          case 'DuplicateError':
            return `duplicate: ${e.entity}`;
          case 'PersistenceError':
            return `persistence: ${e.operation}`;
          case 'NetworkError':
            return `network: ${e.service}`;
          case 'TimeoutError':
            return `timeout: ${e.service}`;
          case 'AuthorizationError':
            return `authz: ${e.action}`;
        }
      };

      expect(describe(error)).toBe('validation: email');
    });
  });

  // -------------------------------------------------------------------------
  // Type-level checks
  // -------------------------------------------------------------------------
  describe('type compatibility', () => {
    it('factory return types match their respective type aliases', () => {
      const v: ValidationError = validationError('f', 'm');
      const n: NotFoundError = notFoundError('E', '1');
      const d: DuplicateError = duplicateError('E', 'f', 'v');
      const p: PersistenceError = persistenceError('read', null);
      const nw: NetworkError = networkError('s', 'o', null);
      const t: TimeoutError = timeoutError('s', 0);
      const a: AuthorizationError = authorizationError('a', 'r', 'x');

      expect(v._tag).toBe('ValidationError');
      expect(n._tag).toBe('NotFoundError');
      expect(d._tag).toBe('DuplicateError');
      expect(p._tag).toBe('PersistenceError');
      expect(nw._tag).toBe('NetworkError');
      expect(t._tag).toBe('TimeoutError');
      expect(a._tag).toBe('AuthorizationError');
    });
  });
});
