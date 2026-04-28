/**
 * S17-CT-4: ticket reporting service.
 *
 * Builds the per-window report consumed by `GET /api/tickets/reports`
 * and admin dashboards. Three sub-reports, all keyed by ticket
 * priority:
 *
 *   - openByPriority — what's currently on the board, not windowed
 *   - resolution — averages over tickets closed in the window
 *   - slaCompliance — fraction that closed inside their priority's
 *     configured SLA threshold
 *
 * The DB-side adapter (`TicketReportQueries`) is config-agnostic.
 * The service injects the per-priority SLA threshold lookup pulled
 * from the same `TicketSlaConfigStore` that CT-2 owns, so a single
 * source of truth produces both "is this ticket at-risk?" and
 * "did we meet SLA on closed tickets?".
 *
 * No safety cap or pagination — these are pure aggregation queries
 * (no row materialization). For pathological backlogs the service
 * layer can add max-window clamping; the route already clamps
 * `?range` to [1, 365] days.
 */

import type {
  DrizzleTicketReportQueries,
  DrizzleTicketSlaConfigStore,
  PriorityCount,
  PriorityComplianceRow,
  PriorityResolutionRow,
  TicketPriority,
} from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// public types
// ---------------------------------------------------------------------------

/** All four priorities zero-filled — callers can render unconditionally. */
export type PriorityCounts = Readonly<Record<TicketPriority, number>>;

export interface ResolutionByPriority {
  readonly totalClosed: number;
  readonly avgResolutionMinutes: number | null;
}

export interface ComplianceByPriority {
  readonly totalClosed: number;
  readonly withinSlaCount: number;
  /** Null when totalClosed=0 (avoids division by zero in dashboards). */
  readonly compliancePct: number | null;
}

export interface TicketReport {
  readonly windowDays: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly openByPriority: PriorityCounts;
  readonly openTotal: number;
  readonly resolution: {
    readonly totalClosed: number;
    readonly avgResolutionMinutes: number | null;
    readonly byPriority: Readonly<Record<TicketPriority, ResolutionByPriority>>;
  };
  readonly slaCompliance: {
    /** Closed tickets across ALL priorities — honest denominator. */
    readonly totalClosed: number;
    /**
     * Closed tickets that met SLA. Counted only over priorities with
     * a configured SLA threshold; closures of priorities without a
     * config row are NOT included here.
     */
    readonly withinSlaCount: number;
    /**
     * Subset of `totalClosed` that we could evaluate against an SLA
     * config. Use this as the rate's denominator if you want a
     * consistent fraction. Always ≤ `totalClosed`.
     */
    readonly evaluatedClosed: number;
    /**
     * `withinSlaCount / evaluatedClosed`, rounded to 4dp. Null when
     * `evaluatedClosed=0` (nothing in the window has an applicable
     * SLA config — distinct from "0% met SLA").
     */
    readonly compliancePct: number | null;
    /**
     * Priorities present among closures but missing an SLA config
     * row. Their `byPriority[p].compliancePct` is null and they're
     * excluded from `withinSlaCount` / `evaluatedClosed`. Surface in
     * dashboards so ops sees the config gap rather than reading a
     * misleadingly high rate.
     */
    readonly unconfiguredPriorities: readonly TicketPriority[];
    readonly byPriority: Readonly<Record<TicketPriority, ComplianceByPriority>>;
  };
}

export interface TicketReportServiceDeps {
  readonly queries: DrizzleTicketReportQueries;
  readonly slaConfigStore: DrizzleTicketSlaConfigStore;
  /** Test-only override; defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

export interface TicketReportService {
  getReport(opts: { windowDays: number }): Promise<TicketReport>;
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

function zeroPriorityCounts(): PriorityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

function emptyResolution(): ResolutionByPriority {
  return { totalClosed: 0, avgResolutionMinutes: null };
}

function emptyCompliance(): ComplianceByPriority {
  return { totalClosed: 0, withinSlaCount: 0, compliancePct: null };
}

/**
 * Build the per-priority resolution map from the SQL rows. Always
 * returns all four priorities so dashboards can render
 * unconditionally; sumMinutes / totalClosed → avg or null.
 */
export function summarizeResolution(
  rows: readonly PriorityResolutionRow[],
): { totalClosed: number; avgResolutionMinutes: number | null; byPriority: Record<TicketPriority, ResolutionByPriority> } {
  const byPriority: Record<TicketPriority, ResolutionByPriority> = {
    critical: emptyResolution(),
    high: emptyResolution(),
    medium: emptyResolution(),
    low: emptyResolution(),
  };
  let totalClosed = 0;
  let totalSumMinutes = 0;
  for (const row of rows) {
    const avg = row.totalClosed > 0 && row.sumMinutes !== null
      ? Math.round(row.sumMinutes / row.totalClosed)
      : null;
    byPriority[row.priority] = {
      totalClosed: row.totalClosed,
      avgResolutionMinutes: avg,
    };
    totalClosed += row.totalClosed;
    if (row.sumMinutes !== null) totalSumMinutes += row.sumMinutes;
  }
  const avgResolutionMinutes = totalClosed > 0 ? Math.round(totalSumMinutes / totalClosed) : null;
  return { totalClosed, avgResolutionMinutes, byPriority };
}

/**
 * Build the per-priority compliance map ENTIRELY from the compliance
 * rows.
 *
 * S17-CT-4 (post-Codex round 2): both per-priority totalClosed and
 * withinSlaCount come from the same SQL row (paired in one snapshot)
 * — under READ COMMITTED, a write between resolution and compliance
 * queries cannot push withinSlaCount above totalClosed and the rate
 * stays in [0, 1]. Resolution rows are no longer consulted here.
 *
 *   - `byPriority[p].totalClosed` = compliance row's totalClosed for
 *     that priority (always populated; the adapter returns all four).
 *   - `byPriority[p].withinSlaCount` = compliance row's count if the
 *     priority has a configured threshold; 0 otherwise (and pct null).
 *   - `byPriority[p].compliancePct` is null when the priority has no
 *     config OR has no closures in the window — distinct from "0% met".
 *   - top-level `evaluatedClosed` is the sum of totalClosed across
 *     priorities WITH a config; `compliancePct = withinSlaCount /
 *     evaluatedClosed` so the rate is computed on the same population.
 *   - top-level `totalClosed` covers ALL priorities — so dashboards
 *     can show "we evaluated X of Y closures" honestly.
 *   - `unconfiguredPriorities` lists priorities that contributed to
 *     `totalClosed` but were excluded from the rate.
 */
export function summarizeCompliance(args: {
  complianceRows: readonly PriorityComplianceRow[];
}): {
  totalClosed: number;
  withinSlaCount: number;
  evaluatedClosed: number;
  compliancePct: number | null;
  unconfiguredPriorities: readonly TicketPriority[];
  byPriority: Record<TicketPriority, ComplianceByPriority>;
} {
  const { complianceRows } = args;
  // Index compliance rows by priority for O(1) lookup; the adapter
  // is contracted to return all four priorities, but we tolerate
  // missing rows defensively (treat as zero closures).
  const rowByPriority = new Map<TicketPriority, PriorityComplianceRow>();
  for (const row of complianceRows) {
    rowByPriority.set(row.priority, row);
  }

  const byPriority: Record<TicketPriority, ComplianceByPriority> = {
    critical: emptyCompliance(),
    high: emptyCompliance(),
    medium: emptyCompliance(),
    low: emptyCompliance(),
  };
  let totalClosed = 0;
  let withinSlaCount = 0;
  let evaluatedClosed = 0;
  const unconfiguredWithClosures: TicketPriority[] = [];

  for (const priority of ['critical', 'high', 'medium', 'low'] as const) {
    const row = rowByPriority.get(priority);
    const closed = row?.totalClosed ?? 0;
    const within = row?.withinSlaCount ?? null; // null = unconfigured
    totalClosed += closed;

    if (within === null) {
      byPriority[priority] = {
        totalClosed: closed,
        withinSlaCount: 0,
        compliancePct: null,
      };
      if (closed > 0) unconfiguredWithClosures.push(priority);
      continue;
    }
    const pct = closed > 0
      ? Math.round((within / closed) * 10_000) / 10_000
      : null;
    byPriority[priority] = {
      totalClosed: closed,
      withinSlaCount: within,
      compliancePct: pct,
    };
    withinSlaCount += within;
    evaluatedClosed += closed;
  }

  const compliancePct = evaluatedClosed > 0
    ? Math.round((withinSlaCount / evaluatedClosed) * 10_000) / 10_000
    : null;
  return {
    totalClosed,
    withinSlaCount,
    evaluatedClosed,
    compliancePct,
    unconfiguredPriorities: unconfiguredWithClosures,
    byPriority,
  };
}

function fillOpenByPriority(rows: readonly PriorityCount[]): { byPriority: PriorityCounts; total: number } {
  const byPriority = zeroPriorityCounts();
  let total = 0;
  const writable = byPriority as Record<TicketPriority, number>;
  for (const r of rows) {
    writable[r.priority] = r.count;
    total += r.count;
  }
  return { byPriority, total };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

export function createTicketReportService(
  deps: TicketReportServiceDeps,
): TicketReportService {
  const now = deps.now ?? (() => new Date());

  return {
    async getReport({ windowDays }) {
      // Clamp defensively even though the route already does — direct
      // service callers (Inngest workflows, future scheduled exports)
      // should hit the same bounds.
      const clampedDays = Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.floor(windowDays)));
      const windowMs = clampedDays * 24 * 60 * 60 * 1000;
      // S17-CT-4 (post-Codex review): cutoff derives from the SAME
      // injected clock the response advertises in `windowStart` /
      // `windowEnd`. Earlier the adapter recomputed cutoff via
      // `Date.now()`, so test-clock injection didn't reach SQL and
      // boundary tickets could land on the wrong side of the window.
      const end = now();
      const cutoff = new Date(end.getTime() - windowMs);

      // Pull SLA configs once — used as the threshold lookup for the
      // compliance query. Per-priority resolveMinutes → seconds.
      const configs = await deps.slaConfigStore.list();
      const thresholdSecondsByPriority: Partial<Record<TicketPriority, number>> = {};
      for (const cfg of configs) {
        thresholdSecondsByPriority[cfg.priority] = cfg.resolveMinutes * 60;
      }

      // S17-CT-4 (post-Codex round 2): compliance is now self-contained
      // — totalClosed and withinSlaCount come from the same per-
      // priority query so READ COMMITTED snapshots can't put the
      // numerator above the denominator. Resolution stays a separate
      // query (different aggregate; only used for the avg-minutes
      // sub-report). The two can disagree slightly under heavy churn
      // — that's a freshness gap, not a correctness gap.
      const [openRows, resolutionRows, complianceRows] = await Promise.all([
        deps.queries.openByPriority(),
        deps.queries.resolutionByPriority(cutoff),
        deps.queries.slaComplianceByPriority(cutoff, thresholdSecondsByPriority),
      ]);

      const open = fillOpenByPriority(openRows);
      const resolution = summarizeResolution(resolutionRows);
      const compliance = summarizeCompliance({ complianceRows });

      return {
        windowDays: clampedDays,
        windowStart: cutoff.toISOString(),
        windowEnd: end.toISOString(),
        openByPriority: open.byPriority,
        openTotal: open.total,
        resolution,
        slaCompliance: compliance,
      };
    },
  };
}
