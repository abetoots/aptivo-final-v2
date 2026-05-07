/**
 * S18-B2: HR onboarding workflow tests.
 *
 * Coverage by branch:
 *   - trigger missing approverId → status='trigger-malformed', no row
 *   - happy path: pending → docs_collected → manager_assigned → HITL
 *     approved → approved → onboarded; audit emits attribute to the
 *     approvedBy with type='user'
 *   - HITL rejection → status='rejected-by-manager'
 *   - HITL timeout → status='expired', recordStepFailure called
 *   - Malformed approval (decision='approved' but no approverId) →
 *     fail-closed, no transition to approved
 *   - Idempotency: state='onboarded' on re-trigger short-circuits to
 *     status='onboarded' without re-running the lifecycle
 *
 * Pattern matches s7-hr-02-contract-approval.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// service mocks
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

const mockAuditService = { emit: vi.fn() };
const mockHitlDeps = {};
const mockNotificationService = { send: vi.fn() };

vi.mock('@aptivo/hitl-gateway', () => ({
  createRequest: vi.fn(),
}));

vi.mock('../../src/lib/services', () => ({
  getAuditService: () => mockAuditService,
  getHrOnboardingStore: () => mockOnboardingStore,
  getHitlRequestDeps: () => mockHitlDeps,
  getNotificationService: () => mockNotificationService,
}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/lib/inngest', async () => {
  const { Inngest } = await import('inngest');
  const mockInngest = new Inngest({ id: 'test-onboarding' });
  mockInngest.send = mockSend as typeof mockInngest.send;
  return { inngest: mockInngest };
});

import { onboardingFn } from '../../src/lib/workflows/hr-onboarding.js';
import { createRequest } from '@aptivo/hitl-gateway';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const APPROVER_ID = 'approver-7e7e7e7e-1234-4abc-9def-aaaaaaaaaaaa';
const HITL_APPROVER = 'mgr-9d9d9d9d-1234-4abc-9def-bbbbbbbbbbbb';
const CONTRACT_ID = '11111111-1111-4111-8111-000000000001';
const CANDIDATE_ID = '22222222-2222-4222-8222-000000000002';

const triggerEvent = (overrides?: Record<string, unknown>) =>
  [
    {
      name: 'hr/contract.signed' as const,
      data: {
        contractId: CONTRACT_ID,
        candidateId: CANDIDATE_ID,
        approverId: APPROVER_ID,
        signedAt: '2026-04-29T12:00:00Z',
        ...overrides,
      },
    },
  ] as [unknown];

const onboardingRow = (overrides?: Record<string, unknown>) => ({
  id: 'onb-1',
  candidateId: CANDIDATE_ID,
  contractId: CONTRACT_ID,
  state: 'pending',
  managerId: null,
  hitlRequestId: null,
  approvedBy: null,
  lastStepFailedAt: null,
  lastStepFailureReason: null,
  createdAt: new Date('2026-04-29T12:00:00Z'),
  updatedAt: new Date('2026-04-29T12:00:00Z'),
  onboardedAt: null,
  ...overrides,
});

function happyPathMocks() {
  mockOnboardingStore.findOrCreate.mockResolvedValue(onboardingRow());
  mockOnboardingStore.seedTasks.mockResolvedValue(undefined);
  mockOnboardingStore.transitionState.mockResolvedValue(undefined);
  mockOnboardingStore.recordStepFailure.mockResolvedValue(undefined);
  mockAuditService.emit.mockResolvedValue(Result.ok({ id: 'audit-1' }));
  mockNotificationService.send.mockResolvedValue({ ok: true });
  vi.mocked(createRequest).mockResolvedValue(
    Result.ok({
      requestId: 'hitl-req-1',
      approveUrl: 'https://t/a',
      rejectUrl: 'https://t/r',
    }),
  );
}

const engineFor = (opts?: Partial<InngestTestEngine.Options>) =>
  new InngestTestEngine({ function: onboardingFn, ...opts });

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B2: HR onboarding workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    happyPathMocks();
  });

  it('rejects with trigger-malformed when approverId missing on the trigger event', async () => {
    const engine = engineFor({ events: triggerEvent({ approverId: undefined }) });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'trigger-malformed',
      reason: expect.stringContaining('missing approverId'),
    });
    expect(mockOnboardingStore.findOrCreate).not.toHaveBeenCalled();
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'system', type: 'system' },
        action: 'hr.onboarding.trigger-malformed',
      }),
    );
  });

  it('happy path: full onboarding lifecycle with audit attribution to approvedBy', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-onboarding-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'approved',
              approverId: HITL_APPROVER,
              decidedAt: '2026-04-29T13:00:00Z',
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'onboarded',
      onboardingId: 'onb-1',
      candidateId: CANDIDATE_ID,
    });

    // findOrCreate called with the trigger payload
    expect(mockOnboardingStore.findOrCreate).toHaveBeenCalledWith({
      candidateId: CANDIDATE_ID,
      contractId: CONTRACT_ID,
    });

    // tasks seeded with the default checklist (5 entries)
    expect(mockOnboardingStore.seedTasks).toHaveBeenCalledWith(
      'onb-1',
      expect.arrayContaining([
        expect.objectContaining({ slug: 'i9-form' }),
        expect.objectContaining({ slug: 'tax-w4' }),
      ]),
    );

    // state transitions in order: docs_collected → manager_assigned →
    // approved → onboarded
    const calls = mockOnboardingStore.transitionState.mock.calls.map(
      (c) => c[1] as string,
    );
    expect(calls).toContain('docs_collected');
    expect(calls).toContain('manager_assigned');
    expect(calls).toContain('approved');
    expect(calls).toContain('onboarded');

    // approvedBy stamped at the approved transition
    expect(mockOnboardingStore.transitionState).toHaveBeenCalledWith(
      'onb-1',
      'approved',
      expect.objectContaining({ approvedBy: HITL_APPROVER }),
    );

    // hr/onboarding.completed event emitted
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hr/onboarding.completed',
        data: expect.objectContaining({
          onboardingId: 'onb-1',
          candidateId: CANDIDATE_ID,
          approvedBy: HITL_APPROVER,
        }),
      }),
    );

    // terminal audit attributes to the HITL approver with type='user'
    // (S18-A1: this is the row that populates audit_logs.user_id)
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: HITL_APPROVER, type: 'user' },
        action: 'hr.onboarding.completed',
        resource: { type: 'hr-onboarding', id: 'onb-1' },
      }),
    );
  });

  it('rejection path: HITL rejected → no approved/onboarded transition', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-onboarding-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'rejected',
              approverId: HITL_APPROVER,
              decidedAt: '2026-04-29T13:00:00Z',
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'rejected-by-manager',
      onboardingId: 'onb-1',
    });

    // approved + onboarded transitions NOT called
    const calls = mockOnboardingStore.transitionState.mock.calls.map(
      (c) => c[1] as string,
    );
    expect(calls).not.toContain('approved');
    expect(calls).not.toContain('onboarded');

    // rejection audit attributes to the rejecting approver
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: HITL_APPROVER, type: 'user' },
        action: 'hr.onboarding.rejected-by-manager',
      }),
    );
  });

  it('timeout path: HITL no decision in window → expired status + recordStepFailure', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-onboarding-decision',
          handler: () => null, // simulate timeout
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({ status: 'expired', onboardingId: 'onb-1' });

    expect(mockOnboardingStore.recordStepFailure).toHaveBeenCalledWith(
      'onb-1',
      'hitl-decision-timeout',
    );

    // expired audit attributes to the contract approver (no HITL
    // approver since no decision was made)
    expect(mockAuditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: APPROVER_ID, type: 'user' },
        action: 'hr.onboarding.expired',
      }),
    );
  });

  it('malformed approval (decision=approved but no approverId) → fail-closed', async () => {
    const engine = engineFor({
      events: triggerEvent(),
      steps: [
        {
          id: 'wait-for-onboarding-decision',
          handler: () => ({
            name: 'hitl/decision.recorded',
            data: {
              requestId: 'hitl-req-1',
              decision: 'approved',
              decidedAt: '2026-04-29T13:00:00Z',
              // approverId omitted
            },
          }),
        },
      ],
    });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'error',
      step: 'wait-for-decision',
      error: expect.stringContaining('missing approverId'),
    });

    // no approved transition
    const calls = mockOnboardingStore.transitionState.mock.calls.map(
      (c) => c[1] as string,
    );
    expect(calls).not.toContain('approved');

    expect(mockOnboardingStore.recordStepFailure).toHaveBeenCalledWith(
      'onb-1',
      expect.stringContaining('missing approverId'),
    );
  });

  it('idempotency: existing onboarded row short-circuits with status onboarded', async () => {
    mockOnboardingStore.findOrCreate.mockResolvedValueOnce(
      onboardingRow({
        state: 'onboarded',
        approvedBy: HITL_APPROVER,
        onboardedAt: new Date('2026-04-28T12:00:00Z'),
      }),
    );

    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'onboarded',
      onboardingId: 'onb-1',
      candidateId: CANDIDATE_ID,
    });

    // no further transitions or seeding — short-circuit at the trigger
    expect(mockOnboardingStore.seedTasks).not.toHaveBeenCalled();
    expect(mockOnboardingStore.transitionState).not.toHaveBeenCalled();
    // no HITL request or wait
    expect(vi.mocked(createRequest)).not.toHaveBeenCalled();
  });

  it('docs-collected step failure → records the failure and returns error', async () => {
    mockOnboardingStore.seedTasks.mockRejectedValueOnce(new Error('db connection lost'));
    const engine = engineFor({ events: triggerEvent() });

    const { result } = await engine.execute();

    expect(result).toMatchObject({
      status: 'error',
      step: 'docs-collected',
      error: expect.stringContaining('db connection lost'),
    });

    expect(mockOnboardingStore.recordStepFailure).toHaveBeenCalledWith(
      'onb-1',
      expect.stringContaining('docs-collected'),
    );

    // approved/onboarded transitions NOT reached
    const calls = mockOnboardingStore.transitionState.mock.calls.map(
      (c) => c[1] as string,
    );
    expect(calls).not.toContain('approved');
    expect(calls).not.toContain('onboarded');
  });
});
