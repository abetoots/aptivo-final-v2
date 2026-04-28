/**
 * S17-CT-2: TicketSlaService unit tests
 * @task S17-CT-2
 *
 * Verifies the pure SLA math + the listAtRisk filtering loop. Stub
 * stores; clock pinned via the now() injection so deadline assertions
 * are deterministic.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createTicketSlaService,
  computeSlaPure,
} from '../../src/lib/case-tracking/ticket-sla-service';
import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  DrizzleTicketSlaConfigStore,
  DrizzleTicketSlaConfigRecord,
  TicketPriority,
} from '@aptivo/database/adapters';

const FIXED_NOW = new Date('2026-04-26T12:00:00Z');

function makeTicket(overrides: Partial<DrizzleTicketRecord> = {}): DrizzleTicketRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workflowDefinitionId: null,
    status: 'open',
    priority: 'medium',
    title: 't',
    body: 'b',
    ownerUserId: '22222222-2222-4222-8222-222222222222',
    departmentId: null,
    createdAt: new Date('2026-04-26T10:00:00Z'),
    updatedAt: new Date('2026-04-26T10:00:00Z'),
    closedAt: null,
    escalationState: null,
    ...overrides,
  };
}

function makeConfig(priority: TicketPriority, resolveMinutes: number, warningPct = 0.8): DrizzleTicketSlaConfigRecord {
  return {
    priority,
    resolveMinutes,
    warningThresholdPct: warningPct,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeSlaStore(configs: readonly DrizzleTicketSlaConfigRecord[]): DrizzleTicketSlaConfigStore {
  return {
    list: vi.fn().mockResolvedValue(configs),
    get: vi.fn().mockImplementation(async (p: TicketPriority) => configs.find((c) => c.priority === p) ?? null),
    upsert: vi.fn(),
  };
}

function makeTicketStore(rows: readonly DrizzleTicketRecord[]): DrizzleTicketStore {
  // S17-CT-2 (post-Codex review): summarizeOpenTickets paginates per
  // status with limit/offset/order. Mock implements that contract.
  const byStatus = (s: string) => {
    const sorted = rows.filter((r) => r.status === s).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return sorted;
  };
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn().mockImplementation(async (params?: { status?: string; limit?: number; offset?: number; order?: 'createdAt-asc' | 'createdAt-desc' }) => {
      let slice = params?.status ? byStatus(params.status) : rows.slice();
      if (params?.order === 'createdAt-desc') slice = slice.slice().reverse();
      const offset = params?.offset ?? 0;
      const limit = params?.limit ?? 200;
      return { rows: slice.slice(offset, offset + limit), totalCount: slice.length };
    }),
    update: vi.fn(),
    softClose: vi.fn(),
    setEscalationState: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// computeSlaPure
// ---------------------------------------------------------------------------

describe('S17-CT-2: computeSlaPure', () => {
  it('returns deadline = createdAt + resolveMinutes', () => {
    const ticket = makeTicket({ createdAt: new Date('2026-04-26T10:00:00Z'), priority: 'high' });
    const config = makeConfig('high', 60); // 1h
    const sla = computeSlaPure({ ticket, config, now: FIXED_NOW });
    expect(sla.deadline).toEqual(new Date('2026-04-26T11:00:00Z'));
  });

  it('reports breached=true when wall clock is past the deadline', () => {
    const ticket = makeTicket({ createdAt: new Date('2026-04-26T10:00:00Z'), priority: 'critical' });
    // 1h window + 2h elapsed = breached
    const sla = computeSlaPure({ ticket, config: makeConfig('critical', 60), now: FIXED_NOW });
    expect(sla.breached).toBe(true);
    expect(sla.remainingMs).toBeLessThan(0);
    expect(sla.state).toBe('breached');
  });

  it('reports warningThresholdReached when (elapsed / window) >= 0.80', () => {
    // window 100min, elapsed 90min → 90% consumed > 80% threshold
    const ticket = makeTicket({
      createdAt: new Date('2026-04-26T10:30:00Z'), // 90 min before noon
      priority: 'medium',
    });
    const sla = computeSlaPure({ ticket, config: makeConfig('medium', 100, 0.8), now: FIXED_NOW });
    expect(sla.warningThresholdReached).toBe(true);
    expect(sla.breached).toBe(false);
    expect(sla.state).toBe('at_risk');
  });

  it('reports state=open when below the warning threshold', () => {
    // 50% consumed
    const ticket = makeTicket({
      createdAt: new Date('2026-04-26T11:00:00Z'),
      priority: 'medium',
    });
    const sla = computeSlaPure({ ticket, config: makeConfig('medium', 120, 0.8), now: FIXED_NOW });
    expect(sla.warningThresholdReached).toBe(false);
    expect(sla.state).toBe('open');
  });

  it('uses closedAt instead of now() for closed tickets — historical reads stay stable', () => {
    // closed inside the window; querying months later should still report 'honored'
    const ticket = makeTicket({
      createdAt: new Date('2026-04-26T10:00:00Z'),
      closedAt: new Date('2026-04-26T10:30:00Z'), // 30 min < 60 min window
      status: 'closed',
      priority: 'high',
    });
    const muchLater = new Date('2027-01-01T00:00:00Z');
    const sla = computeSlaPure({ ticket, config: makeConfig('high', 60), now: muchLater });
    expect(sla.breached).toBe(false);
    expect(sla.state).toBe('honored');
  });

  it('reports state=breached for closed tickets that closed past the deadline', () => {
    const ticket = makeTicket({
      createdAt: new Date('2026-04-26T10:00:00Z'),
      closedAt: new Date('2026-04-26T13:00:00Z'),
      status: 'closed',
      priority: 'critical',
    });
    const sla = computeSlaPure({ ticket, config: makeConfig('critical', 60), now: FIXED_NOW });
    expect(sla.breached).toBe(true);
    expect(sla.state).toBe('breached');
  });
});

// ---------------------------------------------------------------------------
// service-level
// ---------------------------------------------------------------------------

describe('S17-CT-2: createTicketSlaService', () => {
  it('computeSla returns null when the ticket priority has no config', async () => {
    const service = createTicketSlaService({
      slaConfigStore: makeSlaStore([]),
      ticketStore: makeTicketStore([]),
      now: () => FIXED_NOW,
      configCacheTtlMs: 0,
    });
    const sla = await service.computeSla(makeTicket({ priority: 'low' }));
    expect(sla).toBeNull();
  });

  it('listAtRisk filters open tickets by elapsed/window ratio', async () => {
    // mix of three open tickets at different consumption ratios
    const safe = makeTicket({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: new Date('2026-04-26T11:30:00Z'), // 30min ago, 50min window → 60% consumed
      priority: 'medium',
    });
    const atRisk = makeTicket({
      id: '00000000-0000-4000-8000-000000000002',
      createdAt: new Date('2026-04-26T11:10:00Z'), // 50min ago, 60min window → 83% consumed
      priority: 'medium',
    });
    const breached = makeTicket({
      id: '00000000-0000-4000-8000-000000000003',
      createdAt: new Date('2026-04-26T10:00:00Z'), // 120min ago, 60min window → 200% consumed
      priority: 'medium',
    });
    const closed = makeTicket({
      id: '00000000-0000-4000-8000-000000000004',
      createdAt: new Date('2026-04-26T10:00:00Z'),
      closedAt: new Date('2026-04-26T11:00:00Z'),
      status: 'closed',
      priority: 'medium',
    });

    const service = createTicketSlaService({
      slaConfigStore: makeSlaStore([
        makeConfig('medium', 60, 0.8), // safe path uses different window — set 50min for safe
      ]),
      ticketStore: makeTicketStore([safe, atRisk, breached, closed]),
      now: () => FIXED_NOW,
      configCacheTtlMs: 0,
    });

    const result = await service.listAtRisk();
    const ids = result.map((r) => r.ticket.id).sort();
    // closed ticket excluded; safe excluded; atRisk + breached included
    expect(ids).toEqual([atRisk.id, breached.id].sort());
  });

  it('listAtRisk respects an explicit pct override', async () => {
    const ticket = makeTicket({
      createdAt: new Date('2026-04-26T11:30:00Z'), // 30min ago, 60min window → 50% consumed
      priority: 'medium',
    });
    const service = createTicketSlaService({
      slaConfigStore: makeSlaStore([makeConfig('medium', 60, 0.8)]),
      ticketStore: makeTicketStore([ticket]),
      now: () => FIXED_NOW,
      configCacheTtlMs: 0,
    });
    // override threshold to 0.40 — 50% > 40% → at risk
    const result = await service.listAtRisk(0.40);
    expect(result.map((r) => r.ticket.id)).toEqual([ticket.id]);
  });

  it('summarizeOpenTickets returns total + atRiskCount + breachedCount from a single walk (Codex post-review)', async () => {
    const safe = makeTicket({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: new Date('2026-04-26T11:30:00Z'), // 30min ago, 60min window → 50%
      priority: 'medium',
    });
    const atRisk = makeTicket({
      id: '00000000-0000-4000-8000-000000000002',
      createdAt: new Date('2026-04-26T11:10:00Z'), // 50min ago → 83%
      priority: 'medium',
    });
    const breached = makeTicket({
      id: '00000000-0000-4000-8000-000000000003',
      createdAt: new Date('2026-04-26T10:00:00Z'), // 120min ago → 200%
      priority: 'medium',
    });

    const service = createTicketSlaService({
      slaConfigStore: makeSlaStore([makeConfig('medium', 60, 0.8)]),
      ticketStore: makeTicketStore([safe, atRisk, breached]),
      now: () => FIXED_NOW,
      configCacheTtlMs: 0,
    });

    const summary = await service.summarizeOpenTickets();
    expect(summary.total).toBe(3);
    expect(summary.atRiskCount).toBe(2);
    expect(summary.breachedCount).toBe(1);
    expect(summary.truncated).toBe(false);
    expect(summary.atRisk.map((r) => r.ticket.id).sort()).toEqual([atRisk.id, breached.id].sort());
  });

  it('caches configs and refreshes on demand', async () => {
    const slaStore = makeSlaStore([makeConfig('high', 60)]);
    const service = createTicketSlaService({
      slaConfigStore: slaStore,
      ticketStore: makeTicketStore([]),
      now: () => FIXED_NOW,
      configCacheTtlMs: 60_000,
    });

    await service.computeSla(makeTicket({ priority: 'high' }));
    await service.computeSla(makeTicket({ priority: 'high' }));
    // single store.list call thanks to cache
    expect(slaStore.list).toHaveBeenCalledTimes(1);

    await service.refreshConfigs();
    expect(slaStore.list).toHaveBeenCalledTimes(2);
  });
});
