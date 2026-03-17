/**
 * FEAT-04: Consent Withdrawal API tests
 * @task FEAT-04
 *
 * verifies consent service validation, audit emission, inngest event
 * integration, and api route handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createConsentService,
  WithdrawConsentInput,
} from '../src/lib/consent/consent-service';
import type {
  ConsentServiceDeps,
} from '../src/lib/consent/consent-service';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<ConsentServiceDeps>): ConsentServiceDeps {
  return {
    emitAudit: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const validInput = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  consentType: 'marketing' as const,
  reason: 'No longer interested',
};

// ---------------------------------------------------------------------------
// WithdrawConsentInput schema validation
// ---------------------------------------------------------------------------

describe('WithdrawConsentInput schema', () => {
  it('validates a valid input', () => {
    const result = WithdrawConsentInput.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('validates all consent types', () => {
    const types = ['marketing', 'analytics', 'data_processing', 'all'] as const;
    for (const consentType of types) {
      const result = WithdrawConsentInput.safeParse({ ...validInput, consentType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid consent type', () => {
    const result = WithdrawConsentInput.safeParse({ ...validInput, consentType: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid userId', () => {
    const result = WithdrawConsentInput.safeParse({ ...validInput, userId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing userId', () => {
    const { userId: _, ...noUserId } = validInput;
    const result = WithdrawConsentInput.safeParse(noUserId);
    expect(result.success).toBe(false);
  });

  it('accepts optional reason', () => {
    const { reason: _, ...noReason } = validInput;
    const result = WithdrawConsentInput.safeParse(noReason);
    expect(result.success).toBe(true);
  });

  it('rejects reason over 500 characters', () => {
    const result = WithdrawConsentInput.safeParse({
      ...validInput,
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// service: withdrawConsent — success
// ---------------------------------------------------------------------------

describe('createConsentService — withdrawConsent success', () => {
  let deps: ConsentServiceDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('returns success with auditRecorded true', async () => {
    const service = createConsentService(deps);
    const result = await service.withdrawConsent(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe(validInput.userId);
    expect(result.value.consentType).toBe('marketing');
    expect(result.value.auditRecorded).toBe(true);
    expect(result.value.withdrawnAt).toBeInstanceOf(Date);
  });

  it('emits audit event with correct action', async () => {
    const service = createConsentService(deps);
    await service.withdrawConsent(validInput);

    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    expect(deps.emitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'consent.withdrawn',
        actor: validInput.userId,
        resource: { type: 'consent', id: `${validInput.userId}:marketing` },
        metadata: { consentType: 'marketing', reason: 'No longer interested' },
      }),
    );
  });

  it('emits inngest event with consent data', async () => {
    const service = createConsentService(deps);
    await service.withdrawConsent(validInput);

    expect(deps.emitEvent).toHaveBeenCalledTimes(1);
    expect(deps.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'platform/consent.withdrawn',
        data: expect.objectContaining({
          userId: validInput.userId,
          consentType: 'marketing',
          reason: 'No longer interested',
        }),
      }),
    );
  });

  it('uses default reason when none provided', async () => {
    const service = createConsentService(deps);
    const { reason: _, ...noReason } = validInput;
    await service.withdrawConsent(noReason);

    expect(deps.emitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: 'no reason provided' }),
      }),
    );
  });

  it('succeeds for all consent types', async () => {
    const service = createConsentService(deps);
    const types = ['marketing', 'analytics', 'data_processing', 'all'] as const;

    for (const consentType of types) {
      const result = await service.withdrawConsent({ ...validInput, consentType });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.consentType).toBe(consentType);
    }
  });
});

// ---------------------------------------------------------------------------
// service: withdrawConsent — validation errors
// ---------------------------------------------------------------------------

describe('createConsentService — validation errors', () => {
  it('returns ValidationError for invalid consent type', async () => {
    const service = createConsentService(makeDeps());
    const result = await service.withdrawConsent({ ...validInput, consentType: 'invalid' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    expect(result.error.message).toBeDefined();
  });

  it('returns ValidationError for non-uuid userId', async () => {
    const service = createConsentService(makeDeps());
    const result = await service.withdrawConsent({ ...validInput, userId: 'bad-id' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for missing required fields', async () => {
    const service = createConsentService(makeDeps());
    const result = await service.withdrawConsent({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('does not call emitAudit on validation failure', async () => {
    const deps = makeDeps();
    const service = createConsentService(deps);
    await service.withdrawConsent({ userId: 'bad' });

    expect(deps.emitAudit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// service: inngest event failure is fire-and-forget
// ---------------------------------------------------------------------------

describe('createConsentService — inngest fire-and-forget', () => {
  it('succeeds even when emitEvent rejects', async () => {
    const deps = makeDeps({
      emitEvent: vi.fn().mockRejectedValue(new Error('inngest down')),
    });
    const service = createConsentService(deps);
    const result = await service.withdrawConsent(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auditRecorded).toBe(true);
  });

  it('succeeds when emitEvent is not provided', async () => {
    const deps = makeDeps({ emitEvent: undefined });
    const service = createConsentService(deps);
    const result = await service.withdrawConsent(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auditRecorded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// service: audit failure
// ---------------------------------------------------------------------------

describe('createConsentService — audit failure', () => {
  it('returns ConsentWithdrawalError when audit emit throws', async () => {
    const deps = makeDeps({
      emitAudit: vi.fn().mockRejectedValue(new Error('audit store down')),
    });
    const service = createConsentService(deps);
    const result = await service.withdrawConsent(validInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ConsentWithdrawalError');
    expect(result.error.cause).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// api route tests
// ---------------------------------------------------------------------------

// mock extractUser — returns null by default, override per-test via vi.mocked
vi.mock('../src/lib/security/rbac-resolver', () => ({
  extractUser: vi.fn().mockResolvedValue(null),
}));

// mock consent service
const mockEmitAudit = vi.fn().mockResolvedValue(undefined);
const mockEmitEvent = vi.fn().mockResolvedValue(undefined);
const mockService = createConsentService({
  emitAudit: mockEmitAudit,
  emitEvent: mockEmitEvent,
});

vi.mock('../src/lib/services', () => ({
  getConsentService: () => mockService,
}));

// import route handler after mocks
import { POST } from '../src/app/api/consent/withdraw/route';
import { extractUser } from '../src/lib/security/rbac-resolver';

// ---------------------------------------------------------------------------
// route helpers
// ---------------------------------------------------------------------------

function jsonRequest(body?: unknown): Request {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request('http://localhost:3000/api/consent/withdraw', init);
}

// ---------------------------------------------------------------------------
// POST /api/consent/withdraw — auth
// ---------------------------------------------------------------------------

describe('POST /api/consent/withdraw — authentication', () => {
  beforeEach(() => {
    vi.mocked(extractUser).mockResolvedValue(null);
    mockEmitAudit.mockClear();
    mockEmitEvent.mockClear();
  });

  it('returns 401 without authentication', async () => {
    const res = await POST(jsonRequest(validInput));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.title).toBe('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// POST /api/consent/withdraw — authenticated
// ---------------------------------------------------------------------------

describe('POST /api/consent/withdraw — authenticated', () => {
  beforeEach(() => {
    vi.mocked(extractUser).mockResolvedValue({
      userId: validInput.userId,
      role: 'user',
    } as ReturnType<typeof extractUser> extends Promise<infer T> ? NonNullable<T> : never);
    mockEmitAudit.mockClear();
    mockEmitEvent.mockClear();
  });

  it('returns 200 with valid body', async () => {
    const res = await POST(jsonRequest(validInput));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.userId).toBe(validInput.userId);
    expect(json.data.consentType).toBe('marketing');
    expect(json.data.auditRecorded).toBe(true);
  });

  it('returns 400 with invalid body', async () => {
    const res = await POST(jsonRequest({ userId: 'not-uuid', consentType: 'bad' }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.title).toBe('Validation Error');
  });

  it('returns 400 for invalid json', async () => {
    const req = new Request('http://localhost:3000/api/consent/withdraw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns consent withdrawal result with all fields', async () => {
    const res = await POST(jsonRequest(validInput));
    const json = await res.json();

    expect(json.data).toHaveProperty('userId');
    expect(json.data).toHaveProperty('consentType');
    expect(json.data).toHaveProperty('withdrawnAt');
    expect(json.data).toHaveProperty('auditRecorded');
  });
});
