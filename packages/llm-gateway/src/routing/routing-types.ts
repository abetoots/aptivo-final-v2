/**
 * LLM2-04: Multi-Provider Routing Types
 * @task LLM2-04
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.5
 * @brd BO-CORE-003
 */

// ---------------------------------------------------------------------------
// routing strategy — determines how providers are ranked for a request
// ---------------------------------------------------------------------------

export type RoutingStrategy = 'lowest_cost' | 'latency_optimized' | 'failover_only';

// ---------------------------------------------------------------------------
// provider selection — result of the routing decision
// ---------------------------------------------------------------------------

export interface ProviderSelection {
  primary: { id: string; provider: unknown };
  fallbacks: Array<{ id: string; provider: unknown }>;
  reason: string;
}

// ---------------------------------------------------------------------------
// provider health — snapshot of a provider's availability and latency
// ---------------------------------------------------------------------------

export interface ProviderHealth {
  healthy: boolean;
  latencyP50Ms: number;
  errorRate: number;
}

// ---------------------------------------------------------------------------
// provider cost — per-model cost for a given provider
// ---------------------------------------------------------------------------

export interface ProviderCost {
  providerId: string;
  costPer1kTokens: number;
}

// ---------------------------------------------------------------------------
// router dependencies — injected at construction time
// ---------------------------------------------------------------------------

export interface ProviderRouterDeps {
  providers: Map<string, unknown>;
  modelToProvider: Record<string, string>;
  getHealth?: (providerId: string) => ProviderHealth;
  getCost?: (providerId: string, model: string) => number;
}
