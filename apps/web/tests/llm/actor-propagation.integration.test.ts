/**
 * S18-A1: actor-propagation mechanism test (end-to-end through the
 * real audit service over an in-memory store).
 *
 * Verifies the in-process mechanism that closes Gates #2/#3 — given a
 * decision event whose payload carries `approverId`, the
 * contract-approval workflow's audit emit goes through the real
 * `createAuditService` and lands a row whose `user_id` is populated;
 * the anomaly-gate aggregate (`WHERE user_id = $actor`) then matches
 * a non-zero count for that user. Pre-S18 the workflow used
 * `actor.type='workflow'`/`'system'` so user_id was always NULL and
 * the aggregate returned zero on workflow traffic.
 *
 * Test shape:
 *   1. Wire a real `createAuditService` (NOT a mock) over an in-memory
 *      `AuditStore` that mirrors the production WHERE clause from
 *      audit-store-drizzle.ts:145 — the same audit-service.ts:61
 *      mapping (`userId = type==='user' ? id : null`) runs.
 *   2. Drive the contract-approval workflow through `InngestTestEngine`,
 *      INJECTING a synthetic `hr/contract.decision.submitted` event with
 *      `approverId` populated. (Synthetic injection is the documented
 *      InngestTestEngine technique for unit/integration testing.)
 *   3. Inspect the inserted records: post-HITL row has
 *      `userId === '<approver>'` AND `actorType === 'user'`.
 *   4. Run `aggregateAccessPattern({ actor: '<approver>', ... })`
 *      against the same store; assert exactly `count === 1` per fresh
 *      per-test store.
 *
 * SCOPE LIMITATIONS (honest framing — not failures):
 *
 *   - The HR-specific event `hr/contract.decision.submitted` has no
 *     production emitter today (Codex round-1 review caught this; see
 *     S18_A1_MULTI_REVIEW.md). The real HITL gateway emits
 *     `hitl/decision.recorded`; nothing bridges that to the HR-domain
 *     wrapper. So the contract-approval workflow may not be reachable
 *     end-to-end from real HITL traffic until a bridge lands (likely
 *     in B2 HR onboarding or a later HR sprint). This test still
 *     proves the *mechanism* — actor.type → user_id mapping +
 *     aggregate filter — works correctly when the decision payload
 *     arrives with `approverId`.
 *
 *   - Block/allow decisions of the anomaly gate are not exercised; the
 *     gate-component tests cover that. Here we prove the input channel
 *     (the audit aggregate) is non-zero, which was the load-bearing
 *     gap.
 *
 *   - `actor.type='system'` fallback path on missing approverId is
 *     tested in s7-hr-02-contract-approval.test.ts.
 *
 *   - The contract-approval workflow has no pre-HITL emit; the
 *     post-HITL `audit-trail` is the only emit site.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';
import { createAuditService, DEFAULT_MASKING_CONFIG } from '@aptivo/audit';
import type {
  AuditStore,
  ChainHead,
  InsertAuditLog,
} from '@aptivo/audit';

// ---------------------------------------------------------------------------
// in-memory AuditStore — same insert/aggregate semantics as the Drizzle
// adapter at packages/database/src/adapters/audit-store-drizzle.ts. Kept
// inline so the test is self-contained; production behaviour is covered
// by the int-w1 suite + the live deployment.
// ---------------------------------------------------------------------------

interface StoredRecord extends InsertAuditLog {
  id: string;
  createdAt: Date;
}

function createInMemoryAuditStore(): AuditStore & {
  inserted(): readonly StoredRecord[];
} {
  const records: StoredRecord[] = [];
  const heads = new Map<string, ChainHead>();
  let nextId = 1;

  return {
    async lockChainHead(scope: string): Promise<ChainHead | null> {
      // no real locking needed in single-threaded tests; mirror the
      // semantic shape (return current head or null)
      return heads.get(scope) ?? null;
    },

    async updateChainHead(scope: string, seq: number, hash: string): Promise<void> {
      heads.set(scope, { lastSeq: seq, lastHash: hash });
    },

    async insert(record: InsertAuditLog): Promise<{ id: string }> {
      const id = `audit-${nextId++}`;
      records.push({ ...record, id, createdAt: new Date() });
      return { id };
    },

    async aggregateAccessPattern(params: {
      actor: string;
      resourceTypes: readonly string[];
      actions?: readonly string[];
      windowMs: number;
    }) {
      // mirror Drizzle's WHERE clause: user_id = actor AND
      // resource_type IN (...) AND (actions empty OR action IN actions)
      // AND created_at within window
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - params.windowMs);

      if (params.resourceTypes.length === 0) {
        return {
          actor: params.actor,
          resourceType: '',
          action: params.actions?.join(',') ?? 'any',
          count: 0,
          windowStart,
          windowEnd,
        };
      }

      const matches = records.filter((r) =>
        r.userId === params.actor
        && params.resourceTypes.includes(r.resourceType)
        && (!params.actions || params.actions.length === 0 || params.actions.includes(r.action))
        && r.createdAt >= windowStart
        && r.createdAt <= windowEnd,
      );

      return {
        actor: params.actor,
        resourceType: params.resourceTypes.join(','),
        action: params.actions?.join(',') ?? 'any',
        count: matches.length,
        windowStart,
        windowEnd,
      };
    },

    inserted: () => records,
  };
}

// ---------------------------------------------------------------------------
// mocks — wire the real audit service over the in-memory store, mock
// the rest of services.ts to keep the test scope tight.
//
// Test isolation: the store reference is mutable so beforeEach can swap
// it for a fresh instance — module-scope singletons would leak rows
// across tests and let later assertions pass on prior-test state
// (Codex round-1 review caught this).
// ---------------------------------------------------------------------------

let auditStore: ReturnType<typeof createInMemoryAuditStore>;
let realAuditService: ReturnType<typeof createAuditService>;

const mockContractStore = {
  create: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
};

const mockLlmGateway = {
  complete: vi.fn(),
};

const mockHitlService = {
  createRequest: vi.fn(),
};

const mockNotificationService = {
  send: vi.fn(),
};

vi.mock('../../src/lib/services', () => ({
  getContractStore: () => mockContractStore,
  getLlmGateway: () => mockLlmGateway,
  getHitlService: () => mockHitlService,
  getHitlMultiApproverService: () => null,
  getNotificationService: () => mockNotificationService,
  // closure over the mutable binding so beforeEach swaps propagate
  getAuditService: () => realAuditService,
}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-actor-propagation' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

// ---------------------------------------------------------------------------
// import after mocks (vi.mock is hoisted, so this stays consistent)
// ---------------------------------------------------------------------------

import { contractApprovalFn } from '../../src/lib/workflows/hr-contract-approval.js';

// ---------------------------------------------------------------------------
// fixture helpers
// ---------------------------------------------------------------------------

const APPROVER_ID = 'reviewer-9af6c4a3';

const triggerEvent = () =>
  [
    {
      name: 'hr/contract.approval.requested' as const,
      data: {
        candidateId: 'cand-int-001',
        positionId: 'pos-int-001',
        templateSlug: 'employment-agreement',
        terms: { salary: 100_000, startDate: '2026-05-01', noticePeriod: '30 days' },
        requestedBy: 'user-init-001',
        domain: 'hr' as const,
      },
    },
  ] as [unknown];

const draftLlmResponse = () =>
  Result.ok({
    completion: {
      id: 'llm-draft',
      content: 'Employment Agreement draft text...',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    },
    costUsd: 0.001,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 80,
  });

const compliancePassResponse = () =>
  Result.ok({
    completion: {
      id: 'llm-compliance',
      content: '{"flags":[]}',
      finishReason: 'stop',
      usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 },
    },
    costUsd: 0.0008,
    provider: 'openai',
    wasFallback: false,
    latencyMs: 60,
  });

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-A1: actor propagation end-to-end', () => {
  beforeEach(() => {
    // fresh in-memory audit store + service per test — prevents inserts
    // from leaking across tests (Codex/Gemini round-1 caught the
    // module-scoped singleton hazard)
    auditStore = createInMemoryAuditStore();
    realAuditService = createAuditService({
      store: auditStore,
      masking: DEFAULT_MASKING_CONFIG,
    });

    // mock fixtures need to be reset too: vi.fn() reuses the same
    // function instance across tests, so .mockResolvedValueOnce calls
    // queue up unless cleared
    vi.clearAllMocks();

    mockContractStore.create.mockResolvedValue({ id: 'contract-int-001' });
    mockContractStore.updateStatus.mockResolvedValue(undefined);
    mockLlmGateway.complete
      .mockResolvedValueOnce(draftLlmResponse())
      .mockResolvedValueOnce(compliancePassResponse());
    mockHitlService.createRequest.mockResolvedValue(
      Result.ok({
        requestId: 'hitl-int-001',
        approveUrl: 'https://t/approve',
        rejectUrl: 'https://t/reject',
      }),
    );
    mockNotificationService.send.mockResolvedValue({ ok: true });
  });

  it('post-HITL audit row populates user_id with the approver id and actor_type=user', async () => {
    const engine = new InngestTestEngine({
      function: contractApprovalFn,
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-contract-decision',
          handler: () => ({
            name: 'hr/contract.decision.submitted',
            data: {
              requestId: 'hitl-int-001',
              decision: 'approved',
              approverId: APPROVER_ID,
              domain: 'hr',
            },
          }),
        },
      ],
    });

    await engine.execute();

    const inserted = auditStore.inserted();
    // we expect exactly one audit row from the contract-approval workflow
    // — the audit-trail step at the terminus. Pre-HITL steps don't emit.
    expect(inserted).toHaveLength(1);

    const row = inserted[0]!;
    // the load-bearing assertion: user_id is populated AND actor_type is 'user'.
    // pre-S18 this row had userId=null and actorType='workflow'.
    expect(row.userId).toBe(APPROVER_ID);
    expect(row.actorType).toBe('user');
    expect(row.action).toBe('hr.contract.finalized');
    expect(row.resourceType).toBe('contract');
  });

  it('aggregateAccessPattern returns non-zero count for the approver scope (anomaly-gate input)', async () => {
    const engine = new InngestTestEngine({
      function: contractApprovalFn,
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-contract-decision',
          handler: () => ({
            name: 'hr/contract.decision.submitted',
            data: {
              requestId: 'hitl-int-001',
              decision: 'approved',
              approverId: APPROVER_ID,
              domain: 'hr',
            },
          }),
        },
      ],
    });

    await engine.execute();

    // mirror what the anomaly gate does today: aggregate audit_logs
    // scoped to (actor, resourceTypes) within a window. Pre-S18 this
    // returned count=0 because no workflow row had user_id set; this
    // test asserts the gate's input channel is now non-zero.
    const aggregate = await auditStore.aggregateAccessPattern({
      actor: APPROVER_ID,
      resourceTypes: ['contract'],
      windowMs: 60_000,
    });

    // exactly 1 row inserted by the workflow's audit-trail step (the
    // store is fresh per test, so no leakage from prior tests).
    expect(aggregate.count).toBe(1);
    expect(aggregate.actor).toBe(APPROVER_ID);
  });

  it('aggregate is zero for a different user — scope is per-actor, not global', async () => {
    const engine = new InngestTestEngine({
      function: contractApprovalFn,
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-contract-decision',
          handler: () => ({
            name: 'hr/contract.decision.submitted',
            data: {
              requestId: 'hitl-int-001',
              decision: 'approved',
              approverId: APPROVER_ID,
              domain: 'hr',
            },
          }),
        },
      ],
    });

    await engine.execute();

    const aggregate = await auditStore.aggregateAccessPattern({
      actor: 'someone-else',
      resourceTypes: ['contract'],
      windowMs: 60_000,
    });

    expect(aggregate.count).toBe(0);
  });
});
