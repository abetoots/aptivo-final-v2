/**
 * PR-07: Feature Flag Provider Resolution Logic
 * @task PR-07
 *
 * pure function that decides which feature flag provider to use based on env.
 * no side effects, no async, no heavy imports — safe to import in tests.
 */

// -- types --

export type FlagProviderType = 'env' | 'local';

// -- resolver --

/**
 * decide which feature flag provider to use:
 * - 'env' when FEATURE_FLAGS env var is set (env overrides take precedence)
 * - 'local' when FEATURE_FLAGS is not set (static defaults)
 */
export function resolveFeatureFlagProvider(
  env: Record<string, string | undefined>,
): FlagProviderType {
  return env.FEATURE_FLAGS ? 'env' : 'local';
}
