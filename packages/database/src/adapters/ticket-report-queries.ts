/**
 * S17-CT-4: ticket reporting aggregation queries.
 *
 * Powers `GET /api/tickets/reports` (admin dashboards) via the
 * apps/web `TicketReportService`. Three concerns:
 *
 *   - openByPriority: COUNT grouped by priority over the open
 *     statuses (open/in_progress/escalated). Closed tickets excluded.
 *   - resolutionByPriority: per-priority { totalClosed, sumMinutes }
 *     over tickets closed within the requested window. The service
 *     turns sum/count into avg.
 *   - slaComplianceByPriority: same window, plus a `withinSlaCount`
 *     CASE filter against the per-priority resolveMinutes threshold
 *     supplied by the caller. Configs come from the SLA config store
 *     in apps/web; this adapter stays config-agnostic so the
 *     database package doesn't reach back into the case-tracking
 *     service.
 *
 * No safety cap here — these are admin-triggered analytics, not a
 * cron, and the queries are pure aggregations (no row materialization
 * back to JS). For pathological backlogs (>10M closed tickets) the
 * service layer can add windowing.
 */

import { sql, and, eq, gte, isNotNull } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { tickets } from '../schema/tickets.js';
import type { TicketPriority } from './ticket-store-drizzle.js';

// ---------------------------------------------------------------------------
// public types
// ---------------------------------------------------------------------------

export interface PriorityCount {
  readonly priority: TicketPriority;
  readonly count: number;
}

export interface PriorityResolutionRow {
  readonly priority: TicketPriority;
  /** Closed tickets in the window (closedAt >= cutoff). */
  readonly totalClosed: number;
  /** Sum of (closedAt - createdAt) in minutes. Null when totalClosed=0. */
  readonly sumMinutes: number | null;
}

export interface PriorityComplianceRow {
  readonly priority: TicketPriority;
  readonly totalClosed: number;
  /**
   * Subset of totalClosed that resolved within the priority's
   * configured SLA window (resolveMinutes seconds, supplied by the
   * caller). NULL when no threshold was supplied for this priority
   * (the SLA config is missing); the caller distinguishes "no rate
   * available" from "0 met SLA" via this null.
   *
   * S17-CT-4 (post-Codex round 2): both fields come from the same
   * query so per-priority numerator + denominator are paired in one
   * snapshot — concurrent writes can't push withinSlaCount above
   * totalClosed and the rate stays in [0, 1].
   */
  readonly withinSlaCount: number | null;
}

export interface TicketReportQueries {
  /**
   * COUNT(*) GROUP BY priority over open statuses
   * (open/in_progress/escalated). Closed tickets excluded by status,
   * so this is a live "what's on the board" snapshot, not windowed.
   */
  openByPriority(): Promise<readonly PriorityCount[]>;
  /**
   * Per-priority resolution stats over tickets closed in the window
   * (`closed_at >= cutoff`). Caller passes the cutoff Date so test
   * clocks reach SQL.
   *
   * S17-CT-4 (post-Codex review): also filters out rows where
   * `closed_at < created_at` — defensive against clock skew or
   * imported data so the average isn't dragged below zero.
   */
  resolutionByPriority(cutoff: Date): Promise<readonly PriorityResolutionRow[]>;
  /**
   * Per-priority compliance over the same window. ALWAYS returns all
   * four priorities, with totalClosed populated for each. Caller
   * supplies the threshold-seconds-per-priority lookup; for any
   * priority missing a threshold, `withinSlaCount` comes back NULL
   * (distinguishing "no SLA config" from "0 met SLA").
   *
   * S17-CT-4 (post-Codex round 2): both totalClosed and
   * withinSlaCount come from the same per-priority query so they
   * share a snapshot — under READ COMMITTED, a ticket closed mid-
   * report can't increment one without the other and the rate
   * stays in [0, 1]. The earlier shape sourced totalClosed from
   * `resolutionByPriority` (separate query, separate snapshot)
   * which could produce withinSlaCount > totalClosed under
   * concurrent writes.
   *
   * Same `closed_at >= created_at` guard as resolution to keep
   * negative-duration rows out of both numerator and denominator.
   */
  slaComplianceByPriority(
    cutoff: Date,
    thresholdSecondsByPriority: Readonly<Partial<Record<TicketPriority, number>>>,
  ): Promise<readonly PriorityComplianceRow[]>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ['open', 'in_progress', 'escalated'] as const;

export function createTicketReportQueries(db: DrizzleClient): TicketReportQueries {
  return {
    async openByPriority() {
      const rows = await db
        .select({
          priority: tickets.priority,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        // sql template — drizzle's `inArray` overload doesn't accept
        // PgEnumColumn directly, so we hand-roll the IN clause.
        // OPEN_STATUSES is a const string[] of literals; safe to inline.
        .where(sql`${tickets.status} in ('open', 'in_progress', 'escalated')`)
        .groupBy(tickets.priority);
      return rows.map((r: { priority: TicketPriority; count: number | null }) => ({
        priority: r.priority,
        count: r.count ?? 0,
      }));
    },

    async resolutionByPriority(cutoff) {
      const rows = await db
        .select({
          priority: tickets.priority,
          totalClosed: sql<number>`count(*)::int`,
          // sum( (closed_at - created_at) in minutes )
          sumMinutes: sql<number | null>`sum(extract(epoch from (${tickets.closedAt} - ${tickets.createdAt})) / 60)::int`,
        })
        .from(tickets)
        .where(
          and(
            isNotNull(tickets.closedAt),
            gte(tickets.closedAt, cutoff),
            // S17-CT-4 (post-Codex review): drop clock-skew /
            // backfilled rows so negative durations don't drag the
            // average below zero.
            sql`${tickets.closedAt} >= ${tickets.createdAt}`,
          ),
        )
        .groupBy(tickets.priority);
      return rows.map((r: { priority: TicketPriority; totalClosed: number | null; sumMinutes: number | null }) => ({
        priority: r.priority,
        totalClosed: r.totalClosed ?? 0,
        sumMinutes: r.sumMinutes,
      }));
    },

    async slaComplianceByPriority(cutoff, thresholdSecondsByPriority) {
      // S17-CT-4 (post-Codex round 2): always query all four
      // priorities in parallel. For priorities without a threshold,
      // skip the FILTER and return withinSlaCount=null so the service
      // can render `compliancePct: null` (vs a dishonest 0).
      // Postgres `FILTER (WHERE ...)` produces the within-SLA count
      // alongside totalClosed in a single scan, so the per-priority
      // numerator + denominator share a snapshot.
      const allPriorities: readonly TicketPriority[] = ['critical', 'high', 'medium', 'low'];

      const results = await Promise.all(
        allPriorities.map(async (priority) => {
          const seconds = thresholdSecondsByPriority[priority];
          const hasThreshold = typeof seconds === 'number';
          const rows = await db
            .select({
              totalClosed: sql<number>`count(*)::int`,
              withinSla: hasThreshold
                ? sql<number | null>`count(*) filter (
                    where extract(epoch from (${tickets.closedAt} - ${tickets.createdAt})) <= ${seconds}
                  )::int`
                // Cast NULL to int4 so the column type lines up with
                // the configured-priority branch.
                : sql<number | null>`null::int`,
            })
            .from(tickets)
            .where(
              and(
                eq(tickets.priority, priority),
                isNotNull(tickets.closedAt),
                gte(tickets.closedAt, cutoff),
                // mirror resolutionByPriority's clock-skew guard
                sql`${tickets.closedAt} >= ${tickets.createdAt}`,
              ),
            );
          const row = rows[0];
          return {
            priority,
            totalClosed: row?.totalClosed ?? 0,
            withinSlaCount: hasThreshold ? (row?.withinSla ?? 0) : null,
          };
        }),
      );
      return results;
    },
  };
}
