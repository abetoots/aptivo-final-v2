/**
 * @testcase HITL-06-DEC-001 through HITL-06-DEC-014
 * @task HITL-06
 * @frd FR-CORE-HITL-003
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordDecision } from '../../src/decision/decision-service.js';
import type {
  DecisionStore,
  DecisionEventEmitter,
  DecisionServiceDeps,
} from '../../src/decision/decision-service.js';
import type {
  RequestSnapshot,
  ExistingDecision,
} from '../../src/decision/decision-types.js';
import { generateHitlToken, clearJtiStore } from '../../src/tokens/jwt-manager.js';
import { InMemoryReplayStore } from '../../src/replay/in-memory-replay-store.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const SIGNING_SECRET = 'a-sufficiently-long-signing-secret-32ch!';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';
const APPROVER_ID = '660e8400-e29b-41d4-a716-446655440001';

function pendingRequest(overrides?: Partial<RequestSnapshot>): RequestSnapshot {
  return {
    id: REQUEST_ID,
    approverId: APPROVER_ID,
    status: 'pending',
    tokenHash: 'placeholder-hash',
    tokenExpiresAt: new Date(Date.now() + 15 * 60_000), // 15 min from now
    ...overrides,
  };
}

function createMockStore(request?: RequestSnapshot | null): DecisionStore {
  return {
    getRequest: vi.fn(async () => request ?? pendingRequest()),
    getDecisionByRequestId: vi.fn(async () => null),
    insertDecisionAndUpdateRequest: vi.fn(async (decision) => ({ id: decision.id })),
  };
}

function createMockEmitter(): DecisionEventEmitter {
  return {
    emit: vi.fn(async () => {}),
  };
}

async function mintToken(requestId = REQUEST_ID, action = 'approve'): Promise<string> {
  const result = await generateHitlToken(
    {
      requestId,
      action,
      channel: 'web',
      audience: 'hitl-approval',
      issuer: 'aptivo-hitl-gateway',
      ttlSeconds: 900,
    },
    SIGNING_SECRET,
  );
  if (!result.ok) throw new Error('Failed to mint test token');
  return result.value.token;
}

function createDeps(overrides?: Partial<DecisionServiceDeps>): DecisionServiceDeps {
  return {
    store: createMockStore(),
    config: {
      signingSecrets: SIGNING_SECRET,
      audience: 'hitl-approval',
      issuer: 'aptivo-hitl-gateway',
    },
    replayStore: new InMemoryReplayStore(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-06: Decision Service', () => {
  beforeEach(() => {
    clearJtiStore();
  });

  // ---------------------------------------------------------------------------
  // happy path
  // ---------------------------------------------------------------------------

  describe('recordDecision — happy path', () => {
    it('records an approval decision', async () => {
      const token = await mintToken();
      const deps = createDeps();

      const result = await recordDecision(
        {
          requestId: REQUEST_ID,
          token,
          decision: 'approved',
          channel: 'web',
        },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.requestId).toBe(REQUEST_ID);
      expect(result.value.decision).toBe('approved');
      expect(result.value.decidedAt).toBeInstanceOf(Date);
      expect(result.value.decisionId).toBeTruthy();
    });

    it('records a rejection decision', async () => {
      const token = await mintToken(REQUEST_ID, 'reject');
      const deps = createDeps();

      const result = await recordDecision(
        {
          requestId: REQUEST_ID,
          token,
          decision: 'rejected',
          comment: 'Risk too high',
          channel: 'email',
        },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.decision).toBe('rejected');
    });

    it('calls store with correct decision record', async () => {
      const token = await mintToken();
      const store = createMockStore();
      const deps = createDeps({ store });

      await recordDecision(
        {
          requestId: REQUEST_ID,
          token,
          decision: 'approved',
          comment: 'Looks good',
          channel: 'web',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        deps,
      );

      expect(store.insertDecisionAndUpdateRequest).toHaveBeenCalledOnce();
      const [record, newStatus] = vi.mocked(store.insertDecisionAndUpdateRequest).mock.calls[0]!;
      expect(record.requestId).toBe(REQUEST_ID);
      expect(record.approverId).toBe(APPROVER_ID);
      expect(record.decision).toBe('approved');
      expect(record.comment).toBe('Looks good');
      expect(record.channel).toBe('web');
      expect(record.ipAddress).toBe('192.168.1.1');
      expect(record.userAgent).toBe('Mozilla/5.0');
      expect(newStatus).toBe('approved');
    });
  });

  // ---------------------------------------------------------------------------
  // event emission
  // ---------------------------------------------------------------------------

  describe('event emission', () => {
    it('emits hitl/decision.recorded event on success', async () => {
      const token = await mintToken();
      const emitter = createMockEmitter();
      const deps = createDeps({ eventEmitter: emitter });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(true);
      expect(emitter.emit).toHaveBeenCalledOnce();
      const event = vi.mocked(emitter.emit).mock.calls[0]![0];
      expect(event.name).toBe('hitl/decision.recorded');
      expect(event.data.requestId).toBe(REQUEST_ID);
      expect(event.data.decision).toBe('approved');
    });

    it('does not fail if event emission throws', async () => {
      const token = await mintToken();
      const emitter: DecisionEventEmitter = {
        emit: vi.fn(async () => { throw new Error('Inngest down'); }),
      };
      const deps = createDeps({ eventEmitter: emitter });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      // fire-and-forget — result is still ok
      expect(result.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // validation
  // ---------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects missing required fields', async () => {
      const deps = createDeps();
      const result = await recordDecision({}, deps);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ValidationError');
    });

    it('rejects invalid decision value', async () => {
      const token = await mintToken();
      const deps = createDeps();
      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'maybe', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ValidationError');
    });
  });

  // ---------------------------------------------------------------------------
  // token verification
  // ---------------------------------------------------------------------------

  describe('token verification', () => {
    it('rejects invalid token', async () => {
      const deps = createDeps();
      const result = await recordDecision(
        { requestId: REQUEST_ID, token: 'invalid.jwt.token', decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('TokenVerificationError');
    });

    it('rejects token issued for a different request', async () => {
      const token = await mintToken('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      const deps = createDeps();

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('TokenVerificationError');
      if (result.error._tag === 'TokenVerificationError') {
        expect(result.error.reason).toBe('invalid-binding');
      }
    });

    it('rejects approve token used for rejection', async () => {
      const token = await mintToken(REQUEST_ID, 'approve');
      const deps = createDeps();

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'rejected', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('TokenVerificationError');
      if (result.error._tag === 'TokenVerificationError') {
        expect(result.error.reason).toBe('invalid-action');
      }
    });

    it('rejects reject token used for approval', async () => {
      const token = await mintToken(REQUEST_ID, 'reject');
      const deps = createDeps();

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('TokenVerificationError');
      if (result.error._tag === 'TokenVerificationError') {
        expect(result.error.reason).toBe('invalid-action');
      }
    });

    it('allows approval with decide token (production path)', async () => {
      const token = await mintToken(REQUEST_ID, 'decide');
      const deps = createDeps();

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.decision).toBe('approved');
    });

    it('allows rejection with decide token (production path)', async () => {
      const token = await mintToken(REQUEST_ID, 'decide');
      const deps = createDeps();

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'rejected', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.decision).toBe('rejected');
    });

    it('rejects replayed token (same JTI)', async () => {
      const token = await mintToken();
      const replayStore = new InMemoryReplayStore();
      const deps = createDeps({ replayStore });

      // first call succeeds
      const r1 = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );
      expect(r1.ok).toBe(true);

      // replay same token — uses same replayStore, different store mock
      const store2 = createMockStore();
      const deps2 = createDeps({ store: store2, replayStore });
      const r2 = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps2,
      );
      expect(r2.ok).toBe(false);
      if (r2.ok) return;
      expect(r2.error._tag).toBe('TokenVerificationError');
    });
  });

  // ---------------------------------------------------------------------------
  // request state checks
  // ---------------------------------------------------------------------------

  describe('request state', () => {
    it('rejects when request not found', async () => {
      const token = await mintToken();
      const store = createMockStore(null);
      vi.mocked(store.getRequest).mockResolvedValue(null);
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('RequestNotFoundError');
    });

    it('rejects expired request (410 Gone)', async () => {
      const token = await mintToken();
      const expired = pendingRequest({
        tokenExpiresAt: new Date(Date.now() - 60_000), // 1 min ago
      });
      const store = createMockStore(expired);
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('RequestExpiredError');
    });

    it('rejects already resolved request', async () => {
      const token = await mintToken();
      const resolved = pendingRequest({ status: 'approved' });
      const store = createMockStore(resolved);
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('RequestAlreadyResolvedError');
    });

    it('returns existing decision for idempotent re-submission', async () => {
      const token = await mintToken();
      const resolved = pendingRequest({ status: 'approved' });
      const existingDecision: ExistingDecision = {
        id: 'dec-001',
        approverId: APPROVER_ID,
        decision: 'approved',
        decidedAt: new Date(),
      };
      const store = createMockStore(resolved);
      vi.mocked(store.getDecisionByRequestId).mockResolvedValue(existingDecision);
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.decisionId).toBe('dec-001');
      expect(result.value.decision).toBe('approved');
    });
  });

  // ---------------------------------------------------------------------------
  // first-writer-wins / conflict
  // ---------------------------------------------------------------------------

  describe('first-writer-wins', () => {
    it('returns ConflictError on unique constraint violation', async () => {
      const token = await mintToken();
      const store = createMockStore();
      vi.mocked(store.insertDecisionAndUpdateRequest).mockRejectedValue(
        new Error('unique constraint violated on hitl_decisions_request_id_idx'),
      );
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ConflictError');
    });
  });

  // ---------------------------------------------------------------------------
  // persistence errors
  // ---------------------------------------------------------------------------

  describe('persistence errors', () => {
    it('returns PersistenceError on store failure', async () => {
      const token = await mintToken();
      const store = createMockStore();
      vi.mocked(store.insertDecisionAndUpdateRequest).mockRejectedValue(
        new Error('connection lost'),
      );
      const deps = createDeps({ store });

      const result = await recordDecision(
        { requestId: REQUEST_ID, token, decision: 'approved', channel: 'web' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('PersistenceError');
    });
  });
});
