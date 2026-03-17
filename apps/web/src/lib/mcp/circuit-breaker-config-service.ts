/**
 * FEAT-09: Per-Tool MCP Circuit Breaker Override
 * @task FEAT-09
 *
 * allows per-server + per-tool circuit breaker config overrides.
 * overrides take precedence over the global default config when
 * resolving cb parameters for a specific tool invocation.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// override record
// ---------------------------------------------------------------------------

export interface CircuitBreakerOverride {
  serverId: string;
  toolName: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  overriddenAt: Date;
  overriddenBy: string;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type CbConfigError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'OverrideNotFound'; readonly key: string }
  | { readonly _tag: 'ConfigError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface CbConfigStore {
  getOverride(serverId: string, toolName: string): Promise<CircuitBreakerOverride | null>;
  setOverride(override: CircuitBreakerOverride): Promise<void>;
  removeOverride(serverId: string, toolName: string): Promise<boolean>;
  listOverrides(): Promise<CircuitBreakerOverride[]>;
}

// ---------------------------------------------------------------------------
// default config
// ---------------------------------------------------------------------------

export const DEFAULT_CB_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
} as const;

// ---------------------------------------------------------------------------
// service deps
// ---------------------------------------------------------------------------

export interface CbConfigServiceDeps {
  store: CbConfigStore;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createCbConfigService(deps: CbConfigServiceDeps) {
  return {
    /**
     * resolve the effective circuit breaker config for a server + tool pair.
     * returns the override if one exists, otherwise the global default.
     */
    async getConfig(
      serverId: string,
      toolName: string,
    ): Promise<Result<CircuitBreakerOverride | typeof DEFAULT_CB_CONFIG, CbConfigError>> {
      try {
        const override = await deps.store.getOverride(serverId, toolName);
        return Result.ok(override ?? DEFAULT_CB_CONFIG);
      } catch (cause) {
        return Result.err({ _tag: 'ConfigError' as const, cause });
      }
    },

    /**
     * set a per-tool circuit breaker override.
     * validates thresholds before persisting.
     */
    async setOverride(
      serverId: string,
      toolName: string,
      config: { failureThreshold: number; resetTimeoutMs: number; halfOpenMaxAttempts: number },
      overriddenBy: string,
    ): Promise<Result<CircuitBreakerOverride, CbConfigError>> {
      // validate failure threshold
      if (config.failureThreshold < 1 || config.failureThreshold > 100) {
        return Result.err({ _tag: 'ValidationError', message: 'failureThreshold must be 1-100' });
      }
      // validate reset timeout
      if (config.resetTimeoutMs < 1000 || config.resetTimeoutMs > 300_000) {
        return Result.err({ _tag: 'ValidationError', message: 'resetTimeoutMs must be 1000-300000' });
      }
      // validate half-open max attempts
      if (config.halfOpenMaxAttempts < 1 || config.halfOpenMaxAttempts > 20) {
        return Result.err({ _tag: 'ValidationError', message: 'halfOpenMaxAttempts must be 1-20' });
      }

      try {
        const override: CircuitBreakerOverride = {
          serverId,
          toolName,
          ...config,
          overriddenAt: new Date(),
          overriddenBy,
        };
        await deps.store.setOverride(override);
        return Result.ok(override);
      } catch (cause) {
        return Result.err({ _tag: 'ConfigError' as const, cause });
      }
    },

    /**
     * remove a per-tool circuit breaker override.
     * returns OverrideNotFound if no override existed.
     */
    async removeOverride(
      serverId: string,
      toolName: string,
    ): Promise<Result<void, CbConfigError>> {
      try {
        const removed = await deps.store.removeOverride(serverId, toolName);
        if (!removed) {
          return Result.err({ _tag: 'OverrideNotFound', key: `${serverId}:${toolName}` });
        }
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'ConfigError' as const, cause });
      }
    },

    /**
     * list all active circuit breaker overrides.
     */
    async listOverrides(): Promise<Result<CircuitBreakerOverride[], CbConfigError>> {
      try {
        return Result.ok(await deps.store.listOverrides());
      } catch (cause) {
        return Result.err({ _tag: 'ConfigError' as const, cause });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// in-memory store (for tests and single-instance deployments)
// ---------------------------------------------------------------------------

export function createInMemoryCbConfigStore(): CbConfigStore {
  const overrides = new Map<string, CircuitBreakerOverride>();

  function key(serverId: string, toolName: string): string {
    return `${serverId}:${toolName}`;
  }

  return {
    async getOverride(serverId, toolName) {
      return overrides.get(key(serverId, toolName)) ?? null;
    },
    async setOverride(override) {
      overrides.set(key(override.serverId, override.toolName), override);
    },
    async removeOverride(serverId, toolName) {
      return overrides.delete(key(serverId, toolName));
    },
    async listOverrides() {
      return [...overrides.values()];
    },
  };
}
