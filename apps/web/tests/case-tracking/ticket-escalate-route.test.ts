/**
 * S17-CT-3: POST/GET /api/tickets/:id/escalate route tests
 * @task S17-CT-3
 *
 * Verifies the RFC 7807 problem+json mapping for each EscalationError
 * tag, the RBAC short-circuit, and the malformed-input rejection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

const mockEscalation = {
  manualEscalate: vi.fn(),
  getChainStatus: vi.fn(),
  advance: vi.fn(),
};
const mockExtractUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockRateLimit = { check: vi.fn().mockResolvedValue(null) };

vi.mock('../../src/lib/services', () => ({
  getTicketEscalationService: () => mockEscalation,
  getAdminRateLimit: () => mockRateLimit,
}));

vi.mock('../../src/lib/security/rbac-middleware', () => ({
  checkPermissionWithBlacklist: (perm: string) => async (req: Request) => mockCheckPermission(perm, req),
}));

vi.mock('../../src/lib/security/rbac-resolver', () => ({
  extractUser: (req: Request) => mockExtractUser(req),
}));

vi.mock('../../src/lib/security/route-guard', () => ({
  withBodyLimits: (handler: (req: Request, body: unknown) => Promise<Response>) => async (req: Request) => {
    const body = await req.json().catch(() => ({}));
    return handler(req, body);
  },
}));

const TICKET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockResolvedValue(null);
  mockExtractUser.mockResolvedValue({ userId: 'user-7', email: 'u@test.com' });
});

describe('S17-CT-3: POST /api/tickets/:id/escalate', () => {
  function postReq(body: unknown, id = TICKET_ID) {
    return new Request(`http://t/api/tickets/${id}/escalate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;
  }

  it('returns 403 when permission middleware rejects', async () => {
    mockCheckPermission.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 problem+json when no user is extracted', async () => {
    mockExtractUser.mockResolvedValueOnce(null);
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }));
    expect(res.status).toBe(401);
  });

  it('rejects non-UUID :id with 400 ticket-id-invalid', async () => {
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }, 'not-a-uuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-id-invalid');
    expect(mockEscalation.manualEscalate).not.toHaveBeenCalled();
  });

  it('rejects empty reason with 400 ticket-validation', async () => {
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-validation');
  });

  it('translates TicketAlreadyAtTopTier to 409', async () => {
    mockEscalation.manualEscalate.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketAlreadyAtTopTier', ticketId: TICKET_ID }),
    );
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-already-at-top-tier');
  });

  it('translates TicketEscalationConfigMissing to 422', async () => {
    mockEscalation.manualEscalate.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketEscalationConfigMissing', priority: 'low' }),
    );
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-escalation-config-missing');
  });

  it('translates TicketEscalationStale to 409 ticket-escalation-stale', async () => {
    mockEscalation.manualEscalate.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketEscalationStale', ticketId: TICKET_ID }),
    );
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'page' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-escalation-stale');
  });

  it('returns 200 with the updated ticket on success', async () => {
    const updated = {
      id: TICKET_ID,
      status: 'escalated' as const,
      priority: 'high' as const,
      escalationState: { currentTier: 'L2', chain: ['L1', 'L2'], history: [] },
    };
    mockEscalation.manualEscalate.mockResolvedValueOnce(Result.ok(updated));
    const { POST } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await POST(postReq({ reason: 'customer escalation' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('escalated');
  });
});

describe('S17-CT-3: GET /api/tickets/:id/escalate', () => {
  function ctxFor(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 200 with chain status', async () => {
    mockEscalation.getChainStatus.mockResolvedValueOnce(Result.ok({
      ticketId: TICKET_ID,
      currentTier: 'L1',
      nextTier: 'L2',
      chain: ['L1', 'L2'],
      history: [],
      isAtTopTier: false,
    }));
    const { GET } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await GET(new Request(`http://t/api/tickets/${TICKET_ID}/escalate`), ctxFor(TICKET_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.currentTier).toBe('L1');
    expect(body.data.nextTier).toBe('L2');
  });

  it('rejects non-UUID :id with 400', async () => {
    const { GET } = await import('../../src/app/api/tickets/[id]/escalate/route');
    const res = await GET(new Request('http://t/api/tickets/not-a-uuid/escalate'), ctxFor('not-a-uuid'));
    expect(res.status).toBe(400);
  });
});
