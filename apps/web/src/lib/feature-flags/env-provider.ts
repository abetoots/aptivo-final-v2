/**
 * PR-07: Environment-based Feature Flag Provider
 * @task PR-07
 *
 * reads flag overrides from the FEATURE_FLAGS env var (JSON array).
 * merges with defaults: env overrides win for known keys only.
 * unknown env keys are silently ignored.
 */

import type { FeatureFlagProvider, FeatureFlag } from './feature-flag-service.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface FlagWithSource extends FeatureFlag {
  source: 'env' | 'default';
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createEnvFlagProvider(
  defaults: FeatureFlag[],
): FeatureFlagProvider & { getAllFlagsWithSource(): Promise<FlagWithSource[]> } {
  const defaultMap = new Map(defaults.map((f) => [f.key, f]));
  const envOverrides = parseEnvFlags();

  // merge: env overrides win, but only for known keys
  const mergedMap = new Map<string, FlagWithSource>();
  for (const [key, flag] of defaultMap) {
    const override = envOverrides.get(key);
    if (override) {
      mergedMap.set(key, { ...flag, ...override, source: 'env' });
    } else {
      mergedMap.set(key, { ...flag, source: 'default' });
    }
  }

  return {
    async getFlag(key) {
      const flag = mergedMap.get(key);
      return flag
        ? {
            key: flag.key,
            enabled: flag.enabled,
            variant: flag.variant,
            description: flag.description,
            rules: flag.rules,
          }
        : null;
    },
    async getAllFlags() {
      return [...mergedMap.values()];
    },
    async getAllFlagsWithSource() {
      return [...mergedMap.values()];
    },
  };
}

// ---------------------------------------------------------------------------
// env parser
// ---------------------------------------------------------------------------

function parseEnvFlags(): Map<string, Partial<FeatureFlag>> {
  const raw = process.env.FEATURE_FLAGS;
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter((f) => f && typeof f.key === 'string')
        .map((f) => [f.key, f]),
    );
  } catch {
    // malformed json — log warning and use defaults
    console.warn('FEATURE_FLAGS env var contains invalid JSON, using defaults');
    return new Map();
  }
}
