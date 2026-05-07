/**
 * S18-B2 slice 5: GET /api/hr/onboarding/[id] tests.
 *
 * Coverage:
 *   - 403 on missing/wrong role
 *   - 404 when onboarding row not found
 *   - 404 when candidate referenced by onboarding row not found
 *     (defensive against orphan onboarding rows)
 *   - 401 when extractUser returns null in dev mode (consent
 *     enforcement requires identity)
 *   - 403 problem+json with type=/errors/consent-required when
 *     candidate has no consent
 *   - 403 problem+json with detail='consent-withdrawn' when
 *     candidate has withdrawn consent
 *   - 200 on active consent: returns onboarding state + tasks +
 *     accessReason='consent-active'
 *   - 200 on self-access: candidate's email matches user's email →
 *     consent lookup is skipped and response includes
 *     accessReason='self-access'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

const mockOnboardingStore = {
  findOrCreate: vi.fn(),
  findById: vi.fn(),
  findByCandidateId: vi.fn(),
  transitionState: vi.fn(),
  recordStepFailure: vi.fn(),
  seedTasks: vi.fn(),
  findTasksByOnboarding: vi.fn(),
  submitTask: vi.fn(),
  verifyTask: vi.fn(),
};

const mockCandidateStore = {
  create: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  updateStatus: vi.fn(),
  list: vi.fn(),
};

const mockRequireConsent = {
  check: vi.fn(),
  denyResponse: vi.fn(),
};

const mockExtractUser = vi.fn();
const mockResolvePermissions = vi.fn();
const mockResolvePermissionsForRole = vi.fn();
const mockGetDb = vi.fn();

vi.mock('../../src/lib/services', () => ({
  getHrOnboardingStore: () => mockOnboardingStore,
  getCandidateStore: () => mockCandidateStore,
  getRequireConsent: () => mockRequireConsent,
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

import { GET as detailGet } from '../../src/app/api/hr/onboarding/[id]/route.js';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const RECRUITER_ID = 'recruiter-cccccccc-3333-4333-8333-cccccccccccc';
const CANDIDATE_ID = '22222222-2222-4222-8222-000000000002';

const SAMPLE_ONBOARDING = {
  id: 'onb-1',
  candidateId: CANDIDATE_ID,
  contractId: 'contract-1',
  state: 'manager_assigned',
  managerId: 'mgr-1',
  hitlRequestId: 'hitl-1',
  approvedBy: null,
  lastStepFailedAt: null,
  lastStepFailureReason: null,
  createdAt: new Date('2026-04-29T10:00:00Z'),
  updatedAt: new Date('2026-04-29T11:00:00Z'),
  onboardedAt: null,
};

const SAMPLE_CANDIDATE = {
  id: CANDIDATE_ID,
  name: 'Alice Tester',
  email: 'alice@example.com',
  phone: '+1-555-0100',
  resumeFileId: null,
  skills: [],
  status: 'hired',
  consentStatus: 'granted',
};

const SAMPLE_TASKS = [
  {
    id: 'task-1',
    onboardingId: 'onb-1',
    slug: 'i9-form',
    label: 'I-9',
    status: 'pending',
    fileId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function makeRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/hr/onboarding/onb-1', {
    headers: { ...headers },
  });
}

const ctx = { params: Promise.resolve({ id: 'onb-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  mockGetDb.mockReturnValue({});

  // default: recruiter-role caller with email distinct from candidate
  mockExtractUser.mockResolvedValue({
    userId: RECRUITER_ID,
    email: 'recruiter@aptivo.test',
    federatedRoles: [],
  });

  mockOnboardingStore.findById.mockResolvedValue(SAMPLE_ONBOARDING);
  mockCandidateStore.findById.mockResolvedValue(SAMPLE_CANDIDATE);
  mockOnboardingStore.findTasksByOnboarding.mockResolvedValue(SAMPLE_TASKS);
  mockRequireConsent.check.mockResolvedValue({ ok: true, reason: 'consent-active' });
  mockRequireConsent.denyResponse.mockImplementation((reason: string) =>
    NextResponse.json(
      {
        type: '/errors/consent-required',
        status: 403,
        detail: reason,
        title: 'denied',
      },
      { status: 403, headers: { 'content-type': 'application/problem+json' } },
    ),
  );
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B2: GET /api/hr/onboarding/[id]', () => {
  it('returns 403 without an authorized role', async () => {
    const response = await detailGet(makeRequest(), ctx);

    expect(response.status).toBe(403);
    expect(mockOnboardingStore.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when onboarding row is not found', async () => {
    mockOnboardingStore.findById.mockResolvedValueOnce(null);

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.type).toBe('/errors/not-found');
    expect(mockCandidateStore.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when candidate referenced by onboarding is not found (orphan defense)', async () => {
    mockCandidateStore.findById.mockResolvedValueOnce(null);

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.title).toContain('Candidate not found');
  });

  it('returns 401 when extractUser returns null (consent enforcement requires identity)', async () => {
    mockExtractUser.mockResolvedValueOnce(null);

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.type).toBe('/errors/auth-required');
  });

  it('returns 403 problem+json when consent is required but missing', async () => {
    mockRequireConsent.check.mockResolvedValueOnce({
      ok: false,
      reason: 'consent-required',
    });

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(mockRequireConsent.denyResponse).toHaveBeenCalledWith('consent-required');
  });

  it('returns 403 problem+json when consent is withdrawn', async () => {
    mockRequireConsent.check.mockResolvedValueOnce({
      ok: false,
      reason: 'consent-withdrawn',
    });

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(403);
    expect(mockRequireConsent.denyResponse).toHaveBeenCalledWith('consent-withdrawn');
  });

  it('returns 200 with onboarding + tasks when consent is active', async () => {
    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.onboarding.id).toBe('onb-1');
    expect(body.onboarding.state).toBe('manager_assigned');
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].slug).toBe('i9-form');
    expect(body.accessReason).toBe('consent-active');

    // requireConsent.check called with the right candidate + user shape
    expect(mockRequireConsent.check).toHaveBeenCalledWith(
      { id: CANDIDATE_ID, email: 'alice@example.com' },
      { userId: RECRUITER_ID, email: 'recruiter@aptivo.test' },
      'data_processing',
    );
  });

  it('returns 200 with accessReason=self-access when consent.check returns self-access', async () => {
    mockRequireConsent.check.mockResolvedValueOnce({ ok: true, reason: 'self-access' });

    const response = await detailGet(
      makeRequest({ 'x-user-role': 'recruiter' }),
      ctx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessReason).toBe('self-access');
  });
});
