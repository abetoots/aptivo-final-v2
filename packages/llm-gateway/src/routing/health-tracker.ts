/**
 * LLM2-04: Health Tracker — derives provider health from circuit breaker state
 * @task LLM2-04
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.5
 */

import type { ProviderHealth } from './routing-types.js';

// ---------------------------------------------------------------------------
// health tracker dependencies
// ---------------------------------------------------------------------------

export interface HealthTrackerDeps {
  getCircuitBreakerState?: (providerId: string) => {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
  };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createHealthTracker(deps?: HealthTrackerDeps) {
  return {
    getHealth(providerId: string): ProviderHealth {
      if (!deps?.getCircuitBreakerState) {
        // no circuit breaker info — assume healthy
        return { healthy: true, latencyP50Ms: 100, errorRate: 0 };
      }
      const cb = deps.getCircuitBreakerState(providerId);
      return {
        healthy: cb.state === 'closed',
        latencyP50Ms: cb.state === 'closed' ? 100 : 5000,
        errorRate: cb.failureCount > 0 ? cb.failureCount / 100 : 0,
      };
    },
  };
}

export type HealthTracker = ReturnType<typeof createHealthTracker>;
