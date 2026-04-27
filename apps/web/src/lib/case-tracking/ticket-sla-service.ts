/**
 * S17-CT-2: ticket SLA engine.
 *
 * Pure SLA math (`computeSla`) plus a "list at-risk" query that the
 * SLO cron and admin dashboards consume. Design choices:
 *
 * - Closed tickets are NEVER at risk and `breached` is computed
 *   against `closedAt` (not `now()`), so a ticket that closed
 *   inside its window stays "honored" forever even if you query
 *   it months later.
 * - Configs are cached for one minute. Per-priority rows almost
 *   never change in production; reading them on every ticket
 *   render would amplify DB load with no benefit.
 * - All math is done in milliseconds and `Date` objects to keep
 *   timezone bugs impossible — `resolveMinutes` is the only unit
 *   conversion and it happens once at config load.
 *
 * The service does NOT own audit emission. SLA breach events are
 * emitted by the CT-2 SLO cron evaluator, not on every read.
 */

import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  DrizzleTicketSlaConfigStore,
  DrizzleTicketSlaConfigRecord,
  TicketPriority,
} from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// public types
// ---------------------------------------------------------------------------

export interface SlaStatus {
  /** Computed SLA deadline (createdAt + resolveMinutes). */
  readonly deadline: Date;
  /**
   * Milliseconds until the deadline; negative when overdue. For
   * closed tickets, computed against `closedAt` so a long-since-
   * closed ticket reports a stable historical value rather than
   * drifting with the wall clock.
   */
  readonly remainingMs: number;
  /** True when wall-clock (or closedAt) is past the deadline. */
  readonly breached: boolean;
  /**
   * True when (elapsed / window) >= warningThresholdPct. Always
   * false for closed tickets that closed before their warning
   * window, regardless of warningThresholdPct.
   */
  readonly warningThresholdReached: boolean;
  /** The config that produced this status (for display). */
  readonly priority: TicketPriority;
  readonly resolveMinutes: number;
  readonly warningThresholdPct: number;
  /** "open" | "honored" | "breached" — derived terminal state. */
  readonly state: 'open' | 'at_risk' | 'breached' | 'honored';
}

export interface TicketSlaServiceDeps {
  readonly slaConfigStore: DrizzleTicketSlaConfigStore;
  readonly ticketStore: DrizzleTicketStore;
  /**
   * Test-only override; defaults to `() => new Date()`. Lets tests
   * pin the wall clock without monkey-patching `Date.now`.
   */
  readonly now?: () => Date;
  /**
   * Per-priority config cache TTL. Default 60s. Tests pass 0 to
   * disable cache for assertion clarity.
   */
  readonly configCacheTtlMs?: number;
}

export interface OpenTicketsSlaSummary {
  /** All non-closed tickets seen during the walk. */
  readonly total: number;
  /** Tickets at or above their warning threshold (or pct override). */
  readonly atRiskCount: number;
  /** Subset of atRiskCount that are already past deadline. */
  readonly breachedCount: number;
  /**
   * The actual at-risk tickets (with their SLA status). Bounded by
   * the same paginated walk that produces total. Useful for admin
   * dashboards that want to render the offending list.
   */
  readonly atRisk: readonly { ticket: DrizzleTicketRecord; sla: SlaStatus }[];
  /**
   * S17-CT-2 (post-Codex review): true when the safety cap was hit
   * during pagination — the returned counts reflect the first
   * `safetyCap` open tickets, not the full backlog. Ops should
   * page in via the admin path or raise the cap. The SLO cron logs
   * a structured warning when this happens so ops sees it.
   */
  readonly truncated: boolean;
}

export interface TicketSlaService {
  /** Pure: compute SLA status for a given ticket against current configs. */
  computeSla(ticket: DrizzleTicketRecord): Promise<SlaStatus | null>;
  /**
   * Returns open tickets whose elapsed/window ratio is at or above
   * `pct`. Closed tickets are excluded. `pct` defaults to the
   * priority's own warningThresholdPct when omitted.
   *
   * S17-CT-2 (post-Codex): backed by the same paginated walk
   * `summarizeOpenTickets` uses, so the SLO cron numerator and
   * the admin dashboard listing always agree.
   */
  listAtRisk(pct?: number): Promise<readonly { ticket: DrizzleTicketRecord; sla: SlaStatus }[]>;
  /**
   * Single paginated walk over all non-closed tickets. Returns
   * counts (numerator + denominator from the same walk so they can
   * never disagree) plus the at-risk list. Sorted oldest-first so
   * the most-likely-overdue tickets are inspected before any
   * safety cap kicks in. Used by the SLO cron's
   * `getTicketSlaMetrics` and by `listAtRisk`.
   */
  summarizeOpenTickets(opts?: { pctOverride?: number }): Promise<OpenTicketsSlaSummary>;
  /** Force-refresh the per-priority config cache. */
  refreshConfigs(): Promise<void>;
}

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
/**
 * S17-CT-2 (post-Codex review): page size for the open-tickets walk
 * + safety cap on total tickets visited. Above the cap, the summary
 * is marked `truncated: true` and ops gets a structured warning.
 * 10k tickets is comfortably above realistic open-backlog sizes for
 * a single sprint window; raise via env if needed.
 */
const PAGE_SIZE = 200;
const SAFETY_CAP = 10_000;

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

interface ComputeSlaInput {
  ticket: DrizzleTicketRecord;
  config: DrizzleTicketSlaConfigRecord;
  now: Date;
}

export function computeSlaPure({ ticket, config, now }: ComputeSlaInput): SlaStatus {
  const windowMs = config.resolveMinutes * 60 * 1000;
  const deadline = new Date(ticket.createdAt.getTime() + windowMs);

  // For closed tickets, freeze the comparison clock at closedAt so
  // historical reads stay stable. Falls back to now() for the open
  // case (which is the hot path).
  const referenceTime = ticket.closedAt ?? now;
  const elapsedMs = referenceTime.getTime() - ticket.createdAt.getTime();
  const remainingMs = deadline.getTime() - referenceTime.getTime();
  const breached = remainingMs < 0;
  const consumedRatio = windowMs > 0 ? elapsedMs / windowMs : 1;
  const warningThresholdReached = consumedRatio >= config.warningThresholdPct;

  let state: SlaStatus['state'];
  if (ticket.closedAt) {
    state = breached ? 'breached' : 'honored';
  } else if (breached) {
    state = 'breached';
  } else if (warningThresholdReached) {
    state = 'at_risk';
  } else {
    state = 'open';
  }

  return {
    deadline,
    remainingMs,
    breached,
    warningThresholdReached,
    priority: config.priority,
    resolveMinutes: config.resolveMinutes,
    warningThresholdPct: config.warningThresholdPct,
    state,
  };
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createTicketSlaService(deps: TicketSlaServiceDeps): TicketSlaService {
  const now = deps.now ?? (() => new Date());
  const cacheTtlMs = deps.configCacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  let cache: Map<TicketPriority, DrizzleTicketSlaConfigRecord> | null = null;
  let cacheLoadedAt = 0;

  async function loadConfigs(): Promise<Map<TicketPriority, DrizzleTicketSlaConfigRecord>> {
    const ageMs = now().getTime() - cacheLoadedAt;
    if (cache && ageMs < cacheTtlMs) return cache;
    const rows = await deps.slaConfigStore.list();
    cache = new Map(rows.map((r) => [r.priority, r]));
    cacheLoadedAt = now().getTime();
    return cache;
  }

  return {
    async computeSla(ticket) {
      const configs = await loadConfigs();
      const config = configs.get(ticket.priority);
      if (!config) return null; // priority has no SLA config row yet
      return computeSlaPure({ ticket, config, now: now() });
    },

    async listAtRisk(pct) {
      const summary = await this.summarizeOpenTickets({ pctOverride: pct });
      return summary.atRisk;
    },

    async summarizeOpenTickets(opts = {}) {
      const configs = await loadConfigs();
      const reference = now();
      const atRisk: { ticket: DrizzleTicketRecord; sla: SlaStatus }[] = [];
      let total = 0;
      let breachedCount = 0;
      let truncated = false;

      // Walk each open status oldest-first so at-risk tickets are
      // visited before any safety-cap eviction kicks in. Pagination
      // by createdAt-asc + offset is correct because tickets aren't
      // re-created.
      for (const status of ['open', 'in_progress', 'escalated'] as const) {
        let offset = 0;
        // Per-status loop bounded by the global SAFETY_CAP — a single
        // status with millions of tickets still gets walked through
        // safely.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (total >= SAFETY_CAP) {
            truncated = true;
            break;
          }
          const page = await deps.ticketStore.list({
            status,
            limit: PAGE_SIZE,
            offset,
            order: 'createdAt-asc',
          });
          if (page.rows.length === 0) break;

          for (const t of page.rows) {
            if (total >= SAFETY_CAP) {
              truncated = true;
              break;
            }
            total++;
            const config = configs.get(t.priority);
            if (!config) continue;
            // S17-CT-2 (post-Codex review): defensive zero-window
            // guard mirrors computeSlaPure's. Schema-level CHECK
            // makes 0 unreachable in practice; keep this so a
            // pre-CHECK row imported from a backup doesn't crash.
            const windowMs = config.resolveMinutes * 60 * 1000;
            const consumedRatio = windowMs > 0
              ? (reference.getTime() - t.createdAt.getTime()) / windowMs
              : 1;
            const threshold = opts.pctOverride ?? config.warningThresholdPct;
            if (consumedRatio < threshold) continue;
            const sla = computeSlaPure({ ticket: t, config, now: reference });
            atRisk.push({ ticket: t, sla });
            if (sla.breached) breachedCount++;
          }

          if (page.rows.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
        if (truncated) break;
      }

      return {
        total,
        atRiskCount: atRisk.length,
        breachedCount,
        atRisk,
        truncated,
      };
    },

    async refreshConfigs() {
      cache = null;
      cacheLoadedAt = 0;
      await loadConfigs();
    },
  };
}
