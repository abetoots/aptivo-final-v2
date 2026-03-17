/**
 * FEAT-08: Dynamic MCP Server Discovery API
 * @task FEAT-08
 *
 * provides server listing and health status for registered mcp servers.
 * integrates with circuit breaker registry for health determination.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  tools: string[];
  lastChecked?: Date;
}

export interface McpServerHealth {
  serverId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  errorRate: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type DiscoveryError =
  | { readonly _tag: 'RegistryError'; readonly cause: unknown }
  | { readonly _tag: 'ServerNotFound'; readonly serverId: string };

// ---------------------------------------------------------------------------
// deps interface
// ---------------------------------------------------------------------------

export interface DiscoveryServiceDeps {
  getServers: () => Promise<Array<{ id: string; name: string; url: string; tools: string[] }>>;
  getHealth?: (serverId: string) => { state: string; failureCount: number } | null;
}

// ---------------------------------------------------------------------------
// health mapping helper
// ---------------------------------------------------------------------------

function mapHealthStatus(
  cb: { state: string; failureCount: number } | null,
): 'healthy' | 'degraded' | 'unhealthy' {
  if (!cb) return 'healthy';
  if (cb.state === 'open') return 'unhealthy';
  if (cb.state === 'half-open') return 'degraded';
  return cb.failureCount > 5 ? 'degraded' : 'healthy';
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDiscoveryService(deps: DiscoveryServiceDeps) {
  return {
    /** list all registered mcp servers with health status */
    async listServers(): Promise<Result<McpServerInfo[], DiscoveryError>> {
      try {
        const servers = await deps.getServers();
        return Result.ok(
          servers.map((s) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            status: deps.getHealth
              ? mapHealthStatus(deps.getHealth(s.id))
              : ('unknown' as const),
            tools: s.tools,
            lastChecked: new Date(),
          })),
        );
      } catch (cause) {
        return Result.err({ _tag: 'RegistryError', cause });
      }
    },

    /** get health details for a specific mcp server */
    async getServerHealth(
      serverId: string,
    ): Promise<Result<McpServerHealth, DiscoveryError>> {
      try {
        const servers = await deps.getServers();
        const server = servers.find((s) => s.id === serverId);
        if (!server) return Result.err({ _tag: 'ServerNotFound', serverId });

        const cbState = deps.getHealth?.(serverId);
        return Result.ok({
          serverId,
          status: cbState ? mapHealthStatus(cbState) : ('unknown' as 'healthy'),
          latencyMs: cbState?.state === 'closed' ? 50 : 5000,
          circuitBreakerState: (cbState?.state ?? 'closed') as 'closed' | 'open' | 'half-open',
          errorRate: cbState ? cbState.failureCount / 100 : 0,
        });
      } catch (cause) {
        return Result.err({ _tag: 'RegistryError', cause });
      }
    },
  };
}
