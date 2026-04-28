/**
 * S17-CT-4: TicketReportService unit tests.
 * @task S17-CT-4
 *
 * Verifies the per-priority aggregation, the zero-division guards
 * (compliancePct=null when totalClosed=0), the priority zero-fill
 * (all four priorities present in the response even when only one
 * has data), the window clamping, and the SLA-config threshold
 * conversion (resolveMinutes → seconds for the queries adapter).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTicketReportService,
  summarizeResolution,
  summarizeCompliance,
} from '../../src/lib/case-tracking/ticket-report-service';
import type {
  DrizzleTicketReportQueries,
  DrizzleTicketSlaConfigStore,
  DrizzleTicketSlaConfigRecord,
  PriorityComplianceRow,
  PriorityCount,
  PriorityResolutionRow,
  TicketPriority,
} from '@aptivo/database/adapters';

const FIXED_NOW = new Date('2026-04-28T12:00:00Z');

function makeConfigs(): readonly DrizzleTicketSlaConfigRecord[] {
  return [
    { priority: 'critical', resolveMinutes: 4 * 60, warningThresholdPct: 0.8, updatedAt: FIXED_NOW },
    { priority: 'high', resolveMinutes: 24 * 60, warningThresholdPct: 0.8, updatedAt: FIXED_NOW },
    { priority: 'medium', resolveMinutes: 3 * 24 * 60, warningThresholdPct: 0.8, updatedAt: FIXED_NOW },
    { priority: 'low', resolveMinutes: 7 * 24 * 60, warningThresholdPct: 0.8, updatedAt: FIXED_NOW },
  ];
}

function makeQueries(opts?: {
  open?: readonly PriorityCount[];
  resolution?: readonly PriorityResolutionRow[];
  compliance?: readonly PriorityComplianceRow[];
}): DrizzleTicketReportQueries & {
  openSpy: ReturnType<typeof vi.fn>;
  resolutionSpy: ReturnType<typeof vi.fn>;
  complianceSpy: ReturnType<typeof vi.fn>;
} {
  const openSpy = vi.fn(async () => opts?.open ?? []);
  const resolutionSpy = vi.fn(async (_cutoff: Date) => opts?.resolution ?? []);
  const complianceSpy = vi.fn(
    async (
      _cutoff: Date,
      _thresholdSecondsByPriority: Readonly<Partial<Record<TicketPriority, number>>>,
    ) => opts?.compliance ?? [],
  );
  return {
    openByPriority: openSpy,
    resolutionByPriority: resolutionSpy,
    slaComplianceByPriority: complianceSpy,
    openSpy,
    resolutionSpy,
    complianceSpy,
  };
}

function makeConfigStore(rows = makeConfigs()): DrizzleTicketSlaConfigStore {
  return {
    list: vi.fn(async () => rows),
    get: vi.fn(),
    upsert: vi.fn(),
  };
}

describe('S17-CT-4: pure helpers', () => {
  it('summarizeResolution returns null avg for empty rows but present priorities', () => {
    const out = summarizeResolution([]);
    expect(out.totalClosed).toBe(0);
    expect(out.avgResolutionMinutes).toBeNull();
    expect(out.byPriority.critical).toEqual({ totalClosed: 0, avgResolutionMinutes: null });
    expect(out.byPriority.high).toEqual({ totalClosed: 0, avgResolutionMinutes: null });
    expect(out.byPriority.medium).toEqual({ totalClosed: 0, avgResolutionMinutes: null });
    expect(out.byPriority.low).toEqual({ totalClosed: 0, avgResolutionMinutes: null });
  });

  it('summarizeResolution rounds the per-priority + overall averages', () => {
    const out = summarizeResolution([
      { priority: 'critical', totalClosed: 4, sumMinutes: 100 }, // avg 25
      { priority: 'high', totalClosed: 3, sumMinutes: 100 },     // avg 33 (rounded)
    ]);
    expect(out.totalClosed).toBe(7);
    expect(out.avgResolutionMinutes).toBe(29); // 200/7 = 28.57… → 29
    expect(out.byPriority.critical.avgResolutionMinutes).toBe(25);
    expect(out.byPriority.high.avgResolutionMinutes).toBe(33);
    // unmentioned priorities stay zero-filled
    expect(out.byPriority.medium).toEqual({ totalClosed: 0, avgResolutionMinutes: null });
  });

  it('summarizeResolution treats sumMinutes=null as 0 contribution but keeps totalClosed', () => {
    const out = summarizeResolution([
      { priority: 'low', totalClosed: 5, sumMinutes: null },
    ]);
    expect(out.totalClosed).toBe(5);
    // sum was null → no contribution; overall avg becomes 0/5 = 0
    expect(out.avgResolutionMinutes).toBe(0);
    expect(out.byPriority.low.avgResolutionMinutes).toBeNull();
  });

  it('summarizeCompliance returns null pct on empty (no division by zero)', () => {
    const out = summarizeCompliance({
      complianceRows: [
        { priority: 'critical', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'high', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'medium', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'low', totalClosed: 0, withinSlaCount: 0 },
      ],
    });
    expect(out.totalClosed).toBe(0);
    expect(out.evaluatedClosed).toBe(0);
    expect(out.compliancePct).toBeNull();
    expect(out.byPriority.critical).toEqual({ totalClosed: 0, withinSlaCount: 0, compliancePct: null });
    expect(out.unconfiguredPriorities).toEqual([]);
  });

  it('summarizeCompliance rounds compliancePct to basis points (full configuration)', () => {
    const out = summarizeCompliance({
      complianceRows: [
        { priority: 'critical', totalClosed: 8, withinSlaCount: 7 },
        { priority: 'high', totalClosed: 100, withinSlaCount: 33 },
        { priority: 'medium', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'low', totalClosed: 0, withinSlaCount: 0 },
      ],
    });
    expect(out.totalClosed).toBe(108);
    expect(out.evaluatedClosed).toBe(108);
    expect(out.withinSlaCount).toBe(40);
    expect(out.compliancePct).toBe(0.3704); // 40/108 rounded
    expect(out.byPriority.critical.compliancePct).toBe(0.875);
    expect(out.byPriority.high.compliancePct).toBe(0.33);
    expect(out.unconfiguredPriorities).toEqual([]);
  });

  // S17-CT-4 (post-Codex review): the HIGH finding was that closures
  // of unconfigured priorities silently disappeared from the
  // denominator, inflating compliancePct vs reality. Adapter now
  // returns withinSlaCount=null for unconfigured priorities (paired
  // with their real totalClosed in the same query snapshot, post-
  // Codex round 2 race fix). Service surfaces them in
  // `unconfiguredPriorities` and excludes them from the rate.
  it('summarizeCompliance keeps unconfigured-priority closures in totalClosed but null on the rate', () => {
    const out = summarizeCompliance({
      complianceRows: [
        // critical is configured (has a number); others are not (null)
        { priority: 'critical', totalClosed: 4, withinSlaCount: 4 },
        { priority: 'high', totalClosed: 6, withinSlaCount: null },
        { priority: 'medium', totalClosed: 0, withinSlaCount: null },
        { priority: 'low', totalClosed: 2, withinSlaCount: null },
      ],
    });
    // Honest denominator: 4 + 6 + 2 = 12 closures across all priorities
    expect(out.totalClosed).toBe(12);
    // Only `critical` is evaluable
    expect(out.evaluatedClosed).toBe(4);
    expect(out.withinSlaCount).toBe(4);
    expect(out.compliancePct).toBe(1); // 4/4, NOT 4/12
    // Per-priority: high + low report real totalClosed but null pct
    expect(out.byPriority.critical).toEqual({ totalClosed: 4, withinSlaCount: 4, compliancePct: 1 });
    expect(out.byPriority.high).toEqual({ totalClosed: 6, withinSlaCount: 0, compliancePct: null });
    expect(out.byPriority.low).toEqual({ totalClosed: 2, withinSlaCount: 0, compliancePct: null });
    // Surface the gap to dashboards
    expect(out.unconfiguredPriorities).toEqual(['high', 'low']);
  });

  // S17-CT-4 (post-Codex round 2): single-snapshot guarantee — both
  // numerator and denominator come from the same query row, so
  // compliancePct can never exceed 1 even under read-committed races.
  it('compliancePct stays in [0, 1] — paired numerator/denominator from the same row', () => {
    const out = summarizeCompliance({
      complianceRows: [
        { priority: 'critical', totalClosed: 5, withinSlaCount: 5 },
        { priority: 'high', totalClosed: 10, withinSlaCount: 0 },
        { priority: 'medium', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'low', totalClosed: 0, withinSlaCount: 0 },
      ],
    });
    expect(out.byPriority.critical.compliancePct).toBe(1);
    expect(out.byPriority.high.compliancePct).toBe(0);
    expect(out.compliancePct).toBeGreaterThanOrEqual(0);
    expect(out.compliancePct).toBeLessThanOrEqual(1);
  });
});

describe('S17-CT-4: createTicketReportService.getReport', () => {
  let queries: ReturnType<typeof makeQueries>;
  let configStore: DrizzleTicketSlaConfigStore;

  beforeEach(() => {
    queries = makeQueries({
      open: [
        { priority: 'critical', count: 3 },
        { priority: 'high', count: 5 },
        // medium + low intentionally absent — should zero-fill
      ],
      resolution: [
        { priority: 'critical', totalClosed: 2, sumMinutes: 200 },
        { priority: 'medium', totalClosed: 1, sumMinutes: 60 },
      ],
      // Adapter contract (post-Codex round 2): always returns all
      // four priorities; withinSlaCount is null when no threshold
      // was supplied — distinguishes "no SLA config" from "0 met SLA".
      compliance: [
        { priority: 'critical', totalClosed: 2, withinSlaCount: 2 },
        { priority: 'high', totalClosed: 0, withinSlaCount: 0 },
        { priority: 'medium', totalClosed: 1, withinSlaCount: 0 },
        { priority: 'low', totalClosed: 0, withinSlaCount: 0 },
      ],
    });
    configStore = makeConfigStore();
  });

  it('passes resolveMinutes-as-seconds to the compliance query for every configured priority', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    await service.getReport({ windowDays: 30 });
    expect(queries.complianceSpy).toHaveBeenCalledTimes(1);
    const [cutoff, thresholds] = queries.complianceSpy.mock.calls[0]!;
    // S17-CT-4 (post-Codex review): cutoff Date now flows through, not
    // a windowMs scalar — so the test clock reaches SQL.
    expect(cutoff).toEqual(new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000));
    expect(thresholds).toEqual({
      critical: 4 * 60 * 60,        // 4 hours in seconds
      high: 24 * 60 * 60,
      medium: 3 * 24 * 60 * 60,
      low: 7 * 24 * 60 * 60,
    });
    // resolutionByPriority should receive the same cutoff
    const [resCutoff] = queries.resolutionSpy.mock.calls[0]!;
    expect(resCutoff).toEqual(cutoff);
  });

  it('zero-fills all four priorities in openByPriority + reports openTotal', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 30 });
    expect(report.openByPriority).toEqual({ critical: 3, high: 5, medium: 0, low: 0 });
    expect(report.openTotal).toBe(8);
  });

  it('emits ISO start/end derived from injected now() and the window', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 7 });
    expect(report.windowDays).toBe(7);
    expect(report.windowEnd).toBe('2026-04-28T12:00:00.000Z');
    expect(report.windowStart).toBe('2026-04-21T12:00:00.000Z');
  });

  it('clamps windowDays to [1, 365] inside the service (defense-in-depth)', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    const tooSmall = await service.getReport({ windowDays: 0 });
    expect(tooSmall.windowDays).toBe(1);
    const tooLarge = await service.getReport({ windowDays: 9999 });
    expect(tooLarge.windowDays).toBe(365);
    const fractional = await service.getReport({ windowDays: 7.9 });
    expect(fractional.windowDays).toBe(7);
  });

  it('produces correct per-priority resolution + overall avg', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 30 });
    expect(report.resolution.totalClosed).toBe(3);
    // (200 + 60) / 3 = 86.67 → 87
    expect(report.resolution.avgResolutionMinutes).toBe(87);
    expect(report.resolution.byPriority.critical.avgResolutionMinutes).toBe(100);
    expect(report.resolution.byPriority.medium.avgResolutionMinutes).toBe(60);
    expect(report.resolution.byPriority.high.totalClosed).toBe(0);
  });

  it('produces correct per-priority compliance + overall pct (full configuration)', async () => {
    const service = createTicketReportService({ queries, slaConfigStore: configStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 30 });
    // totalClosed = sum of resolution rows (denominator across ALL priorities)
    expect(report.slaCompliance.totalClosed).toBe(3);
    expect(report.slaCompliance.evaluatedClosed).toBe(3); // all priorities configured
    expect(report.slaCompliance.withinSlaCount).toBe(2);
    expect(report.slaCompliance.compliancePct).toBe(0.6667); // 2/3 over evaluated
    expect(report.slaCompliance.unconfiguredPriorities).toEqual([]);
    expect(report.slaCompliance.byPriority.critical.compliancePct).toBe(1);
    expect(report.slaCompliance.byPriority.medium.compliancePct).toBe(0);
    // priorities with no closures: pct=null, not 0 — dashboards should
    // render "—" rather than a misleading 0%
    expect(report.slaCompliance.byPriority.high.compliancePct).toBeNull();
    expect(report.slaCompliance.byPriority.low.compliancePct).toBeNull();
  });

  // S17-CT-4 (post-Codex review): Codex flagged that closures of
  // unconfigured priorities silently disappeared from the denominator,
  // making compliancePct look better than reality. End-to-end
  // regression at the service level. After round-2, the adapter
  // returns all four priorities with withinSlaCount=null for the
  // unconfigured ones (paired with their real totalClosed in one
  // query) — service surfaces those in `unconfiguredPriorities` and
  // excludes them from the rate.
  it('reports unconfigured-priority closures honestly when only some priorities have configs', async () => {
    queries = makeQueries({
      open: [],
      resolution: [
        { priority: 'critical', totalClosed: 4, sumMinutes: 60 },
        { priority: 'high', totalClosed: 6, sumMinutes: 600 },
      ],
      compliance: [
        // adapter returns all four; withinSla=null marks "no config"
        { priority: 'critical', totalClosed: 4, withinSlaCount: 4 },
        { priority: 'high', totalClosed: 6, withinSlaCount: null },
        { priority: 'medium', totalClosed: 0, withinSlaCount: null },
        { priority: 'low', totalClosed: 0, withinSlaCount: null },
      ],
    });
    const partialConfigStore = makeConfigStore([
      { priority: 'critical', resolveMinutes: 4 * 60, warningThresholdPct: 0.8, updatedAt: FIXED_NOW },
    ]);
    const service = createTicketReportService({ queries, slaConfigStore: partialConfigStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 30 });

    // Honest denominator: 4 (critical) + 6 (high) = 10 closures
    expect(report.slaCompliance.totalClosed).toBe(10);
    // But only critical was evaluable
    expect(report.slaCompliance.evaluatedClosed).toBe(4);
    expect(report.slaCompliance.withinSlaCount).toBe(4);
    // Rate computed over the SAME population on numerator + denominator.
    // 4/4 = 1.0, NOT 4/10 = 0.4 (which would falsely suggest poor compliance).
    expect(report.slaCompliance.compliancePct).toBe(1);
    // High shows up here so dashboards can flag the missing config
    expect(report.slaCompliance.unconfiguredPriorities).toEqual(['high']);
    expect(report.slaCompliance.byPriority.high.totalClosed).toBe(6);
    expect(report.slaCompliance.byPriority.high.compliancePct).toBeNull();
  });

  it('still produces a valid report when the sla_configs table is empty', async () => {
    queries = makeQueries({
      open: [{ priority: 'critical', count: 1 }],
      resolution: [{ priority: 'critical', totalClosed: 1, sumMinutes: 30 }],
      compliance: [
        // adapter contract: all four priorities, all withinSla=null
        // because no thresholds supplied
        { priority: 'critical', totalClosed: 1, withinSlaCount: null },
        { priority: 'high', totalClosed: 0, withinSlaCount: null },
        { priority: 'medium', totalClosed: 0, withinSlaCount: null },
        { priority: 'low', totalClosed: 0, withinSlaCount: null },
      ],
    });
    const emptyConfigStore = makeConfigStore([]);
    const service = createTicketReportService({ queries, slaConfigStore: emptyConfigStore, now: () => FIXED_NOW });
    const report = await service.getReport({ windowDays: 30 });
    expect(report.slaCompliance.totalClosed).toBe(1);
    expect(report.slaCompliance.evaluatedClosed).toBe(0);
    expect(report.slaCompliance.compliancePct).toBeNull();
    expect(report.slaCompliance.unconfiguredPriorities).toEqual(['critical']);
    // open/resolution still work even without configs
    expect(report.openByPriority.critical).toBe(1);
    expect(report.resolution.byPriority.critical.avgResolutionMinutes).toBe(30);
    // compliance query was called with an empty threshold lookup
    const thresholds = queries.complianceSpy.mock.calls[0]![1];
    expect(thresholds).toEqual({});
  });
});
