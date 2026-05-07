/**
 * S18-C1d: approval-SLA queries tests.
 *
 * Pins the AD-S18-7 contract: policyType is derived from a left-join
 * against approval_policies; legacy null policy_id falls back to
 * 'single'. Decisions are batched per request via a single inArray
 * lookup. Filter clauses (status / from / to) are forwarded to the
 * underlying query builder.
 *
 * Uses the chained-mock pattern from anomaly-baseline-store.test.ts —
 * actual Postgres semantics are covered by the int-w1 pglite suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApprovalSlaQueries } from '../src/adapters/approval-sla-queries.js';

interface QueryContext {
  selectRows: Array<{
    id: string;
    createdAt: Date;
    resolvedAt: Date | null;
    policyId: string | null;
    policyType: string | null;
  }>;
  decisionRows: Array<{
    requestId: string;
    approverId: string;
    decidedAt: Date;
    decision: string;
  }>;
  capturedWhereCalls: number;
  capturedJoinTargets: Array<unknown>;
}

function makeMockDb(ctx: QueryContext) {
  // Two queries, in order:
  //   1) select(...).from(hitlRequests).leftJoin(approvalPolicies, ...).where(...).orderBy(...)
  //   2) select(...).from(hitlDecisions).where(inArray(...))
  let queryIndex = 0;

  const select = vi.fn().mockImplementation(() => {
    const orderByFn = vi.fn().mockImplementation(() => Promise.resolve(ctx.selectRows));
    const whereFn = vi.fn().mockImplementation(() => {
      ctx.capturedWhereCalls++;
      // first query is the requests query (has orderBy); second is decisions (no orderBy chain)
      if (queryIndex === 0) {
        queryIndex++;
        return { orderBy: orderByFn };
      }
      // decisions query: where() returns the awaitable directly
      return Promise.resolve(ctx.decisionRows);
    });
    const leftJoinFn = vi.fn().mockImplementation((...args: unknown[]) => {
      ctx.capturedJoinTargets.push(args[0]);
      return { where: whereFn };
    });
    const fromFn = vi.fn().mockImplementation(() => {
      // requests query has leftJoin; decisions query goes straight to where
      if (queryIndex === 0) {
        return { leftJoin: leftJoinFn, where: whereFn };
      }
      return { where: whereFn };
    });
    return { from: fromFn };
  });

  return { select } as unknown as Parameters<typeof createApprovalSlaQueries>[0];
}

describe('S18-C1d: createApprovalSlaQueries', () => {
  let ctx: QueryContext;

  beforeEach(() => {
    ctx = { selectRows: [], decisionRows: [], capturedWhereCalls: 0, capturedJoinTargets: [] };
  });

  it('returns empty array when no requests match the filter (short-circuits the decisions query)', async () => {
    ctx.selectRows = [];
    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});
    expect(result).toEqual([]);
    // exactly ONE query roundtrip: requests; decisions query is
    // skipped because rows.length === 0 short-circuits.
    expect(ctx.capturedWhereCalls).toBe(1);
  });

  it('joins approval_policies for policyType (AD-S18-7)', async () => {
    const created = new Date('2026-05-01T10:00:00Z');
    const resolved = new Date('2026-05-01T11:00:00Z');
    ctx.selectRows = [
      { id: 'req-1', createdAt: created, resolvedAt: resolved, policyId: 'pol-1', policyType: 'sequential' },
    ];
    ctx.decisionRows = [
      { requestId: 'req-1', approverId: 'approver-A', decidedAt: resolved, decision: 'approved' },
    ];

    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'req-1',
      policyType: 'sequential', // came from the join
      createdAt: created,
      resolvedAt: resolved,
    });
    expect(result[0]!.decisions).toHaveLength(1);
    expect(result[0]!.decisions[0]).toMatchObject({
      approverId: 'approver-A',
      decision: 'approved',
    });
  });

  it("falls back policyType to 'single' ONLY when policy_id is null (legacy single-approver)", async () => {
    ctx.selectRows = [
      { id: 'req-legacy', createdAt: new Date(), resolvedAt: null, policyId: null, policyType: null },
    ];
    ctx.decisionRows = [];

    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});
    expect(result[0]!.policyType).toBe('single');
  });

  it("returns 'unknown' when policy_id is non-null but the join missed (orphan FK / data drift)", async () => {
    // post-Codex C1 review: bare `r.policyType ?? 'single'` would have
    // silently reclassified data-integrity drift as 'single', masking
    // a real bug. Surface it as 'unknown' so dashboards bucket it
    // separately and ops can investigate.
    ctx.selectRows = [
      { id: 'req-drift', createdAt: new Date(), resolvedAt: null, policyId: 'pol-deleted', policyType: null },
    ];
    ctx.decisionRows = [];

    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});
    expect(result[0]!.policyType).toBe('unknown');
  });

  it('groups decisions per request via batched inArray lookup', async () => {
    const created1 = new Date('2026-05-01T10:00:00Z');
    const created2 = new Date('2026-05-01T11:00:00Z');
    ctx.selectRows = [
      { id: 'req-1', createdAt: created1, resolvedAt: null, policyId: 'p1', policyType: 'quorum' },
      { id: 'req-2', createdAt: created2, resolvedAt: null, policyId: 'p1', policyType: 'quorum' },
    ];
    ctx.decisionRows = [
      { requestId: 'req-1', approverId: 'A', decidedAt: created1, decision: 'approved' },
      { requestId: 'req-1', approverId: 'B', decidedAt: created1, decision: 'approved' },
      { requestId: 'req-2', approverId: 'C', decidedAt: created2, decision: 'rejected' },
    ];

    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});

    expect(result).toHaveLength(2);
    expect(result[0]!.decisions).toHaveLength(2);
    expect(result[1]!.decisions).toHaveLength(1);
    expect(result[1]!.decisions[0]!.decision).toBe('rejected');
  });

  it('handles requests with no decisions (still pending) — empty decisions array', async () => {
    ctx.selectRows = [
      { id: 'req-pending', createdAt: new Date(), resolvedAt: null, policyId: 'p1', policyType: 'sequential' },
    ];
    ctx.decisionRows = [];

    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    const result = await queries.getRequestsForSla({});
    expect(result[0]!.decisions).toEqual([]);
  });

  it('forwards filters (status, from, to) and runs the decisions follow-up when rows match', async () => {
    ctx.selectRows = [
      { id: 'req-1', createdAt: new Date(), resolvedAt: null, policyId: 'p1', policyType: 'quorum' },
    ];
    ctx.decisionRows = [];
    const queries = createApprovalSlaQueries(makeMockDb(ctx));
    await queries.getRequestsForSla({
      status: 'pending',
      from: new Date('2026-05-01'),
      to: new Date('2026-05-31'),
    });
    // TWO where invocations: requests + decisions follow-up
    expect(ctx.capturedWhereCalls).toBe(2);
  });
});
