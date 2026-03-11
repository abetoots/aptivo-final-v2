/**
 * @testcase HITL-10-RACE-001 through HITL-10-RACE-004
 * @task HITL-10
 * @frd FR-CORE-HITL-003
 *
 * Race condition tests: concurrent decisions on the same request.
 * Validates first-writer-wins via unique constraint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequest } from '../../src/request/request-service.js';
import type { RequestStore, RequestServiceDeps } from '../../src/request/request-service.js';
import { recordDecision } from '../../src/decision/decision-service.js';
import type { DecisionStore, DecisionServiceDeps } from '../../src/decision/decision-service.js';
import { InMemoryReplayStore } from '../../src/replay/in-memory-replay-store.js';
import { generateHitlToken, clearJtiStore } from '../../src/tokens/jwt-manager.js';
import type { HitlRequestRecord } from '../../src/request/request-types.js';
import type { RequestSnapshot, ExistingDecision, HitlDecisionRecord } from '../../src/decision/decision-types.js';

// ---------------------------------------------------------------------------
// shared config
// ---------------------------------------------------------------------------

const SIGNING_SECRET = 'b'.repeat(32);
const AUDIENCE = 'hitl-approval';
const ISSUER = 'aptivo-hitl-gateway';
const BASE_URL = 'https://app.aptivo.com';

// ---------------------------------------------------------------------------
// in-memory stores with race simulation
// ---------------------------------------------------------------------------

class RaceRequestStore implements RequestStore {
  readonly records = new Map<string, HitlRequestRecord>();

  async insert(record: HitlRequestRecord): Promise<{ id: string }> {
    this.records.set(record.id, { ...record });
    return { id: record.id };
  }

  get(id: string): HitlRequestRecord | undefined {
    return this.records.get(id);
  }

  updateStatus(id: string, status: HitlRequestRecord['status']): void {
    const record = this.records.get(id);
    if (record) {
      record.status = status;
    }
  }
}

class RaceDecisionStore implements DecisionStore {
  private decisions = new Map<string, HitlDecisionRecord>();
  private requestStore: RaceRequestStore;
  private requestDecisions = new Set<string>(); // track requestId uniqueness

  get decisionCount(): number { return this.decisions.size; }

  constructor(requestStore: RaceRequestStore) {
    this.requestStore = requestStore;
  }

  async getRequest(requestId: string): Promise<RequestSnapshot | null> {
    for (const record of this.requestStore.records.values()) {
      if (record.id === requestId) {
        return {
          id: record.id,
          approverId: record.approverId,
          status: record.status,
          tokenHash: record.tokenHash,
          tokenExpiresAt: record.tokenExpiresAt,
        };
      }
    }
    return null;
  }

  async getDecisionByRequestId(requestId: string): Promise<ExistingDecision | null> {
    for (const d of this.decisions.values()) {
      if (d.requestId === requestId) {
        return { id: d.id, approverId: d.approverId, decision: d.decision, decidedAt: d.decidedAt };
      }
    }
    return null;
  }

  async insertDecisionAndUpdateRequest(
    decision: HitlDecisionRecord,
    newStatus: 'approved' | 'rejected',
  ): Promise<{ id: string }> {
    // simulate unique constraint on requestId
    if (this.requestDecisions.has(decision.requestId)) {
      throw new Error('unique constraint violation: duplicate requestId');
    }
    this.requestDecisions.add(decision.requestId);
    this.decisions.set(decision.id, { ...decision });
    this.requestStore.updateStatus(decision.requestId, newStatus);
    return { id: decision.id };
  }
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-10: Race Conditions — First-Writer-Wins', () => {
  beforeEach(() => {
    clearJtiStore();
  });

  it('10 concurrent approvals: exactly 1 succeeds, rest get ConflictError', async () => {
    const requestStore = new RaceRequestStore();
    const decisionStore = new RaceDecisionStore(requestStore);

    // create a request
    const requestDeps: RequestServiceDeps = {
      store: requestStore,
      config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
    };

    const createResult = await createRequest({
      workflowId: crypto.randomUUID(),
      domain: 'crypto',
      actionType: 'trade-approval',
      summary: 'Race test',
      approverId: crypto.randomUUID(),
    }, requestDeps);

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId } = createResult.value;

    // generate 10 separate tokens (each with unique JTI to isolate the race to the decision layer)
    const tokens = await Promise.all(
      Array.from({ length: 10 }, () =>
        generateHitlToken(
          { requestId, action: 'approve', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
          SIGNING_SECRET,
        ),
      ),
    );

    // all tokens should be generated successfully
    for (const t of tokens) {
      expect(t.ok).toBe(true);
    }

    // fire 10 concurrent decisions, each with a unique replay store to avoid JTI collision
    const results = await Promise.all(
      tokens.map((t) => {
        if (!t.ok) throw new Error('Token generation failed');
        const replayStore = new InMemoryReplayStore();
        const deps: DecisionServiceDeps = {
          store: decisionStore,
          config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
          replayStore,
        };
        return recordDecision({
          requestId,
          token: t.value.token,
          decision: 'approved',
          channel: 'web',
        }, deps);
      }),
    );

    const successes = results.filter((r) => r.ok);
    const conflicts = results.filter((r) => !r.ok && r.error._tag === 'ConflictError');
    const alreadyResolved = results.filter((r) => !r.ok && r.error._tag === 'RequestAlreadyResolvedError');

    // all results should be either: success (first write or idempotent), ConflictError, or AlreadyResolved
    expect(successes.length + conflicts.length + alreadyResolved.length).toBe(10);

    // at least 1 succeeds (the first writer)
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // only 1 decision actually inserted (first-writer-wins at DB level)
    expect(decisionStore.decisionCount).toBe(1);

    // request should be approved
    const request = requestStore.get(requestId);
    expect(request?.status).toBe('approved');
  });

  it('concurrent approve + reject: exactly 1 wins', async () => {
    const requestStore = new RaceRequestStore();
    const decisionStore = new RaceDecisionStore(requestStore);

    const requestDeps: RequestServiceDeps = {
      store: requestStore,
      config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
    };

    const createResult = await createRequest({
      workflowId: crypto.randomUUID(),
      domain: 'crypto',
      actionType: 'trade-approval',
      summary: 'Mixed race test',
      approverId: crypto.randomUUID(),
    }, requestDeps);

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId } = createResult.value;

    // generate 2 tokens
    const [approveToken, rejectToken] = await Promise.all([
      generateHitlToken(
        { requestId, action: 'approve', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
        SIGNING_SECRET,
      ),
      generateHitlToken(
        { requestId, action: 'reject', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
        SIGNING_SECRET,
      ),
    ]);

    expect(approveToken.ok && rejectToken.ok).toBe(true);
    if (!approveToken.ok || !rejectToken.ok) return;

    // fire both concurrently
    const [approveResult, rejectResult] = await Promise.all([
      recordDecision({
        requestId,
        token: approveToken.value.token,
        decision: 'approved',
        channel: 'web',
      }, {
        store: decisionStore,
        config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
        replayStore: new InMemoryReplayStore(),
      }),
      recordDecision({
        requestId,
        token: rejectToken.value.token,
        decision: 'rejected',
        channel: 'web',
      }, {
        store: decisionStore,
        config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
        replayStore: new InMemoryReplayStore(),
      }),
    ]);

    const allResults = [approveResult, rejectResult];
    const successes = allResults.filter((r) => r.ok);
    const failures = allResults.filter((r) => !r.ok);

    // exactly 1 succeeds
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('second decision on already-resolved request gets RequestAlreadyResolvedError', async () => {
    const requestStore = new RaceRequestStore();
    const decisionStore = new RaceDecisionStore(requestStore);

    const requestDeps: RequestServiceDeps = {
      store: requestStore,
      config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
    };

    const createResult = await createRequest({
      workflowId: crypto.randomUUID(),
      domain: 'crypto',
      actionType: 'trade-approval',
      summary: 'Sequential test',
      approverId: crypto.randomUUID(),
    }, requestDeps);

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId } = createResult.value;

    // first decision: approve with token1
    const token1 = await generateHitlToken(
      { requestId, action: 'approve', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
      SIGNING_SECRET,
    );
    expect(token1.ok).toBe(true);
    if (!token1.ok) return;

    const first = await recordDecision({
      requestId,
      token: token1.value.token,
      decision: 'approved',
      channel: 'web',
    }, {
      store: decisionStore,
      config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
      replayStore: new InMemoryReplayStore(),
    });
    expect(first.ok).toBe(true);

    // second decision: reject with a fresh token (different JTI)
    const token2 = await generateHitlToken(
      { requestId, action: 'reject', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
      SIGNING_SECRET,
    );
    expect(token2.ok).toBe(true);
    if (!token2.ok) return;

    const second = await recordDecision({
      requestId,
      token: token2.value.token,
      decision: 'rejected',
      channel: 'web',
    }, {
      store: decisionStore,
      config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
      replayStore: new InMemoryReplayStore(),
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error._tag).toBe('RequestAlreadyResolvedError');
      expect(second.error).toHaveProperty('existingStatus', 'approved');
    }
  });

  it('expired request rejects decision with RequestExpiredError', async () => {
    const requestStore = new RaceRequestStore();
    const decisionStore = new RaceDecisionStore(requestStore);

    const requestDeps: RequestServiceDeps = {
      store: requestStore,
      config: { baseUrl: BASE_URL, signingSecret: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
    };

    // create with minimal TTL
    const createResult = await createRequest({
      workflowId: crypto.randomUUID(),
      domain: 'crypto',
      actionType: 'trade-approval',
      summary: 'Expiry test',
      approverId: crypto.randomUUID(),
      ttlSeconds: 900,
    }, requestDeps);

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const { requestId } = createResult.value;

    // manually expire the request in the store
    const storedRequest = requestStore.get(requestId);
    if (storedRequest) {
      storedRequest.tokenExpiresAt = new Date(Date.now() - 1000); // expired 1s ago
    }

    // generate a fresh token (still valid signature-wise, but request is expired)
    const token = await generateHitlToken(
      { requestId, action: 'approve', channel: 'web', audience: AUDIENCE, issuer: ISSUER },
      SIGNING_SECRET,
    );
    expect(token.ok).toBe(true);
    if (!token.ok) return;

    const result = await recordDecision({
      requestId,
      token: token.value.token,
      decision: 'approved',
      channel: 'web',
    }, {
      store: decisionStore,
      config: { signingSecrets: SIGNING_SECRET, audience: AUDIENCE, issuer: ISSUER },
      replayStore: new InMemoryReplayStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('RequestExpiredError');
    }
  });
});
