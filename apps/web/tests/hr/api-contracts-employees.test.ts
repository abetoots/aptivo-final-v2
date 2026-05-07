/**
 * S18-B2 slice 4b+4c: GET /api/hr/contracts and /api/hr/employees
 * (+ their /export variants).
 *
 * Mirrors the assertions in api-candidates.test.ts (slice 4a) but
 * for the `contract` and `employee` resource types. The audit emit
 * shape is the load-bearing assertion: `actor.type='user'` populates
 * audit_logs.user_id and the anomaly aggregate matches.
 *
 * Employees endpoint additionally asserts that `status='hired'` is
 * always passed to CandidateStore.list (the route doesn't accept an
 * arbitrary status param — "/employees" means hired candidates only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

const mockCandidateStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  updateStatus: vi.fn(),
  list: vi.fn(),
};

const mockContractStore = {
  create: vi.fn(),
  findById: vi.fn(),
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
  getContractStore: () => mockContractStore,
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
// imports under test
// ---------------------------------------------------------------------------

import { GET as contractsListGet } from '../../src/app/api/hr/contracts/route.js';
import { GET as contractsExportGet } from '../../src/app/api/hr/contracts/export/route.js';
import { GET as employeesListGet } from '../../src/app/api/hr/employees/route.js';
import { GET as employeesExportGet } from '../../src/app/api/hr/employees/export/route.js';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const USER_ID = 'recruiter-bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

function makeRequest(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { ...headers },
  });
}

const SAMPLE_CONTRACT = {
  id: 'contract-1',
  candidateId: 'cand-1',
  templateSlug: 'employment-agreement',
  terms: { salary: 100_000 },
  version: 1,
  status: 'signed',
  complianceFlags: [],
  createdAt: new Date('2026-04-29T10:00:00Z'),
};

const SAMPLE_HIRED_CANDIDATE = {
  id: 'cand-hired-1',
  name: 'Hired Hank',
  email: 'hank@example.com',
  phone: '+1-555-0200',
  resumeFileId: null,
  skills: [],
  status: 'hired',
  consentStatus: 'granted',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  mockGetDb.mockReturnValue({});
  mockExtractUser.mockResolvedValue({ userId: USER_ID, federatedRoles: [] });
  mockContractStore.list.mockResolvedValue([SAMPLE_CONTRACT]);
  mockCandidateStore.list.mockResolvedValue([SAMPLE_HIRED_CANDIDATE]);
  mockAuditMiddleware.auditPiiReadBulk.mockResolvedValue(Result.ok(undefined));
  mockAuditMiddleware.auditPiiReadExport.mockResolvedValue(Result.ok(undefined));
});

// ---------------------------------------------------------------------------
// /api/hr/contracts
// ---------------------------------------------------------------------------

describe('S18-B2: GET /api/hr/contracts', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await contractsListGet(makeRequest('/api/hr/contracts'));

    expect(response.status).toBe(403);
    expect(mockContractStore.list).not.toHaveBeenCalled();
  });

  it('returns 200 + emits pii.read.bulk with resourceType=contract', async () => {
    const response = await contractsListGet(
      makeRequest('/api/hr/contracts', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contracts).toHaveLength(1);
    expect(mockAuditMiddleware.auditPiiReadBulk).toHaveBeenCalledWith(
      USER_ID,
      'contract',
      1,
    );
  });

  it('passes status filter to store.list', async () => {
    await contractsListGet(
      makeRequest('/api/hr/contracts?status=signed', { 'x-user-role': 'recruiter' }),
    );

    expect(mockContractStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'signed' }),
    );
  });

  it('audit emit failure does NOT block response', async () => {
    mockAuditMiddleware.auditPiiReadBulk.mockRejectedValueOnce(
      new Error('audit dlq down'),
    );

    const response = await contractsListGet(
      makeRequest('/api/hr/contracts', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
  });
});

describe('S18-B2: GET /api/hr/contracts/export', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await contractsExportGet(
      makeRequest('/api/hr/contracts/export'),
    );

    expect(response.status).toBe(403);
  });

  it('returns 200 + emits pii.read.export with format', async () => {
    const response = await contractsExportGet(
      makeRequest('/api/hr/contracts/export?format=json', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockAuditMiddleware.auditPiiReadExport).toHaveBeenCalledWith(
      USER_ID,
      'contract',
      1,
      'json',
    );
  });

  it('rejects unsupported format with RFC 7807 problem+json', async () => {
    const response = await contractsExportGet(
      makeRequest('/api/hr/contracts/export?format=csv', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(mockAuditMiddleware.auditPiiReadExport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/hr/employees
// ---------------------------------------------------------------------------

describe('S18-B2: GET /api/hr/employees', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await employeesListGet(makeRequest('/api/hr/employees'));

    expect(response.status).toBe(403);
    expect(mockCandidateStore.list).not.toHaveBeenCalled();
  });

  it('always passes status=hired to store.list (route does not accept arbitrary status)', async () => {
    // even if the caller tries to pass status=active, the route forces 'hired'
    await employeesListGet(
      makeRequest('/api/hr/employees?status=active', { 'x-user-role': 'recruiter' }),
    );

    expect(mockCandidateStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'hired' }),
    );
  });

  it('returns 200 + emits pii.read.bulk with resourceType=employee', async () => {
    const response = await employeesListGet(
      makeRequest('/api/hr/employees', { 'x-user-role': 'recruiter' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.employees).toHaveLength(1);
    // resourceType='employee' (NOT 'candidate') — the anomaly gate
    // scores employee-PII volume separately from candidate-PII volume
    expect(mockAuditMiddleware.auditPiiReadBulk).toHaveBeenCalledWith(
      USER_ID,
      'employee',
      1,
    );
  });
});

describe('S18-B2: GET /api/hr/employees/export', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await employeesExportGet(
      makeRequest('/api/hr/employees/export'),
    );

    expect(response.status).toBe(403);
  });

  it('emits pii.read.export with resourceType=employee and format', async () => {
    const response = await employeesExportGet(
      makeRequest('/api/hr/employees/export?format=json', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockAuditMiddleware.auditPiiReadExport).toHaveBeenCalledWith(
      USER_ID,
      'employee',
      1,
      'json',
    );
    // confirm status='hired' filter on export too
    expect(mockCandidateStore.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'hired' }),
    );
  });

  it('rejects unsupported format', async () => {
    const response = await employeesExportGet(
      makeRequest('/api/hr/employees/export?format=xml', {
        'x-user-role': 'recruiter',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockAuditMiddleware.auditPiiReadExport).not.toHaveBeenCalled();
  });
});
