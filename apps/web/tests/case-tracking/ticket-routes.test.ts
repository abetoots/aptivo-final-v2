/**
 * S17-CT-1: ticket HTTP route tests
 * @task S17-CT-1
 *
 * Verifies the RFC 7807 problem+json shape, RBAC short-circuit, and
 * each tagged-error → status-code mapping. Heavy use of mocking so
 * the test stays focused on the route's translation layer rather
 * than the service or store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

// must mock before importing the route
const mockTicketService = {
  create: vi.fn(),
  findById: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  softClose: vi.fn(),
};
const mockExtractUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockRateLimit = { check: vi.fn().mockResolvedValue(null) };

// S17-CT-2: GET /api/tickets/:id now enriches with slaStatus from
// the ticket-sla-service. Stub returns null (no SLA config) so the
// route falls back to slaStatus: null in the JSON response.
const mockTicketSlaService = {
  computeSla: vi.fn().mockResolvedValue(null),
  listAtRisk: vi.fn(),
  refreshConfigs: vi.fn(),
};

vi.mock('../../src/lib/services', () => ({
  getTicketService: () => mockTicketService,
  getAdminRateLimit: () => mockRateLimit,
  getTicketSlaService: () => mockTicketSlaService,
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

const TICKET = {
  id: '11111111-1111-4111-8111-111111111111',
  workflowDefinitionId: null,
  status: 'open' as const,
  priority: 'medium' as const,
  title: 't',
  body: 'b',
  ownerUserId: '22222222-2222-4222-8222-222222222222',
  departmentId: null,
  createdAt: new Date('2026-04-26T10:00:00Z'),
  updatedAt: new Date('2026-04-26T10:00:00Z'),
  closedAt: null,
  escalationState: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockResolvedValue(null); // permitted by default
  mockExtractUser.mockResolvedValue({ userId: 'user-7', email: 'u@test.com' });
});

describe('S17-CT-1: GET /api/tickets', () => {
  it('returns 401-style problem when permission middleware rejects', async () => {
    const denied = new Response(null, { status: 403 });
    mockCheckPermission.mockResolvedValueOnce(denied);
    const { GET } = await import('../../src/app/api/tickets/route');
    const res = await GET(new Request('http://t/api/tickets'));
    expect(res.status).toBe(403);
  });

  it('rejects invalid status query with RFC 7807 400', async () => {
    const { GET } = await import('../../src/app/api/tickets/route');
    const res = await GET(new Request('http://t/api/tickets?status=bogus'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('problem+json');
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-list-invalid');
  });

  it('rejects limit > 200 with RFC 7807 400', async () => {
    const { GET } = await import('../../src/app/api/tickets/route');
    const res = await GET(new Request('http://t/api/tickets?limit=201'));
    expect(res.status).toBe(400);
  });

  it('returns paginated payload with totalCount/limit/offset envelope', async () => {
    mockTicketService.list.mockResolvedValueOnce({ rows: [TICKET], totalCount: 1 });
    const { GET } = await import('../../src/app/api/tickets/route');
    const res = await GET(new Request('http://t/api/tickets?status=open&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ totalCount: 1, limit: 10, offset: 0 });
    expect(body.data).toHaveLength(1);
  });
});

describe('S17-CT-1: POST /api/tickets', () => {
  function postReq(body: unknown) {
    // Cast to NextRequest at the test seam — the withBodyLimits mock
    // doesn't actually use Next-specific APIs, but the route handlers
    // are typed against NextRequest.
    return new Request('http://t/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;
  }

  it('returns 403 when permission middleware rejects', async () => {
    mockCheckPermission.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { POST } = await import('../../src/app/api/tickets/route');
    const res = await POST(postReq({}));
    expect(res.status).toBe(403);
  });

  it('returns 401 problem+json when no user is extracted', async () => {
    mockExtractUser.mockResolvedValueOnce(null);
    const { POST } = await import('../../src/app/api/tickets/route');
    const res = await POST(postReq({ title: 't', body: 'b', ownerUserId: TICKET.ownerUserId }));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('problem+json');
  });

  it('translates TicketValidationError to 400 with issues[]', async () => {
    mockTicketService.create.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketValidationError', issues: [{ path: 'title', message: 'required' }] }),
    );
    const { POST } = await import('../../src/app/api/tickets/route');
    const res = await POST(postReq({ ownerUserId: TICKET.ownerUserId }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-validation');
    expect(body.issues).toEqual([{ path: 'title', message: 'required' }]);
  });

  it('translates WorkflowDefinitionNotFound to 400 with workflow-definition-not-found type', async () => {
    mockTicketService.create.mockResolvedValueOnce(
      Result.err({ _tag: 'WorkflowDefinitionNotFound', workflowDefinitionId: 'def-x' }),
    );
    const { POST } = await import('../../src/app/api/tickets/route');
    const res = await POST(postReq({ title: 't', body: 'b', ownerUserId: TICKET.ownerUserId, workflowDefinitionId: 'def-x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/workflow-definition-not-found');
  });

  it('returns 201 with the created ticket on success', async () => {
    mockTicketService.create.mockResolvedValueOnce(Result.ok(TICKET));
    const { POST } = await import('../../src/app/api/tickets/route');
    const res = await POST(postReq({ title: 't', body: 'b', ownerUserId: TICKET.ownerUserId }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(TICKET.id);
  });
});

describe('S17-CT-1: GET/PATCH/DELETE /api/tickets/:id', () => {
  function ctxFor(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  const MISSING_ID = '99999999-9999-4999-8999-999999999999';

  it('GET returns 400 problem+json when id is not a UUID (post-Codex validation)', async () => {
    const { GET } = await import('../../src/app/api/tickets/[id]/route');
    const res = await GET(new Request('http://t/api/tickets/not-a-uuid'), ctxFor('not-a-uuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-id-invalid');
    // service must NOT have been called for malformed input
    expect(mockTicketService.findById).not.toHaveBeenCalled();
  });

  it('GET returns 404 problem+json with ticket-not-found type', async () => {
    mockTicketService.findById.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketNotFound', id: MISSING_ID }),
    );
    const { GET } = await import('../../src/app/api/tickets/[id]/route');
    const res = await GET(new Request(`http://t/api/tickets/${MISSING_ID}`), ctxFor(MISSING_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-not-found');
  });

  it('GET returns 200 with the ticket on hit', async () => {
    mockTicketService.findById.mockResolvedValueOnce(Result.ok(TICKET));
    const { GET } = await import('../../src/app/api/tickets/[id]/route');
    const res = await GET(new Request(`http://t/api/tickets/${TICKET.id}`), ctxFor(TICKET.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(TICKET.id);
  });

  it('PATCH translates TicketAlreadyClosed to 409', async () => {
    mockTicketService.update.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketAlreadyClosed', id: TICKET.id }),
    );
    const { PATCH } = await import('../../src/app/api/tickets/[id]/route');
    const res = await PATCH(
      new Request(`http://t/api/tickets/${TICKET.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: 'high' }),
      }) as unknown as import('next/server').NextRequest,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-already-closed');
  });

  it('DELETE soft-closes and returns 200 with the closed ticket', async () => {
    mockTicketService.softClose.mockResolvedValueOnce(
      Result.ok({ ...TICKET, status: 'closed', closedAt: new Date() }),
    );
    const { DELETE } = await import('../../src/app/api/tickets/[id]/route');
    const res = await DELETE(new Request(`http://t/api/tickets/${TICKET.id}`, { method: 'DELETE' }) as unknown as import('next/server').NextRequest, ctxFor(TICKET.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('closed');
  });

  it('DELETE returns 409 if ticket already closed', async () => {
    mockTicketService.softClose.mockResolvedValueOnce(
      Result.err({ _tag: 'TicketAlreadyClosed', id: TICKET.id }),
    );
    const { DELETE } = await import('../../src/app/api/tickets/[id]/route');
    const res = await DELETE(new Request(`http://t/api/tickets/${TICKET.id}`, { method: 'DELETE' }) as unknown as import('next/server').NextRequest, ctxFor(TICKET.id));
    expect(res.status).toBe(409);
  });
});
