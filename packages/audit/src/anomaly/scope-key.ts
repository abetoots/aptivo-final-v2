/**
 * S17-B3 (post-review): single source of truth for the anomaly-gate
 * scope key.
 *
 * The detector's `getBaseline(actor, resourceType, ...)` lookup uses
 * `resourceType` as a stable scope identifier. Two callsites must
 * produce the same string for any given resource-type list:
 *
 *   1. `audit-store-drizzle.aggregateAccessPattern` — sets
 *      `AccessPattern.resourceType` so the gate's runtime evaluation
 *      passes it into `getBaseline`.
 *   2. `apps/web/src/lib/services.ts:getAnomalyBaselineScopes` —
 *      sets `scope.key`, which the baseline-builder cron writes into
 *      `anomaly_baselines.resource_type`.
 *
 * Multi-model review of S17-B3 caught that both sites previously
 * inlined `resourceTypes.join(',')`. Any normalization drift (sorting,
 * separator change, lowercasing) on one side without the other would
 * cause the gate to look up a baseline keyed under a different string,
 * silently fail open, and never fire. Centralising the formatter here
 * makes the contract explicit and gives one place to update.
 */

/**
 * Joins a resource-type list into the scope key the anomaly gate +
 * baseline cron both use. Order is preserved (no sort), values are
 * passed through unchanged. A length-0 list produces an empty string
 * — caller-side empty-scope short-circuits in audit-store and the
 * cron treat that as "no scope".
 */
export function formatAnomalyScopeKey(resourceTypes: readonly string[]): string {
  return resourceTypes.join(',');
}
