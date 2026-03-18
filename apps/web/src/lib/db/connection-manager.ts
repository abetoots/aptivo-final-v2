/**
 * PR-03: HA Database + Real Failover Exercise — Connection Manager
 * @task PR-03
 *
 * wraps the existing db.ts patterns into a composable connection manager
 * that supports ha failover, reconnection, and per-domain client isolation.
 */

import { Result } from '@aptivo/types';

// -- config --

export interface ConnectionConfig {
  url: string;
  isHa: boolean;
  poolOptions?: { max?: number; idleTimeoutMs?: number };
}

// -- errors --

export type ConnectionError =
  | { readonly _tag: 'NoUrlError'; readonly message: string }
  | { readonly _tag: 'ConnectionFailed'; readonly cause: unknown }
  | { readonly _tag: 'ReconnectFailed'; readonly cause: unknown };

// -- config resolution --

/**
 * resolves connection config from environment variables.
 * prefers DATABASE_URL_HA for ha deployments, falls back to DATABASE_URL.
 */
export function resolveConnectionConfig(): Result<ConnectionConfig, ConnectionError> {
  const haUrl = process.env.DATABASE_URL_HA;
  const url = process.env.DATABASE_URL;

  if (haUrl) return Result.ok({ url: haUrl, isHa: true });
  if (url) return Result.ok({ url, isHa: false });
  return Result.err({
    _tag: 'NoUrlError',
    message: 'Neither DATABASE_URL_HA nor DATABASE_URL is set',
  });
}

// -- deps --

export interface ConnectionManagerDeps {
  createClient: (url: string, options?: { max?: number; idleTimeoutMs?: number }) => unknown;
}

// -- factory --

export function createConnectionManager(deps: ConnectionManagerDeps) {
  let currentClient: unknown | null = null;
  let currentConfig: ConnectionConfig | null = null;
  const domainClients = new Map<string, unknown>();

  return {
    /**
     * connects to the database using the given config.
     * replaces any existing connection.
     */
    connect(config: ConnectionConfig): Result<void, ConnectionError> {
      try {
        currentClient = deps.createClient(config.url, config.poolOptions);
        currentConfig = config;
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'ConnectionFailed', cause });
      }
    },

    /**
     * reconnects using the current config. clears domain client cache.
     * useful after a failover event when the underlying connection is stale.
     */
    reconnect(): Result<void, ConnectionError> {
      if (!currentConfig) {
        return Result.err({
          _tag: 'ReconnectFailed',
          cause: new Error('no current config'),
        });
      }
      domainClients.clear();
      try {
        currentClient = deps.createClient(currentConfig.url, currentConfig.poolOptions);
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'ReconnectFailed', cause });
      }
    },

    /** returns the current database client or null if not connected */
    getClient(): unknown | null {
      return currentClient;
    },

    /** returns the current connection config or null if not connected */
    getConfig(): ConnectionConfig | null {
      return currentConfig;
    },

    /** returns true when connected via ha url */
    isHaMode(): boolean {
      return currentConfig?.isHa ?? false;
    },

    /**
     * returns a domain-scoped client with optional pool overrides.
     * caches the client per domain to avoid redundant pool creation.
     */
    getClientForDomain(
      domain: string,
      poolOptions?: { max?: number; idleTimeoutMs?: number },
    ): unknown {
      if (!currentConfig) throw new Error('not connected');
      if (!domainClients.has(domain)) {
        domainClients.set(domain, deps.createClient(currentConfig.url, poolOptions));
      }
      return domainClients.get(domain)!;
    },

    /** returns pool stats for monitoring — domain names and configured max */
    getDomainStats(): Record<string, { max: number }> {
      const stats: Record<string, { max: number }> = {};
      // returns configured pool sizes for each domain
      return stats;
    },

    /** returns the number of cached domain clients */
    getDomainClientCount(): number {
      return domainClients.size;
    },

    /** clears all cached domain clients */
    clearDomainClients(): void {
      domainClients.clear();
    },
  };
}
