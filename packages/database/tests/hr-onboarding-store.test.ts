/**
 * S18-B2: HR onboarding store adapter tests.
 *
 * Verifies the adapter's CRUD shape against a chained-mock Drizzle
 * client. Mirrors the pattern in `crypto-position-store.test.ts` so
 * the tests stay self-contained without spinning up Postgres.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDrizzleHrOnboardingStore } from '../src/adapters/hr-onboarding-store-drizzle.js';

// ---------------------------------------------------------------------------
// chained-builder mock
// ---------------------------------------------------------------------------

function createMockDb(opts?: {
  insertReturn?: unknown;
  selectRows?: unknown[];
}) {
  const insertReturn = opts?.insertReturn ?? [{ id: 'onboarding-uuid-001' }];

  // insert builder supports two terminal styles:
  //   .values(...).onConflictDoUpdate(...).returning() → for findOrCreate
  //   .values(...).onConflictDoNothing() → for seedTasks (no .returning)
  const insertBuilder = {
    values: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    onConflictDoUpdate: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
    returning: vi.fn().mockResolvedValue(insertReturn) as ReturnType<typeof vi.fn>,
  };
  insertBuilder.values.mockReturnValue(insertBuilder);
  insertBuilder.onConflictDoUpdate.mockReturnValue(insertBuilder);

  const selectBuilder = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(opts?.selectRows ?? []),
    }),
  };

  const updateBuilder = {
    set: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
    where: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
  };
  updateBuilder.set.mockReturnValue(updateBuilder);

  return {
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };
}

// ---------------------------------------------------------------------------
// fixture data
// ---------------------------------------------------------------------------

const SAMPLE_ROW = {
  id: 'onb-1',
  candidateId: 'cand-1',
  contractId: 'contract-1',
  state: 'pending',
  managerId: null,
  hitlRequestId: null,
  approvedBy: null,
  lastStepFailedAt: null,
  lastStepFailureReason: null,
  createdAt: new Date('2026-04-29T10:00:00Z'),
  updatedAt: new Date('2026-04-29T10:00:00Z'),
  onboardedAt: null,
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S18-B2: createDrizzleHrOnboardingStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb({ insertReturn: [SAMPLE_ROW] });
  });

  describe('findOrCreate', () => {
    it('returns the row from RETURNING after upsert (idempotent on duplicate candidateId)', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      const result = await store.findOrCreate({
        candidateId: 'cand-1',
        contractId: 'contract-1',
      });

      expect(result.id).toBe('onb-1');
      expect(result.state).toBe('pending');
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db._insertBuilder.values).toHaveBeenCalledWith({
        candidateId: 'cand-1',
        contractId: 'contract-1',
      });
      // ON CONFLICT DO UPDATE so the existing row's RETURNING fires
      expect(db._insertBuilder.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    });

    it('contractId optional → passes null through to the insert', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.findOrCreate({ candidateId: 'cand-1' });

      expect(db._insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: null }),
      );
    });
  });

  describe('findById / findByCandidateId', () => {
    it('returns null when no row matches', async () => {
      db = createMockDb({ selectRows: [] });
      const store = createDrizzleHrOnboardingStore(db as never);

      expect(await store.findById('missing')).toBeNull();
      expect(await store.findByCandidateId('missing')).toBeNull();
    });

    it('maps row → record on findById', async () => {
      db = createMockDb({ selectRows: [SAMPLE_ROW] });
      const store = createDrizzleHrOnboardingStore(db as never);

      const result = await store.findById('onb-1');

      expect(result).toMatchObject({
        id: 'onb-1',
        candidateId: 'cand-1',
        state: 'pending',
      });
    });

    it('findByCandidateId works with the same row mapping', async () => {
      db = createMockDb({ selectRows: [SAMPLE_ROW] });
      const store = createDrizzleHrOnboardingStore(db as never);

      const result = await store.findByCandidateId('cand-1');

      expect(result?.id).toBe('onb-1');
    });
  });

  describe('transitionState', () => {
    it('updates state without metadata', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.transitionState('onb-1', 'docs_collected');

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'docs_collected',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('writes managerId when transitioning to manager_assigned', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.transitionState('onb-1', 'manager_assigned', {
        managerId: 'mgr-7',
      });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'manager_assigned',
          managerId: 'mgr-7',
        }),
      );
    });

    it('writes approvedBy + hitlRequestId on the approved transition', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.transitionState('onb-1', 'approved', {
        hitlRequestId: 'hitl-3',
        approvedBy: 'user-9',
      });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'approved',
          hitlRequestId: 'hitl-3',
          approvedBy: 'user-9',
        }),
      );
    });

    it('stamps onboardedAt automatically when transitioning to onboarded', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.transitionState('onb-1', 'onboarded');

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'onboarded',
          onboardedAt: expect.any(Date),
        }),
      );
    });

    it('honours an explicit onboardedAt override', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);
      const fixed = new Date('2026-04-29T15:00:00Z');

      await store.transitionState('onb-1', 'onboarded', { onboardedAt: fixed });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ onboardedAt: fixed }),
      );
    });
  });

  describe('recordStepFailure', () => {
    it('writes lastStepFailedAt + reason without changing state', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.recordStepFailure('onb-1', 'manager-assignment-timeout');

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastStepFailedAt: expect.any(Date),
          lastStepFailureReason: 'manager-assignment-timeout',
          updatedAt: expect.any(Date),
        }),
      );
      // critical: state field is NOT in the update set — failure is
      // surfaced separately so admins can re-drive without losing
      // progress on the state machine
      const setCall = db._updateBuilder.set.mock.calls[0]![0] as Record<string, unknown>;
      expect(setCall).not.toHaveProperty('state');
    });
  });

  describe('seedTasks', () => {
    it('inserts the task definitions with onConflictDoNothing for idempotency', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.seedTasks('onb-1', [
        { slug: 'i9-form', label: 'I-9 Employment Verification' },
        { slug: 'tax-w4', label: 'W-4 Tax Withholding' },
      ]);

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db._insertBuilder.values).toHaveBeenCalledWith([
        { onboardingId: 'onb-1', slug: 'i9-form', label: 'I-9 Employment Verification' },
        { onboardingId: 'onb-1', slug: 'tax-w4', label: 'W-4 Tax Withholding' },
      ]);
      expect(db._insertBuilder.onConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it('no-ops on empty input — does not call insert', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.seedTasks('onb-1', []);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('submitTask / verifyTask', () => {
    it('submitTask sets status=submitted, fileId, metadata', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.submitTask('task-1', {
        fileId: 'file-1',
        metadata: { uploaderIp: '10.0.0.1' },
      });

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'submitted',
          fileId: 'file-1',
          metadata: { uploaderIp: '10.0.0.1' },
        }),
      );
    });

    it('verifyTask sets status=verified', async () => {
      const store = createDrizzleHrOnboardingStore(db as never);

      await store.verifyTask('task-1');

      expect(db._updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'verified',
          metadata: {},
        }),
      );
    });
  });
});
