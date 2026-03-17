/**
 * LLM2-04: Provider Router — selects the best provider for a given model
 * @task LLM2-04
 * @spec docs/04-specs/platform-core/llm-gateway.md §4.5
 * @brd BO-CORE-003
 */

import { Result } from '@aptivo/types';
import type {
  RoutingStrategy,
  ProviderSelection,
  ProviderRouterDeps,
} from './routing-types.js';
import { createHealthTracker } from './health-tracker.js';

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export interface NoProviderAvailableError {
  readonly _tag: 'NoProviderAvailable';
  readonly model: string;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createProviderRouter(deps: ProviderRouterDeps) {
  const healthTracker = createHealthTracker();

  // find all providers that support a model — primary first, then others
  function getProvidersForModel(model: string): Array<{ id: string; provider: unknown }> {
    const primaryId = deps.modelToProvider[model];
    if (!primaryId) return [];

    const results: Array<{ id: string; provider: unknown }> = [];

    // primary first
    const primary = deps.providers.get(primaryId);
    if (primary) results.push({ id: primaryId, provider: primary });

    // add other registered providers as fallbacks
    for (const [id, provider] of deps.providers) {
      if (id !== primaryId) results.push({ id, provider });
    }

    return results;
  }

  return {
    selectProvider(
      model: string,
      strategy: RoutingStrategy,
    ): Result<ProviderSelection, NoProviderAvailableError> {
      const candidates = getProvidersForModel(model);
      if (candidates.length === 0) {
        return Result.err({ _tag: 'NoProviderAvailable' as const, model });
      }

      switch (strategy) {
        case 'failover_only': {
          // use primary with rest as fallbacks (existing behavior)
          return Result.ok({
            primary: candidates[0]!,
            fallbacks: candidates.slice(1),
            reason: `failover: primary=${candidates[0]!.id}`,
          });
        }

        case 'lowest_cost': {
          // sort by cost (getCost or fallback to order)
          const sorted = [...candidates].sort((a, b) => {
            const costA = deps.getCost?.(a.id, model) ?? 999;
            const costB = deps.getCost?.(b.id, model) ?? 999;
            return costA - costB;
          });
          return Result.ok({
            primary: sorted[0]!,
            fallbacks: sorted.slice(1),
            reason: `lowest_cost: selected=${sorted[0]!.id}`,
          });
        }

        case 'latency_optimized': {
          // sort by health (healthy first) then by latency
          const getHealthFn = deps.getHealth ?? ((id: string) => healthTracker.getHealth(id));
          const sorted = [...candidates].sort((a, b) => {
            const ha = getHealthFn(a.id);
            const hb = getHealthFn(b.id);
            // healthy providers first
            if (ha.healthy && !hb.healthy) return -1;
            if (!ha.healthy && hb.healthy) return 1;
            // then by latency
            return ha.latencyP50Ms - hb.latencyP50Ms;
          });
          return Result.ok({
            primary: sorted[0]!,
            fallbacks: sorted.slice(1),
            reason: `latency_optimized: selected=${sorted[0]!.id}, healthy=${sorted[0]!.id === candidates[0]!.id}`,
          });
        }
      }
    },
  };
}

export type ProviderRouter = ReturnType<typeof createProviderRouter>;
