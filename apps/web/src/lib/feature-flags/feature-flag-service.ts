/**
 * FEAT-03: Runtime Feature Flag Service
 * @task FEAT-03
 *
 * provides runtime feature flag evaluation with rule-based targeting.
 * uses the standard factory + deps injection pattern with Result returns.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// context for flag evaluation
// ---------------------------------------------------------------------------

export interface FeatureFlagContext {
  userId?: string;
  domain?: string;
  environment?: string;
  attributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// flag types
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  variant?: string;
  description?: string;
  rules?: FlagRule[];
}

export interface FlagRule {
  attribute: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in';
  value: unknown;
  result: { enabled: boolean; variant?: string };
}

// ---------------------------------------------------------------------------
// provider interface
// ---------------------------------------------------------------------------

export interface FeatureFlagProvider {
  getFlag(key: string): Promise<FeatureFlag | null>;
  getAllFlags(): Promise<FeatureFlag[]>;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type FeatureFlagError =
  | { readonly _tag: 'FlagNotFound'; readonly key: string }
  | { readonly _tag: 'ProviderError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// service deps
// ---------------------------------------------------------------------------

/**
 * S17-B2: minimal logger contract for warm-error visibility. Kept
 * intentionally narrow so the package doesn't depend on any specific
 * logger implementation. Composition root binds this to the app's
 * SafeLogger.
 */
export interface FeatureFlagLogger {
  warn: (event: string, context?: Record<string, unknown>) => void;
}

export interface FeatureFlagServiceDeps {
  provider: FeatureFlagProvider;
  /**
   * S17-B2: optional. When provided, `warm()` reports provider failures
   * via `logger.warn` so silent cache-warming failures don't leave
   * `peekEnabled` returning `defaultValue` indefinitely without any
   * operational signal. Multi-model review (S17_B2_MULTI_REVIEW.md)
   * flagged the silent-failure footgun.
   */
  logger?: FeatureFlagLogger;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createFeatureFlagService(deps: FeatureFlagServiceDeps) {
  // S17-B2: in-process write-through cache for sync `peekEnabled`.
  // Populated by `warm()` (composition root calls at startup) and by
  // every successful `isEnabled` / `getVariant` / `getAllFlags` call.
  // Holds the full `FeatureFlag` rather than just the boolean so a
  // future sync `peekVariant` is additive. No TTL — safety-gate
  // callers should call `warm()` periodically if upstream flag values
  // can change without the service noticing.
  const cache = new Map<string, FeatureFlag>();

  // evaluate targeting rules against context
  function evaluateRules(
    flag: FeatureFlag,
    context: FeatureFlagContext,
  ): { enabled: boolean; variant?: string } {
    if (!flag.rules || flag.rules.length === 0) {
      return { enabled: flag.enabled, variant: flag.variant };
    }

    for (const rule of flag.rules) {
      // look in attributes first, then top-level context fields
      const contextValue =
        context.attributes?.[rule.attribute] ??
        (context as Record<string, unknown>)[rule.attribute];

      let matches = false;
      switch (rule.operator) {
        case 'eq':
          matches = contextValue === rule.value;
          break;
        case 'neq':
          matches = contextValue !== rule.value;
          break;
        case 'in':
          matches =
            Array.isArray(rule.value) &&
            (rule.value as unknown[]).includes(contextValue);
          break;
        case 'not_in':
          matches =
            Array.isArray(rule.value) &&
            !(rule.value as unknown[]).includes(contextValue);
          break;
      }

      if (matches) return rule.result;
    }

    // no rules matched — use default
    return { enabled: flag.enabled, variant: flag.variant };
  }

  return {
    async isEnabled(
      key: string,
      context?: FeatureFlagContext,
    ): Promise<Result<boolean, FeatureFlagError>> {
      try {
        const flag = await deps.provider.getFlag(key);
        if (!flag) return Result.err({ _tag: 'FlagNotFound', key });

        // S17-B2: write-through so subsequent peekEnabled hits the cache
        cache.set(key, flag);
        const result = evaluateRules(flag, context ?? {});
        return Result.ok(result.enabled);
      } catch (cause) {
        return Result.err({ _tag: 'ProviderError', cause });
      }
    },

    async getVariant(
      key: string,
      context?: FeatureFlagContext,
    ): Promise<Result<string | undefined, FeatureFlagError>> {
      try {
        const flag = await deps.provider.getFlag(key);
        if (!flag) return Result.err({ _tag: 'FlagNotFound', key });

        cache.set(key, flag);
        const result = evaluateRules(flag, context ?? {});
        return Result.ok(result.variant);
      } catch (cause) {
        return Result.err({ _tag: 'ProviderError', cause });
      }
    },

    async getAllFlags(): Promise<Result<FeatureFlag[], FeatureFlagError>> {
      try {
        const flags = await deps.provider.getAllFlags();
        // S17-B2: snapshot-replace. The provider's response is the
        // authoritative full list, so any cache key not in the
        // snapshot is now stale (the flag was deleted) and must be
        // evicted. Same logic in `warm()` below.
        replaceCacheSnapshot(cache, flags);
        return Result.ok(flags);
      } catch (cause) {
        return Result.err({ _tag: 'ProviderError', cause });
      }
    },

    /**
     * S17-B2: synchronous flag check against the in-process cache.
     *
     * Returns `defaultValue` when the cache is cold (no `warm()`,
     * `isEnabled`, or `getAllFlags` call has populated this key yet).
     * Returns the cached flag's `enabled` value once populated.
     *
     * Does NOT apply rule-based targeting (`FeatureFlag.rules`) — only
     * the flag's default `enabled` is returned. Callers needing
     * context-aware evaluation must use the async `isEnabled`. This
     * is acceptable for the safety-gate use case (LLM gateway sync
     * `isEnabled` callbacks), where the flag is a global on/off
     * toggle without per-user targeting.
     *
     * Cache stability: once populated, a key's value persists until
     * the next async call overwrites it. There is no TTL or implicit
     * eviction, so `peekEnabled` returns the last-known value through
     * any in-flight provider re-fetch (stale-while-revalidate).
     */
    peekEnabled(key: string, defaultValue: boolean): boolean {
      const flag = cache.get(key);
      return flag?.enabled ?? defaultValue;
    },

    /**
     * S17-B2: explicit cache warm-up. Called by the composition root
     * at service startup (fire-and-forget) so that the first request
     * after deploy doesn't see `defaultValue` for safety-gate flags.
     *
     * On success: snapshot-replaces the cache so any flag deleted
     * upstream is evicted (avoids the stale-truthy-entry footgun).
     *
     * On failure: emits `feature_flag_warm_failed` via `deps.logger`
     * (when provided) so operators have visibility into a broken
     * provider — without the log, `peekEnabled` would silently keep
     * returning `defaultValue` forever. The cache is left untouched
     * on failure to preserve the stale-while-revalidate behaviour.
     */
    async warm(): Promise<void> {
      try {
        const flags = await deps.provider.getAllFlags();
        replaceCacheSnapshot(cache, flags);
      } catch (cause) {
        deps.logger?.warn('feature_flag_warm_failed', {
          cause: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
}

/**
 * S17-B2: in-place snapshot-replace. Adds every flag in `next` and
 * removes any pre-existing cache key that isn't in `next` so deletions
 * propagate. Done in two passes against the new key set so we don't
 * mutate while iterating.
 */
function replaceCacheSnapshot(cache: Map<string, FeatureFlag>, next: readonly FeatureFlag[]) {
  const nextKeys = new Set(next.map((f) => f.key));
  for (const existing of [...cache.keys()]) {
    if (!nextKeys.has(existing)) cache.delete(existing);
  }
  for (const f of next) cache.set(f.key, f);
}

export type FeatureFlagService = ReturnType<typeof createFeatureFlagService>;
