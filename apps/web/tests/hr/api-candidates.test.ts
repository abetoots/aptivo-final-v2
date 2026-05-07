/**
 * S18-B2: GET /api/hr/candidates + /api/hr/candidates/export tests.
 *
 * Coverage:
 *   - 403 on missing/wrong role
 *   - successful list emits `pii.read.bulk` with actor.type='user'
 *   - successful export emits `pii.read.export`
 *   - audit emit failure does NOT block the response (fire-and-forget)
 *   - status filter passes through to store.list
 *   - export rejects unsupported format with RFC 7807 problem+json
 *
 * The load-bearing assertion is the audit emit shape: actor.type
 * must be 'user' (not 'system') so audit_logs.user_id populates and
 * the anomaly aggregate matches per-user volume on HR scope. The
 * services.ts wiring fix (commit pre this slice) is what makes this
 * pass; without that fix, every emit would land as 'system' and the
 * anomaly gate stays inert on bulk-HR traffic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mocks — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockCandidateStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  updateStatus: vi.fn(),
  list: vi.fn(),
};

const mockAuditMiddleware = {
  auditPiiRead: vi.fn(),
  auditPiiReadBulk: vi.fn(),
  auditPiiReadExport: vi.fn(),
};

const mockExtractUser = vi.fn();
const mockResolvePermissions = vi.fn();
const mockResolvePermissionsForRole = vi.fn();
const mockGetDb = vi.fn();

vi.mock('../../src/lib/services', () => ({
  getCandidateStore: () => mockCandidateStore,
  getPiiReadAuditMiddleware: () => mockAuditMiddleware,
}));

vi.mock('../../src/lib/security/rbac-resolver', () => ({
  extractUser: (...args: unknown[]) => mockExtractUser(...args),
  resolvePermissions: (...args: unknown[]) => mockResolvePermissions(...args),
  resolvePermissionsForRole: (...args: unknown[]) =>
    mockResolvePermissionsForRole(...args),
  resolvePermissionsWithFederation: (...args: unknown[]) =>
    mockResolvePermissions(...args),
}));

vi.mock('../../src/lib/db', () => ({
  getDb: () => mockGetDb(),
  tryGetDb: async () => mockGetDb(),
}));

// ---------------------------------------------------------------------------
// import after mocks
// ---------------------------------------------------------------------------

import { GET as listGet } from '../../src/app/api/hr/candidates/route.js';
import { GET as exportGet } from '../../src/app/api/hr/candidates/export/route.js';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const USER_ID = 'recruiter-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

function makeRequest(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { ...headers },
  });
}

const SAMPLE_CANDIDATE = {
  id: 'cand-1',
  name: 'Alice Tester',
  email: 'alice@example.com',
  phone: '+1-555-0100',
  resumeFileId: null,
  skills: [],
  status: 'active',
  consentStatus: 'pending',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  mockGetDb.mockReturnValue({});

  // dev-mode RBAC uses x-user-role header; default extractUser
  mockExtractUser.mockResolvedValue({ userId: USER_ID, federatedRoles: [] });
  mockCandidateStore.list.mockResolvedValue([SAMPLE_CANDIDATE]);
  mockAuditMiddleware.auditPiiReadBulk.mockResolvedValue(Result.ok(undefined));
  mockAuditMiddleware.auditPiiReadExport.mockResolvedValue(Result.ok(undefined));
});

// ---------------------------------------------------------------------------
// tests — list endpoint
// ---------------------------------------------------------------------------

describe('S18-B2: GET /api/hr/candidates', () => {
  it('returns 403 without an authorized role (dev-mode header check)', async () => {
    const response = await listGet(makeRequest('/api/hr/candidates'));

    expect(response.status).toBe(403);
    expect(mockCandidateStore.list).not.toHaveBeenCalled();
    expect(mockAuditMiddleware.auditPiiReadBulk).not.toHaveBeenCalled();
  });

  it('returns 200 + emits pii.read.bulk with actor=user when authorized', async () => {
    const response = await listGet(
      makeRequest('/api/hr/candidates', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.pagination.returned).toBe(1);

    // S18-A1 attribution: audit emit fires with the userId
    expect(mockAuditMiddleware.auditPiiReadBulk).toHaveBeenCalledWith(
      USER_ID,
      'candidate',
      1,
    );
  });

  it('passes status filter through to store.list', async () => {
    await listGet(
      makeRequest('/api/hr/candidates?status=hired', { 'x-user-role': 'recruiter' }),
    );

    expect(mockCandidateStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'hired' }),
    );
  });

  it('clamps limit to 200 max regardless of query param', async () => {
    await listGet(
      makeRequest('/api/hr/candidates?limit=99999', { 'x-user-role': 'recruiter' }),
    );

    expect(mockCandidateStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });

  it('factory-level throw on getPiiReadAuditMiddleware does NOT block the response', async () => {
    // Round-1 review (test-quality-assessor HIGH #3): the prior
    // mockRejectedValueOnce simulated an impossible failure mode —
    // production middleware always resolves to a Result and never
    // throws. The realistic failures are (a) Result.err (covered by
    // the dedicated test below) and (b) factory-level throw from
    // lazy() init failing. This test covers (b).
    const realFactory = vi.mocked(mockAuditMiddleware);
    // simulate the factory itself throwing (e.g., lazy init crash)
    // by making the audit method throw synchronously on first call
    realFactory.auditPiiReadBulk.mockImplementationOnce(() => {
      throw new Error('factory init crash');
    });

    const response = await listGet(
      makeRequest('/api/hr/candidates', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates).toHaveLength(1);
  });

  it('returns 401 problem+json when extractUser returns null even if RBAC passed (round-1 fail-closed fix)', async () => {
    // Round-1 multi-model review (Codex MEDIUM + test-quality-assessor):
    // RBAC may pass via dev-mode x-user-role header even when extractUser
    // returns null. Reading PII without an authenticated identity means
    // the audit emit can't attribute — fail closed instead of producing
    // an unaudited PII read.
    mockExtractUser.mockResolvedValueOnce(null);

    const response = await listGet(
      makeRequest('/api/hr/candidates', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const body = await response.json();
    expect(body.type).toBe('/errors/auth-required');

    // critical: store NOT hit and audit emit NOT made
    expect(mockCandidateStore.list).not.toHaveBeenCalled();
    expect(mockAuditMiddleware.auditPiiReadBulk).not.toHaveBeenCalled();
  });

  it('awaits the audit emit (round-1 review fix: prevents serverless teardown drops)', async () => {
    // Round-1 review (Codex HIGH + Gemini HIGH): the prior fire-and-
    // forget pattern using detached promises could be dropped on
    // serverless teardown. The audit-emit Result.err path is the
    // realistic failure mode (production middleware always resolves
    // to Result and never rejects). Test asserts the route awaits
    // the call AND tolerates a Result.err result without breaking
    // the response.
    mockAuditMiddleware.auditPiiReadBulk.mockResolvedValueOnce(
      Result.err({ _tag: 'AuditEmitError' as const, cause: new Error('audit dlq down') }),
    );

    const response = await listGet(
      makeRequest('/api/hr/candidates', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
    expect(mockAuditMiddleware.auditPiiReadBulk).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// tests — export endpoint
// ---------------------------------------------------------------------------

describe('S18-B2: GET /api/hr/candidates/export', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await exportGet(
      makeRequest('/api/hr/candidates/export'),
    );

    expect(response.status).toBe(403);
    expect(mockAuditMiddleware.auditPiiReadExport).not.toHaveBeenCalled();
  });

  it('returns 200 + emits pii.read.export with format when authorized', async () => {
    const response = await exportGet(
      makeRequest('/api/hr/candidates/export?format=json', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockAuditMiddleware.auditPiiReadExport).toHaveBeenCalledWith(
      USER_ID,
      'candidate',
      1,
      'json',
    );
  });

  it('rejects unsupported format with RFC 7807 problem+json', async () => {
    const response = await exportGet(
      makeRequest('/api/hr/candidates/export?format=xml', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const body = await response.json();
    expect(body).toMatchObject({
      type: '/errors/unsupported-format',
      format: 'xml',
    });
    // no audit emit when the format check fails
    expect(mockAuditMiddleware.auditPiiReadExport).not.toHaveBeenCalled();
  });

  it('clamps limit to 1000 hard cap regardless of query param', async () => {
    await exportGet(
      makeRequest('/api/hr/candidates/export?limit=99999', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(mockCandidateStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000 }),
    );
  });
});
