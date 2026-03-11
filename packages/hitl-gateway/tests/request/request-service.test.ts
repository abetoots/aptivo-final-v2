/**
 * @testcase HITL-05-REQ-001 through HITL-05-REQ-009
 * @task HITL-05
 * @frd FR-CORE-HITL-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequest } from '../../src/request/request-service.js';
import type { RequestStore, RequestServiceDeps } from '../../src/request/request-service.js';
import type { HitlRequestRecord } from '../../src/request/request-types.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const SIGNING_SECRET = 'a-sufficiently-long-signing-secret-32ch!';

function createMockStore(): RequestStore {
  return {
    insert: vi.fn(async (record: HitlRequestRecord) => ({ id: record.id })),
  };
}

function createDeps(overrides?: Partial<RequestServiceDeps>): RequestServiceDeps {
  return {
    store: createMockStore(),
    config: {
      baseUrl: 'https://app.aptivo.com',
      signingSecret: SIGNING_SECRET,
      audience: 'hitl-approval',
      issuer: 'aptivo-hitl-gateway',
    },
    ...overrides,
  };
}

const validInput = {
  workflowId: '550e8400-e29b-41d4-a716-446655440000',
  domain: 'crypto',
  actionType: 'trade-approval',
  summary: 'Approve BTC purchase of $10,000',
  approverId: '660e8400-e29b-41d4-a716-446655440001',
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('HITL-05: Request Service', () => {
  describe('createRequest', () => {
    it('creates a request with valid input', async () => {
      const deps = createDeps();
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.requestId).toBeTruthy();
      expect(result.value.token).toBeTruthy();
      expect(result.value.tokenHash).toHaveLength(64);
      expect(result.value.tokenExpiresAt).toBeInstanceOf(Date);
      expect(result.value.approveUrl).toContain('/hitl/');
      expect(result.value.approveUrl).toContain('action=approve');
      expect(result.value.rejectUrl).toContain('action=reject');
    });

    it('persists the request via store', async () => {
      const store = createMockStore();
      const deps = createDeps({ store });
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(true);
      expect(store.insert).toHaveBeenCalledOnce();

      const insertedRecord = vi.mocked(store.insert).mock.calls[0]![0];
      expect(insertedRecord.workflowId).toBe(validInput.workflowId);
      expect(insertedRecord.domain).toBe('crypto');
      expect(insertedRecord.actionType).toBe('trade-approval');
      expect(insertedRecord.approverId).toBe(validInput.approverId);
      expect(insertedRecord.status).toBe('pending');
      expect(insertedRecord.tokenHash).toHaveLength(64);
    });

    it('generates action URLs with request ID and token', async () => {
      const deps = createDeps();
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { requestId, token, approveUrl, rejectUrl } = result.value;
      expect(approveUrl).toContain(`/hitl/${requestId}?action=approve&token=`);
      expect(rejectUrl).toContain(`/hitl/${requestId}?action=reject&token=`);
      // token must be URL-encoded and present
      expect(approveUrl).toContain(encodeURIComponent(token));
    });

    it('binds the minted token to the request ID', async () => {
      const deps = createDeps();
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // decode the JWT and verify requestId claim matches
      const [, payloadB64] = result.value.token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
      expect(payload.requestId).toBe(result.value.requestId);
      expect(payload.requestId).not.toBe('');
    });

    it('accepts optional fields', async () => {
      const store = createMockStore();
      const deps = createDeps({ store });
      const input = {
        ...validInput,
        workflowStepId: 'step-validate-trade',
        details: { amount: 10000, currency: 'BTC' },
        ttlSeconds: 1800,
      };

      const result = await createRequest(input, deps);
      expect(result.ok).toBe(true);

      const record = vi.mocked(store.insert).mock.calls[0]![0];
      expect(record.workflowStepId).toBe('step-validate-trade');
      expect(record.details).toEqual({ amount: 10000, currency: 'BTC' });
    });

    it('defaults token TTL to 15 minutes', async () => {
      const deps = createDeps();
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const diffMs = result.value.tokenExpiresAt.getTime() - Date.now();
      // ~15 minutes (900s) ± 2s tolerance
      expect(diffMs).toBeGreaterThan(898_000);
      expect(diffMs).toBeLessThanOrEqual(901_000);
    });
  });

  // ---------------------------------------------------------------------------
  // validation errors
  // ---------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects missing required fields', async () => {
      const deps = createDeps();
      const result = await createRequest({}, deps);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error._tag).toBe('ValidationError');
      if (result.error._tag !== 'ValidationError') return;
      expect(result.error.errors.length).toBeGreaterThan(0);
    });

    it('rejects invalid workflowId (not UUID)', async () => {
      const deps = createDeps();
      const result = await createRequest(
        { ...validInput, workflowId: 'not-a-uuid' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ValidationError');
    });

    it('rejects empty domain', async () => {
      const deps = createDeps();
      const result = await createRequest(
        { ...validInput, domain: '' },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ValidationError');
    });

    it('rejects TTL exceeding 1 hour', async () => {
      const deps = createDeps();
      const result = await createRequest(
        { ...validInput, ttlSeconds: 7200 },
        deps,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('ValidationError');
    });
  });

  // ---------------------------------------------------------------------------
  // error handling
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns DuplicateTokenError on unique constraint violation', async () => {
      const store = createMockStore();
      vi.mocked(store.insert).mockRejectedValue(new Error('unique constraint violated'));

      const deps = createDeps({ store });
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('DuplicateTokenError');
    });

    it('returns PersistenceError on store failure', async () => {
      const store = createMockStore();
      vi.mocked(store.insert).mockRejectedValue(new Error('connection refused'));

      const deps = createDeps({ store });
      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('PersistenceError');
    });

    it('returns TokenGenerationError with invalid signing secret', async () => {
      const deps = createDeps();
      deps.config.signingSecret = 'short';

      const result = await createRequest(validInput, deps);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error._tag).toBe('TokenGenerationError');
    });
  });
});
