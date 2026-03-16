/**
 * INF-04: Secrets Manager — env-based secrets provider with dual-key rotation
 * @task INF-04
 *
 * provides a secrets abstraction that supports rotating secrets for
 * zero-downtime key rotation. the env-based implementation reads from
 * process.env with a KEY / KEY_PREVIOUS convention.
 */

import { Result } from '@aptivo/types';

// -- types --

export type SecretsError = {
  readonly _tag: 'SecretsError';
  readonly key: string;
  readonly cause: unknown;
};

export interface RotatingSecret {
  /** current active secret */
  current: string;
  /** previous secret, valid during rotation window */
  previous?: string;
}

export interface SecretsProvider {
  /** get a single secret value */
  getSecret(key: string): Result<string, SecretsError>;
  /** get a rotating secret with current + optional previous */
  getRotatingSecret(key: string): Result<RotatingSecret, SecretsError>;
}

// -- env-based implementation --

/**
 * creates a secrets provider that reads from process.env.
 * for rotating secrets, looks for KEY and KEY_PREVIOUS.
 * e.g., HITL_SIGNING_SECRET and HITL_SIGNING_SECRET_PREVIOUS
 */
export function createEnvSecretsProvider(): SecretsProvider {
  return {
    getSecret(key) {
      const value = process.env[key];
      if (!value) {
        return Result.err({
          _tag: 'SecretsError',
          key,
          cause: `Environment variable ${key} is not set`,
        });
      }
      return Result.ok(value);
    },

    getRotatingSecret(key) {
      const current = process.env[key];
      if (!current) {
        return Result.err({
          _tag: 'SecretsError',
          key,
          cause: `Environment variable ${key} is not set`,
        });
      }
      const previous = process.env[`${key}_PREVIOUS`] || undefined;
      return Result.ok({ current, previous });
    },
  };
}

// -- rotating secret validation --

/**
 * validates a value against a rotating secret.
 * returns true if the value matches either the current or previous secret.
 * logs a warning when the previous (rotated) secret is used.
 */
export function validateRotatingSecret(
  value: string,
  secret: RotatingSecret,
  context?: string,
): boolean {
  if (value === secret.current) return true;
  if (secret.previous && value === secret.previous) {
    console.warn(
      `rotating secret matched previous key${context ? ` (${context})` : ''} — complete rotation soon`,
    );
    return true;
  }
  return false;
}
