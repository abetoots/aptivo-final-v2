/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §2
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

/**
 * Represents a successful outcome containing a value of type T.
 */
export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Represents a failed outcome containing an error of type E.
 */
export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Discriminated union result type for explicit error handling.
 * All service operations return this type instead of throwing exceptions.
 */
export type Result<T, E> = Success<T> | Failure<E>;

/**
 * Creates a successful Result containing the given value.
 *
 * @param value - The success value
 * @returns A Success result
 */
const ok = <T>(value: T): Success<T> => ({ ok: true, value });

/**
 * Creates a failed Result containing the given error.
 *
 * @param error - The error value
 * @returns A Failure result
 */
const err = <E>(error: E): Failure<E> => ({ ok: false, error });

/**
 * Type guard that narrows a Result to Success.
 *
 * @param result - The result to check
 * @returns true if the result is a Success
 */
const isOk = <T, E>(result: Result<T, E>): result is Success<T> => result.ok;

/**
 * Type guard that narrows a Result to Failure.
 *
 * @param result - The result to check
 * @returns true if the result is a Failure
 */
const isErr = <T, E>(result: Result<T, E>): result is Failure<E> => !result.ok;

/**
 * Result namespace providing helper constructors and type guards
 * for working with the Result discriminated union.
 */
export const Result = { ok, err, isOk, isErr } as const;
