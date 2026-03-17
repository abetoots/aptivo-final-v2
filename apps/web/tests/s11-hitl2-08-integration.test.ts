/**
 * HITL2-08: Integration Tests — Multi-Approver Lifecycle
 * @task HITL2-08
 *
 * cross-cutting integration tests that wire real service implementations
 * together using in-memory stores. validates the full multi-approver lifecycle
 * including quorum, sequential chain, resubmit, race conditions, and
 * parent/child orchestration.
 *
 * NO vi.mock — uses real implementations with in-memory stores.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMultiApproverRequestService,
  createMultiDecisionService,
  createResubmitService,
  createQuorumEngine,
  createSequentialChainRunner,
  createWorkflowOrchestrator,
  type ApprovalPolicyRecord,
  type ApprovalPolicyStore,
  type RequestTokenStore,
  type HitlRequestTokenRecord,
  type MultiDecisionStoreDeps,
  type MultiRequestServiceDeps,
  type MultiDecisionServiceDeps,
  type ResubmitServiceDeps,
  type ResubmitStoreDeps,
  type EventSender,
  type WorkflowStep,
} from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const APPROVER_1 = '11111111-1111-4111-a111-111111111111';
const APPROVER_2 = '22222222-2222-4222-a222-222222222222';
const APPROVER_3 = '33333333-3333-4333-a333-333333333333';
const WORKFLOW_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// in-memory stores
// ---------------------------------------------------------------------------

function createInMemoryPolicyStore(): ApprovalPolicyStore {
  const policies: ApprovalPolicyRecord[] = [];
  return {
    async create(p) {
      const record: ApprovalPolicyRecord = {
        ...p,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };
      policies.push(record);
      return record;
    },
    async findById(id) {
      return policies.find((p) => p.id === id) ?? null;
    },
    async findByName(name) {
      return policies.find((p) => p.name === name) ?? null;
    },
    async list() {
      return [...policies];
    },
  };
}

interface InMemoryRequest {
  id: string;
  workflowId: string;
  workflowStepId?: string;
  domain: string;
  actionType: string;
  summary: string;
  details?: Record<string, unknown>;
  approverId: string;
  status: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  policyId: string | null;
  retryCount: number;
  resolvedAt?: Date;
}

function createInMemoryRequestStore() {
  const requests: InMemoryRequest[] = [];
  return {
    async insert(r: InMemoryRequest) {
      requests.push(r);
      return { id: r.id };
    },
    async getRequest(id: string) {
      return requests.find((r) => r.id === id) ?? null;
    },
    async updateRequestStatusIfPending(id: string, newStatus: string) {
      const r = requests.find((x) => x.id === id);
      if (r && r.status === 'pending') {
        r.status = newStatus;
        r.resolvedAt = new Date();
        return { affected: 1 };
      }
      return { affected: 0 };
    },
    async updateRequestForResubmit(
      id: string,
      retryCount: number,
      tokenHash: string,
      tokenExpiresAt: Date,
    ) {
      const r = requests.find((x) => x.id === id);
      if (r) {
        r.retryCount = retryCount;
        r.status = 'pending';
        r.tokenHash = tokenHash;
        r.tokenExpiresAt = tokenExpiresAt;
      }
    },
    requests,
  };
}

function createInMemoryTokenStore(): RequestTokenStore & { tokens: HitlRequestTokenRecord[] } {
  const tokens: HitlRequestTokenRecord[] = [];
  return {
    async insertTokens(ts: HitlRequestTokenRecord[]) {
      tokens.push(...ts);
    },
    async findByRequestAndApprover(requestId: string, approverId: string) {
      // return the most recently inserted token (last match) to support resubmit flow
      const matches = tokens.filter(
        (t) => t.requestId === requestId && t.approverId === approverId,
      );
      return matches.length > 0 ? matches[matches.length - 1]! : null;
    },
    async findByRequestId(requestId: string) {
      return tokens.filter((t) => t.requestId === requestId);
    },
    tokens,
  };
}

interface InMemoryDecision {
  id: string;
  requestId: string;
  approverId: string;
  decision: string;
  comment?: string;
  channel: string;
  ipAddress?: string;
  userAgent?: string;
}

function createInMemoryDecisionStore(
  requestStore: ReturnType<typeof createInMemoryRequestStore>,
): MultiDecisionStoreDeps & { decisions: InMemoryDecision[] } {
  const decisions: InMemoryDecision[] = [];
  return {
    async getRequest(id: string) {
      return requestStore.getRequest(id);
    },
    async getDecisionsByRequestId(requestId: string) {
      return decisions
        .filter((d) => d.requestId === requestId)
        .map((d) => ({
          approverId: d.approverId,
          decision: d.decision as 'approved' | 'rejected' | 'request_changes',
        }));
    },
    async getDecisionByRequestAndApprover(
      requestId: string,
      approverId: string,
    ) {
      return (
        decisions.find(
          (d) => d.requestId === requestId && d.approverId === approverId,
        ) ?? null
      );
    },
    async insertDecision(d: Omit<InMemoryDecision, 'id'>) {
      const record = { ...d, id: crypto.randomUUID() };
      decisions.push(record);
      return { id: record.id };
    },
    async updateRequestStatusIfPending(id: string, status: string) {
      return requestStore.updateRequestStatusIfPending(id, status);
    },
    decisions,
  };
}

// ---------------------------------------------------------------------------
// mock token generation / verification
// ---------------------------------------------------------------------------

async function mockGenerateToken(payload: Record<string, unknown>) {
  const token = `jwt-${payload.approverId ?? 'default'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    token,
    hash: `hash-${token}`,
    expiresAt: new Date(Date.now() + 900_000),
  };
}

async function mockVerifyToken(token: string, expectedHash: string) {
  return expectedHash === `hash-${token}`;
}

// ---------------------------------------------------------------------------
// 1. full quorum lifecycle (2-of-3)
// ---------------------------------------------------------------------------

describe('full quorum lifecycle (2-of-3)', () => {
  let policyStore: ApprovalPolicyStore;
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let tokenStore: ReturnType<typeof createInMemoryTokenStore>;
  let decisionStore: ReturnType<typeof createInMemoryDecisionStore>;
  let requestService: ReturnType<typeof createMultiApproverRequestService>;
  let decisionService: ReturnType<typeof createMultiDecisionService>;
  let policy: ApprovalPolicyRecord;
  let emittedEvents: { name: string; data: Record<string, unknown> }[];

  beforeEach(async () => {
    policyStore = createInMemoryPolicyStore();
    requestStore = createInMemoryRequestStore();
    tokenStore = createInMemoryTokenStore();
    decisionStore = createInMemoryDecisionStore(requestStore);
    emittedEvents = [];

    // create a 2-of-3 quorum policy
    policy = await policyStore.create({
      name: 'quorum-2of3',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['manager', 'director', 'vp'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    requestService = createMultiApproverRequestService({
      requestStore,
      tokenStore,
      policyStore,
      generateToken: mockGenerateToken,
      config: { baseUrl: 'https://test.aptivo.dev' },
    });

    decisionService = createMultiDecisionService({
      store: decisionStore,
      tokenStore,
      policyStore,
      verifyToken: mockVerifyToken,
      emitEvent: async (event) => {
        emittedEvents.push(event);
      },
    });
  });

  it('creates request, first approval → pending, second approval → approved + finalized', async () => {
    // create multi-approver request
    const createResult = await requestService.createMultiApproverRequest({
      workflowId: WORKFLOW_ID,
      domain: 'finance',
      actionType: 'expense-approval',
      summary: 'Approve $10k expense',
      approverIds: [APPROVER_1, APPROVER_2, APPROVER_3],
      policyId: policy.id,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId, approvers } = createResult.value;
    expect(approvers).toHaveLength(3);

    // first approval
    const firstResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token: approvers[0]!.token,
      decision: 'approved',
      channel: 'web',
    });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    expect(firstResult.value.aggregate).toBe('pending');
    expect(firstResult.value.isFinalized).toBe(false);
    expect(emittedEvents).toHaveLength(0);

    // second approval → quorum met
    const secondResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_2,
      token: approvers[1]!.token,
      decision: 'approved',
      channel: 'web',
    });

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    expect(secondResult.value.aggregate).toBe('approved');
    expect(secondResult.value.isFinalized).toBe(true);

    // event emitted on finalization
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.name).toBe('hitl/decision.recorded');
    expect(emittedEvents[0]!.data.decision).toBe('approved');

    // verify request status updated
    const request = await requestStore.getRequest(requestId);
    expect(request?.status).toBe('approved');
  });

  it('third approval after finalization returns RequestAlreadyFinalizedError', async () => {
    const createResult = await requestService.createMultiApproverRequest({
      workflowId: WORKFLOW_ID,
      domain: 'finance',
      actionType: 'expense-approval',
      summary: 'Approve $10k expense',
      approverIds: [APPROVER_1, APPROVER_2, APPROVER_3],
      policyId: policy.id,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId, approvers } = createResult.value;

    // finalize with 2 approvals
    await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token: approvers[0]!.token,
      decision: 'approved',
      channel: 'web',
    });
    await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_2,
      token: approvers[1]!.token,
      decision: 'approved',
      channel: 'web',
    });

    // third approver tries after finalization
    const thirdResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_3,
      token: approvers[2]!.token,
      decision: 'approved',
      channel: 'web',
    });

    expect(thirdResult.ok).toBe(false);
    if (thirdResult.ok) return;
    expect(thirdResult.error._tag).toBe('RequestAlreadyFinalizedError');
  });
});

// ---------------------------------------------------------------------------
// 2. quorum rejection (impossible to reach threshold)
// ---------------------------------------------------------------------------

describe('quorum rejection (impossible to reach threshold)', () => {
  let policyStore: ApprovalPolicyStore;
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let tokenStore: ReturnType<typeof createInMemoryTokenStore>;
  let decisionStore: ReturnType<typeof createInMemoryDecisionStore>;
  let requestService: ReturnType<typeof createMultiApproverRequestService>;
  let decisionService: ReturnType<typeof createMultiDecisionService>;
  let policy: ApprovalPolicyRecord;
  let emittedEvents: { name: string; data: Record<string, unknown> }[];

  beforeEach(async () => {
    policyStore = createInMemoryPolicyStore();
    requestStore = createInMemoryRequestStore();
    tokenStore = createInMemoryTokenStore();
    decisionStore = createInMemoryDecisionStore(requestStore);
    emittedEvents = [];

    // 2-of-3 quorum
    policy = await policyStore.create({
      name: 'quorum-2of3-reject',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['a', 'b', 'c'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    requestService = createMultiApproverRequestService({
      requestStore,
      tokenStore,
      policyStore,
      generateToken: mockGenerateToken,
      config: { baseUrl: 'https://test.aptivo.dev' },
    });

    decisionService = createMultiDecisionService({
      store: decisionStore,
      tokenStore,
      policyStore,
      verifyToken: mockVerifyToken,
      emitEvent: async (event) => {
        emittedEvents.push(event);
      },
    });
  });

  it('2 rejections in 2-of-3 quorum → rejected (finalized)', async () => {
    const createResult = await requestService.createMultiApproverRequest({
      workflowId: WORKFLOW_ID,
      domain: 'hr',
      actionType: 'contract-approval',
      summary: 'Reject test',
      approverIds: [APPROVER_1, APPROVER_2, APPROVER_3],
      policyId: policy.id,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId, approvers } = createResult.value;

    // first rejection
    const firstResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token: approvers[0]!.token,
      decision: 'rejected',
      channel: 'web',
    });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    // 1 rejection out of 3 approvers, threshold 2 → 1 rejection leaves 2 remaining, still possible
    expect(firstResult.value.aggregate).toBe('pending');
    expect(firstResult.value.isFinalized).toBe(false);

    // second rejection → impossible to reach threshold
    const secondResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_2,
      token: approvers[1]!.token,
      decision: 'rejected',
      channel: 'web',
    });

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    expect(secondResult.value.aggregate).toBe('rejected');
    expect(secondResult.value.isFinalized).toBe(true);

    // event emitted on rejection finalization
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.data.decision).toBe('rejected');

    // request status updated
    const request = await requestStore.getRequest(requestId);
    expect(request?.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// 3. full sequential chain lifecycle
// ---------------------------------------------------------------------------

describe('full sequential chain lifecycle', () => {
  const runner = createSequentialChainRunner();

  it('evaluates 3-step chain: first → second → third → complete', () => {
    const policy: ApprovalPolicyRecord = {
      id: crypto.randomUUID(),
      name: 'seq-3-step',
      type: 'sequential',
      threshold: null,
      approverRoles: ['legal', 'finance', 'ceo'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
      createdAt: new Date(),
    };

    // step 0: no decisions yet → first approver active
    const step0 = runner.evaluateChain([], policy);
    expect(step0.ok).toBe(true);
    if (!step0.ok) return;
    expect(step0.value.currentStep).toBe(0);
    expect(step0.value.currentRole).toBe('legal');
    expect(step0.value.isComplete).toBe(false);
    expect(step0.value.aggregate).toBe('pending');

    // step 1: legal approves → finance is next
    const step1 = runner.evaluateChain(
      [{ approverId: 'usr-1', decision: 'approved', role: 'legal' }],
      policy,
    );
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    expect(step1.value.currentStep).toBe(1);
    expect(step1.value.currentRole).toBe('finance');
    expect(step1.value.completedSteps).toBe(1);

    // step 2: finance approves → ceo is next
    const step2 = runner.evaluateChain(
      [
        { approverId: 'usr-1', decision: 'approved', role: 'legal' },
        { approverId: 'usr-2', decision: 'approved', role: 'finance' },
      ],
      policy,
    );
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(step2.value.currentStep).toBe(2);
    expect(step2.value.currentRole).toBe('ceo');
    expect(step2.value.completedSteps).toBe(2);

    // step 3: ceo approves → chain complete
    const step3 = runner.evaluateChain(
      [
        { approverId: 'usr-1', decision: 'approved', role: 'legal' },
        { approverId: 'usr-2', decision: 'approved', role: 'finance' },
        { approverId: 'usr-3', decision: 'approved', role: 'ceo' },
      ],
      policy,
    );
    expect(step3.ok).toBe(true);
    if (!step3.ok) return;
    expect(step3.value.currentStep).toBe(3);
    expect(step3.value.currentRole).toBeNull();
    expect(step3.value.isComplete).toBe(true);
    expect(step3.value.aggregate).toBe('approved');
    expect(step3.value.completedSteps).toBe(3);
    expect(step3.value.totalSteps).toBe(3);
  });

  it('rejection at step 1 short-circuits the chain', () => {
    const policy: ApprovalPolicyRecord = {
      id: crypto.randomUUID(),
      name: 'seq-short-circuit',
      type: 'sequential',
      threshold: null,
      approverRoles: ['legal', 'finance', 'ceo'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
      createdAt: new Date(),
    };

    const result = runner.evaluateChain(
      [
        { approverId: 'usr-1', decision: 'approved', role: 'legal' },
        { approverId: 'usr-2', decision: 'rejected', role: 'finance' },
      ],
      policy,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isComplete).toBe(true);
    expect(result.value.aggregate).toBe('rejected');
    expect(result.value.currentStep).toBe(1);
    expect(result.value.currentRole).toBeNull();
  });

  it('request_changes pauses at current step', () => {
    const policy: ApprovalPolicyRecord = {
      id: crypto.randomUUID(),
      name: 'seq-changes',
      type: 'sequential',
      threshold: null,
      approverRoles: ['legal', 'finance'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
      createdAt: new Date(),
    };

    const result = runner.evaluateChain(
      [{ approverId: 'usr-1', decision: 'request_changes', role: 'legal' }],
      policy,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.currentStep).toBe(0);
    expect(result.value.currentRole).toBe('legal');
    expect(result.value.isComplete).toBe(false);
    expect(result.value.aggregate).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// 4. request changes → resubmit → approve
// ---------------------------------------------------------------------------

describe('request changes → resubmit → approve', () => {
  let policyStore: ApprovalPolicyStore;
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let tokenStore: ReturnType<typeof createInMemoryTokenStore>;
  let decisionStore: ReturnType<typeof createInMemoryDecisionStore>;
  let requestService: ReturnType<typeof createMultiApproverRequestService>;
  let decisionService: ReturnType<typeof createMultiDecisionService>;
  let resubmitService: ReturnType<typeof createResubmitService>;
  let policy: ApprovalPolicyRecord;

  beforeEach(async () => {
    policyStore = createInMemoryPolicyStore();
    requestStore = createInMemoryRequestStore();
    tokenStore = createInMemoryTokenStore();
    decisionStore = createInMemoryDecisionStore(requestStore);

    policy = await policyStore.create({
      name: 'single-approver-changes',
      type: 'quorum',
      threshold: 1,
      approverRoles: ['reviewer'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    requestService = createMultiApproverRequestService({
      requestStore,
      tokenStore,
      policyStore,
      generateToken: mockGenerateToken,
      config: { baseUrl: 'https://test.aptivo.dev' },
    });

    decisionService = createMultiDecisionService({
      store: decisionStore,
      tokenStore,
      policyStore,
      verifyToken: mockVerifyToken,
    });

    resubmitService = createResubmitService({
      store: requestStore as unknown as ResubmitStoreDeps,
      policyStore,
      generateToken: mockGenerateToken,
    });
  });

  it('request_changes → resubmit → new token → approve → finalized', async () => {
    // create request with 1 approver
    const createResult = await requestService.createMultiApproverRequest({
      workflowId: WORKFLOW_ID,
      domain: 'hr',
      actionType: 'contract-review',
      summary: 'Review contract draft',
      approverIds: [APPROVER_1],
      policyId: policy.id,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId } = createResult.value;

    // simulate request_changes by setting status directly
    // (the decision schema only accepts 'approved'|'rejected', so
    //  request_changes is handled at the workflow layer — here we simulate
    //  the state transition the workflow would perform)
    const req = requestStore.requests.find((r) => r.id === requestId)!;
    req.status = 'changes_requested';

    // resubmit → should succeed, incrementing retryCount
    const resubmitResult = await resubmitService.resubmitRequest(requestId);
    expect(resubmitResult.ok).toBe(true);
    if (!resubmitResult.ok) return;
    expect(resubmitResult.value.retryCount).toBe(1);
    expect(resubmitResult.value.newToken).toBeDefined();

    // verify request is pending again
    const updatedReq = await requestStore.getRequest(requestId);
    expect(updatedReq?.status).toBe('pending');
    expect(updatedReq?.retryCount).toBe(1);

    // now insert a fresh token for the approver so decision service can verify
    await tokenStore.insertTokens([
      {
        requestId,
        approverId: APPROVER_1,
        tokenHash: resubmitResult.value.newTokenHash,
        tokenExpiresAt: resubmitResult.value.newTokenExpiresAt,
      },
    ]);

    // clear previous decisions so the approver can decide again
    decisionStore.decisions.length = 0;

    // approve with new token
    const approveResult = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token: resubmitResult.value.newToken,
      decision: 'approved',
      channel: 'web',
    });

    expect(approveResult.ok).toBe(true);
    if (!approveResult.ok) return;
    expect(approveResult.value.aggregate).toBe('approved');
    expect(approveResult.value.isFinalized).toBe(true);

    // final request status
    const finalReq = await requestStore.getRequest(requestId);
    expect(finalReq?.status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// 5. max retries exceeded
// ---------------------------------------------------------------------------

describe('max retries exceeded', () => {
  let policyStore: ApprovalPolicyStore;
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let resubmitService: ReturnType<typeof createResubmitService>;
  let policy: ApprovalPolicyRecord;

  beforeEach(async () => {
    policyStore = createInMemoryPolicyStore();
    requestStore = createInMemoryRequestStore();

    // policy with maxRetries=2
    policy = await policyStore.create({
      name: 'strict-policy',
      type: 'quorum',
      threshold: 1,
      approverRoles: ['reviewer'],
      maxRetries: 2,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });

    resubmitService = createResubmitService({
      store: requestStore as unknown as ResubmitStoreDeps,
      policyStore,
      generateToken: mockGenerateToken,
    });
  });

  it('resubmit succeeds twice then fails with MaxRetriesExceeded on third', async () => {
    // seed a request manually
    const requestId = crypto.randomUUID();
    requestStore.requests.push({
      id: requestId,
      workflowId: WORKFLOW_ID,
      domain: 'test',
      actionType: 'test',
      summary: 'test',
      approverId: APPROVER_1,
      status: 'changes_requested',
      tokenHash: 'old-hash',
      tokenExpiresAt: new Date(Date.now() + 900_000),
      policyId: policy.id,
      retryCount: 0,
    });

    // resubmit #1 → success (retryCount=1)
    const r1 = await resubmitService.resubmitRequest(requestId);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.retryCount).toBe(1);

    // simulate another request_changes
    const req = requestStore.requests.find((r) => r.id === requestId)!;
    req.status = 'changes_requested';

    // resubmit #2 → success (retryCount=2)
    const r2 = await resubmitService.resubmitRequest(requestId);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.retryCount).toBe(2);

    // simulate another request_changes
    req.status = 'changes_requested';

    // resubmit #3 → MaxRetriesExceeded (retryCount=2, maxRetries=2)
    const r3 = await resubmitService.resubmitRequest(requestId);
    expect(r3.ok).toBe(false);
    if (r3.ok) return;
    expect(r3.error._tag).toBe('MaxRetriesExceeded');
    if (r3.error._tag === 'MaxRetriesExceeded') {
      expect(r3.error.maxRetries).toBe(2);
      expect(r3.error.currentRetries).toBe(2);
      expect(r3.error.requestId).toBe(requestId);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. race condition (simultaneous finalization)
// ---------------------------------------------------------------------------

describe('race condition (simultaneous finalization)', () => {
  let policyStore: ApprovalPolicyStore;
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let tokenStore: ReturnType<typeof createInMemoryTokenStore>;
  let decisionStore: ReturnType<typeof createInMemoryDecisionStore>;
  let policy: ApprovalPolicyRecord;
  let emittedEvents: { name: string; data: Record<string, unknown> }[];

  beforeEach(async () => {
    policyStore = createInMemoryPolicyStore();
    requestStore = createInMemoryRequestStore();
    tokenStore = createInMemoryTokenStore();
    decisionStore = createInMemoryDecisionStore(requestStore);
    emittedEvents = [];

    // 2-of-3 quorum
    policy = await policyStore.create({
      name: 'race-quorum',
      type: 'quorum',
      threshold: 2,
      approverRoles: ['a', 'b', 'c'],
      maxRetries: 3,
      timeoutSeconds: 86400,
      escalationPolicy: null,
    });
  });

  it('concurrent finalizations — only one succeeds at updating status', async () => {
    const requestService = createMultiApproverRequestService({
      requestStore,
      tokenStore,
      policyStore,
      generateToken: mockGenerateToken,
      config: { baseUrl: 'https://test.aptivo.dev' },
    });

    // create request
    const createResult = await requestService.createMultiApproverRequest({
      workflowId: WORKFLOW_ID,
      domain: 'test',
      actionType: 'race-test',
      summary: 'Race condition test',
      approverIds: [APPROVER_1, APPROVER_2, APPROVER_3],
      policyId: policy.id,
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId, approvers } = createResult.value;

    // record first approval (non-finalizing, 1 of 2 needed)
    const svc1 = createMultiDecisionService({
      store: decisionStore,
      tokenStore,
      policyStore,
      verifyToken: mockVerifyToken,
      emitEvent: async (event) => {
        emittedEvents.push(event);
      },
    });

    await svc1.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token: approvers[0]!.token,
      decision: 'approved',
      channel: 'web',
    });

    // now approver 2 and approver 3 both submit approval concurrently.
    // both will see 2+ approvals and try to finalize.
    // the in-memory store's optimistic lock ensures only first one wins.
    const [result2, result3] = await Promise.all([
      svc1.recordMultiApproverDecision({
        requestId,
        approverId: APPROVER_2,
        token: approvers[1]!.token,
        decision: 'approved',
        channel: 'web',
      }),
      svc1.recordMultiApproverDecision({
        requestId,
        approverId: APPROVER_3,
        token: approvers[2]!.token,
        decision: 'approved',
        channel: 'web',
      }),
    ]);

    expect(result2.ok).toBe(true);
    expect(result3.ok).toBe(true);
    if (!result2.ok || !result3.ok) return;

    // both should report finalized (one via optimistic lock, one via re-read)
    expect(result2.value.isFinalized).toBe(true);
    expect(result3.value.isFinalized).toBe(true);

    // both should show aggregate=approved
    expect(result2.value.aggregate).toBe('approved');
    expect(result3.value.aggregate).toBe('approved');

    // only one event should be emitted (the first-finalizer-wins)
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.name).toBe('hitl/decision.recorded');

    // request status is approved
    const request = await requestStore.getRequest(requestId);
    expect(request?.status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// 7. backward compatibility (legacy single-approver)
// ---------------------------------------------------------------------------

describe('backward compatibility (legacy single-approver)', () => {
  let requestStore: ReturnType<typeof createInMemoryRequestStore>;
  let tokenStore: ReturnType<typeof createInMemoryTokenStore>;
  let decisionStore: ReturnType<typeof createInMemoryDecisionStore>;
  let decisionService: ReturnType<typeof createMultiDecisionService>;
  let emittedEvents: { name: string; data: Record<string, unknown> }[];

  beforeEach(() => {
    requestStore = createInMemoryRequestStore();
    tokenStore = createInMemoryTokenStore();
    decisionStore = createInMemoryDecisionStore(requestStore);
    emittedEvents = [];

    // no policy store needed for legacy path, but interface requires one
    const emptyPolicyStore: ApprovalPolicyStore = {
      async create() {
        throw new Error('not used');
      },
      async findById() {
        return null;
      },
      async findByName() {
        return null;
      },
      async list() {
        return [];
      },
    };

    decisionService = createMultiDecisionService({
      store: decisionStore,
      tokenStore,
      policyStore: emptyPolicyStore,
      verifyToken: mockVerifyToken,
      emitEvent: async (event) => {
        emittedEvents.push(event);
      },
    });
  });

  it('legacy request without policyId auto-finalizes on first decision', async () => {
    const requestId = crypto.randomUUID();

    // seed request without policyId (legacy)
    requestStore.requests.push({
      id: requestId,
      workflowId: WORKFLOW_ID,
      domain: 'demo',
      actionType: 'legacy-action',
      summary: 'Legacy request',
      approverId: APPROVER_1,
      status: 'pending',
      tokenHash: 'legacy-hash',
      tokenExpiresAt: new Date(Date.now() + 900_000),
      policyId: null,
      retryCount: 0,
    });

    // seed token
    const token = `jwt-legacy-${Date.now()}`;
    const tokenHash = `hash-${token}`;
    await tokenStore.insertTokens([
      {
        requestId,
        approverId: APPROVER_1,
        tokenHash,
        tokenExpiresAt: new Date(Date.now() + 900_000),
      },
    ]);

    // record decision
    const result = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token,
      decision: 'approved',
      channel: 'api',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate).toBe('approved');
    expect(result.value.isFinalized).toBe(true);

    // event emitted
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.data.decision).toBe('approved');

    // request status updated
    const request = await requestStore.getRequest(requestId);
    expect(request?.status).toBe('approved');
  });

  it('legacy rejection auto-finalizes with rejected status', async () => {
    const requestId = crypto.randomUUID();

    requestStore.requests.push({
      id: requestId,
      workflowId: WORKFLOW_ID,
      domain: 'demo',
      actionType: 'legacy-rejection',
      summary: 'Legacy reject',
      approverId: APPROVER_1,
      status: 'pending',
      tokenHash: 'legacy-hash',
      tokenExpiresAt: new Date(Date.now() + 900_000),
      policyId: null,
      retryCount: 0,
    });

    const token = `jwt-legacy-rej-${Date.now()}`;
    const tokenHash = `hash-${token}`;
    await tokenStore.insertTokens([
      {
        requestId,
        approverId: APPROVER_1,
        tokenHash,
        tokenExpiresAt: new Date(Date.now() + 900_000),
      },
    ]);

    const result = await decisionService.recordMultiApproverDecision({
      requestId,
      approverId: APPROVER_1,
      token,
      decision: 'rejected',
      channel: 'api',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aggregate).toBe('rejected');
    expect(result.value.isFinalized).toBe(true);

    const request = await requestStore.getRequest(requestId);
    expect(request?.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// 8. parent/child orchestration lifecycle
// ---------------------------------------------------------------------------

describe('parent/child orchestration lifecycle', () => {
  let sentEvents: { name: string; data: Record<string, unknown> }[];
  let orchestrator: ReturnType<typeof createWorkflowOrchestrator>;

  beforeEach(() => {
    sentEvents = [];
    const eventSender: EventSender = {
      async send(event) {
        sentEvents.push(event);
      },
    };
    orchestrator = createWorkflowOrchestrator({ eventSender });
  });

  it('spawns 2 children, both complete, parent gets results', async () => {
    const parentId = 'parent-wf-001';
    const childA = 'child-a';
    const childB = 'child-b';

    // spawn children
    const spawnA = await orchestrator.spawnChild(
      parentId,
      childA,
      'workflow/child-a.trigger',
      { payload: 'data-a' },
    );
    expect(spawnA.ok).toBe(true);

    const spawnB = await orchestrator.spawnChild(
      parentId,
      childB,
      'workflow/child-b.trigger',
      { payload: 'data-b' },
    );
    expect(spawnB.ok).toBe(true);

    // verify spawn events were sent with correct correlation IDs
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents[0]!.name).toBe('workflow/child-a.trigger');
    expect(sentEvents[0]!.data.parentWorkflowId).toBe(parentId);
    expect(sentEvents[0]!.data.childWorkflowId).toBe(childA);
    expect(sentEvents[0]!.data.payload).toBe('data-a');

    expect(sentEvents[1]!.name).toBe('workflow/child-b.trigger');
    expect(sentEvents[1]!.data.parentWorkflowId).toBe(parentId);
    expect(sentEvents[1]!.data.childWorkflowId).toBe(childB);

    // simulate children completing
    const completeA = await orchestrator.completeChild(parentId, childA, {
      score: 95,
    });
    expect(completeA.ok).toBe(true);

    const completeB = await orchestrator.completeChild(parentId, childB, {
      score: 88,
    });
    expect(completeB.ok).toBe(true);

    // verify completion events
    const completionEvents = sentEvents.filter(
      (e) => e.name === 'workflow/child.completed',
    );
    expect(completionEvents).toHaveLength(2);
    expect(completionEvents[0]!.data.parentWorkflowId).toBe(parentId);
    expect(completionEvents[0]!.data.childWorkflowId).toBe(childA);
    expect(completionEvents[0]!.data.result).toEqual({ score: 95 });
    expect(completionEvents[1]!.data.childWorkflowId).toBe(childB);
    expect(completionEvents[1]!.data.result).toEqual({ score: 88 });
  });

  it('waitForChildren collects results from both children', async () => {
    const parentId = 'parent-wf-002';
    const childA = 'child-a';
    const childB = 'child-b';

    // mock step that resolves waitForEvent with child completion data
    const mockStep: WorkflowStep = {
      async waitForEvent<T>(
        _id: string,
        opts: { event: string; timeout: string; if?: string },
      ): Promise<T | null> {
        // simulate child completion based on the filter expression
        if (opts.if?.includes(childA)) {
          return {
            data: { childWorkflowId: childA, result: { status: 'done-a' } },
          } as T;
        }
        if (opts.if?.includes(childB)) {
          return {
            data: { childWorkflowId: childB, result: { status: 'done-b' } },
          } as T;
        }
        return null;
      },
      async run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
        return fn();
      },
    };

    const result = await orchestrator.waitForChildren(
      mockStep,
      { parentWorkflowId: parentId, childTimeout: '30m' },
      [childA, childB],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.parentWorkflowId).toBe(parentId);
    expect(result.value.allCompleted).toBe(true);
    expect(result.value.completedCount).toBe(2);
    expect(result.value.timedOutCount).toBe(0);
    expect(result.value.children).toHaveLength(2);
    expect(result.value.children[0]!.childWorkflowId).toBe(childA);
    expect(result.value.children[0]!.status).toBe('completed');
    expect(result.value.children[0]!.result).toEqual({ status: 'done-a' });
    expect(result.value.children[1]!.childWorkflowId).toBe(childB);
    expect(result.value.children[1]!.status).toBe('completed');
  });

  it('waitForChildren reports timed-out children when event is null', async () => {
    const parentId = 'parent-wf-003';
    const childA = 'child-a';
    const childB = 'child-timeout';

    // mock step where child-b times out (returns null)
    const mockStep: WorkflowStep = {
      async waitForEvent<T>(
        _id: string,
        opts: { event: string; timeout: string; if?: string },
      ): Promise<T | null> {
        if (opts.if?.includes(childA)) {
          return {
            data: {
              childWorkflowId: childA,
              result: { status: 'completed' },
            },
          } as T;
        }
        // child-b times out
        return null;
      },
      async run<T>(_id: string, fn: () => Promise<T>): Promise<T> {
        return fn();
      },
    };

    const result = await orchestrator.waitForChildren(
      mockStep,
      { parentWorkflowId: parentId, childTimeout: '5m' },
      [childA, childB],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.allCompleted).toBe(false);
    expect(result.value.completedCount).toBe(1);
    expect(result.value.timedOutCount).toBe(1);
    expect(result.value.children[1]!.status).toBe('timed_out');
    expect(result.value.children[1]!.result).toBeUndefined();
  });

  it('correlation IDs match between spawn and completion', async () => {
    const parentId = 'parent-correlation-test';
    const childId = 'child-corr-1';

    await orchestrator.spawnChild(parentId, childId, 'wf/spawn', {
      input: 42,
    });
    await orchestrator.completeChild(parentId, childId, { output: 84 });

    // spawn event
    const spawnEvent = sentEvents.find((e) => e.name === 'wf/spawn');
    expect(spawnEvent).toBeDefined();
    expect(spawnEvent!.data.parentWorkflowId).toBe(parentId);
    expect(spawnEvent!.data.childWorkflowId).toBe(childId);

    // completion event
    const completeEvent = sentEvents.find(
      (e) => e.name === 'workflow/child.completed',
    );
    expect(completeEvent).toBeDefined();
    expect(completeEvent!.data.parentWorkflowId).toBe(parentId);
    expect(completeEvent!.data.childWorkflowId).toBe(childId);

    // correlation IDs match between spawn and completion
    expect(spawnEvent!.data.parentWorkflowId).toBe(
      completeEvent!.data.parentWorkflowId,
    );
    expect(spawnEvent!.data.childWorkflowId).toBe(
      completeEvent!.data.childWorkflowId,
    );
  });
});
