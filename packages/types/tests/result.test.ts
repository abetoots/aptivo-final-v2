/**
 * FW-04: Shared Types Package — Result tests
 * @task FW-04
 */

import { describe, it, expect } from 'vitest';
import { Result } from '../src/result.js';
import type { Success, Failure, Result as ResultType } from '../src/result.js';

describe('Result', () => {
  // -------------------------------------------------------------------------
  // Result.ok
  // -------------------------------------------------------------------------
  describe('ok', () => {
    it('creates a Success with ok: true and the given value', () => {
      const result = Result.ok(42);
      expect(result).toStrictEqual({ ok: true, value: 42 });
    });

    it('works with string values', () => {
      const result = Result.ok('hello');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('works with object values', () => {
      const obj = { name: 'Alice', age: 30 };
      const result = Result.ok(obj);
      expect(result.ok).toBe(true);
      expect(result.value).toStrictEqual(obj);
    });

    it('works with null', () => {
      const result = Result.ok(null);
      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();
    });

    it('works with undefined', () => {
      const result = Result.ok(undefined);
      expect(result.ok).toBe(true);
      expect(result.value).toBeUndefined();
    });

    it('works with arrays', () => {
      const result = Result.ok([1, 2, 3]);
      expect(result.ok).toBe(true);
      expect(result.value).toStrictEqual([1, 2, 3]);
    });

    it('works with boolean false (falsy value)', () => {
      const result = Result.ok(false);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(false);
    });

    it('works with zero (falsy value)', () => {
      const result = Result.ok(0);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(0);
    });

    it('works with empty string (falsy value)', () => {
      const result = Result.ok('');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Result.err
  // -------------------------------------------------------------------------
  describe('err', () => {
    it('creates a Failure with ok: false and the given error', () => {
      const result = Result.err('something went wrong');
      expect(result).toStrictEqual({ ok: false, error: 'something went wrong' });
    });

    it('works with object errors', () => {
      const error = { _tag: 'NotFoundError' as const, entity: 'User', id: '123' };
      const result = Result.err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toStrictEqual(error);
    });

    it('works with Error instances', () => {
      const error = new Error('boom');
      const result = Result.err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });

    it('works with null errors', () => {
      const result = Result.err(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeNull();
    });

    it('works with numeric error codes', () => {
      const result = Result.err(404);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Result.isOk
  // -------------------------------------------------------------------------
  describe('isOk', () => {
    it('returns true for a Success result', () => {
      const result: ResultType<number, string> = Result.ok(42);
      expect(Result.isOk(result)).toBe(true);
    });

    it('returns false for a Failure result', () => {
      const result: ResultType<number, string> = Result.err('error');
      expect(Result.isOk(result)).toBe(false);
    });

    it('narrows the type so value is accessible', () => {
      const result: ResultType<string, Error> = Result.ok('data');
      if (Result.isOk(result)) {
        // TypeScript should allow accessing .value here
        expect(result.value).toBe('data');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Result.isErr
  // -------------------------------------------------------------------------
  describe('isErr', () => {
    it('returns true for a Failure result', () => {
      const result: ResultType<number, string> = Result.err('error');
      expect(Result.isErr(result)).toBe(true);
    });

    it('returns false for a Success result', () => {
      const result: ResultType<number, string> = Result.ok(42);
      expect(Result.isErr(result)).toBe(false);
    });

    it('narrows the type so error is accessible', () => {
      const result: ResultType<string, { code: number }> = Result.err({ code: 500 });
      if (Result.isErr(result)) {
        // TypeScript should allow accessing .error here
        expect(result.error.code).toBe(500);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Discriminated union usage
  // -------------------------------------------------------------------------
  describe('discriminated union pattern', () => {
    it('allows switching on ok to determine the variant', () => {
      const success: ResultType<number, string> = Result.ok(10);
      const failure: ResultType<number, string> = Result.err('fail');

      const handleResult = (r: ResultType<number, string>): string => {
        if (r.ok) {
          return `value: ${String(r.value)}`;
        }
        return `error: ${r.error}`;
      };

      expect(handleResult(success)).toBe('value: 10');
      expect(handleResult(failure)).toBe('error: fail');
    });
  });

  // -------------------------------------------------------------------------
  // Type-level checks (ensure the exported types match expected shapes)
  // -------------------------------------------------------------------------
  describe('type compatibility', () => {
    it('Success satisfies the expected shape', () => {
      const s: Success<number> = { ok: true, value: 99 };
      expect(s.ok).toBe(true);
      expect(s.value).toBe(99);
    });

    it('Failure satisfies the expected shape', () => {
      const f: Failure<string> = { ok: false, error: 'oops' };
      expect(f.ok).toBe(false);
      expect(f.error).toBe('oops');
    });
  });
});
