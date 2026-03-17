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

export interface FeatureFlagServiceDeps {
  provider: FeatureFlagProvider;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createFeatureFlagService(deps: FeatureFlagServiceDeps) {
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

        const result = evaluateRules(flag, context ?? {});
        return Result.ok(result.variant);
      } catch (cause) {
        return Result.err({ _tag: 'ProviderError', cause });
      }
    },

    async getAllFlags(): Promise<Result<FeatureFlag[], FeatureFlagError>> {
      try {
        return Result.ok(await deps.provider.getAllFlags());
      } catch (cause) {
        return Result.err({ _tag: 'ProviderError', cause });
      }
    },
  };
}
