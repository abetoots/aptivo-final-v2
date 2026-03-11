/**
 * S6-INF-HR: HR domain adapter tests
 * @task S6-INF-HR
 *
 * unit tests with mocked drizzle client for:
 * - createDrizzleCandidateStore (create, findById, findByEmail, updateStatus)
 * - createDrizzleApplicationStore (create, findByCandidate, updateStage)
 * - createDrizzleInterviewStore (create, findByApplication, updateStatus)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDrizzleCandidateStore,
  createDrizzleApplicationStore,
  createDrizzleInterviewStore,
} from '../src/adapters/hr-stores';

// ---------------------------------------------------------------------------
// mock drizzle builder helpers
// ---------------------------------------------------------------------------

function createMockQueryBuilder(resolvedValue: unknown = []) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  // terminal: returning resolves with value
  builder.returning = vi.fn().mockResolvedValue(resolvedValue);

  // chaining methods
  builder.values = vi.fn().mockReturnValue(builder);
  builder.set = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockDb(overrides?: {
  insertResult?: unknown;
  selectResult?: unknown;
}) {
  const insertBuilder = createMockQueryBuilder(overrides?.insertResult ?? [{ id: 'hr-uuid-001' }]);
  const selectBuilder = createMockQueryBuilder(overrides?.selectResult ?? []);
  const updateBuilder = createMockQueryBuilder();

  // select terminal resolves via where
  selectBuilder.where = vi.fn().mockResolvedValue(overrides?.selectResult ?? []);

  const db = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    transaction: vi.fn(),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// createDrizzleCandidateStore
// ===========================================================================

describe('createDrizzleCandidateStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('create', () => {
    it('inserts a candidate and returns { id }', async () => {
      const store = createDrizzleCandidateStore(db);

      const result = await store.create({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1234567890',
      });

      expect(result).toEqual({ id: 'hr-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleCandidateStore(db);
      await store.create({
        name: 'John Smith',
        email: 'john@example.com',
        skills: ['typescript', 'react'],
        consentStatus: 'granted',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        name: 'John Smith',
        email: 'john@example.com',
        skills: ['typescript', 'react'],
        consentStatus: 'granted',
      });
    });
  });

  describe('findById', () => {
    it('returns a candidate record when found', async () => {
      const candidateRow = {
        id: 'cand-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1234567890',
        resumeFileId: 'file-1',
        skills: ['typescript'],
        status: 'active',
        consentStatus: 'granted',
      };
      db = createMockDb({ selectResult: [candidateRow] });
      const store = createDrizzleCandidateStore(db);

      const result = await store.findById('cand-1');

      expect(result).toEqual(candidateRow);
    });

    it('returns null when no candidate found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleCandidateStore(db);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('returns a candidate record when found by email', async () => {
      const candidateRow = {
        id: 'cand-2',
        name: 'Bob',
        email: 'bob@example.com',
        phone: null,
        resumeFileId: null,
        skills: [],
        status: 'active',
        consentStatus: 'pending',
      };
      db = createMockDb({ selectResult: [candidateRow] });
      const store = createDrizzleCandidateStore(db);

      const result = await store.findByEmail('bob@example.com');

      expect(result).toEqual(candidateRow);
    });

    it('returns null when no candidate found by email', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleCandidateStore(db);

      const result = await store.findByEmail('nobody@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates the candidate status', async () => {
      const store = createDrizzleCandidateStore(db);

      await store.updateStatus('cand-1', 'anonymized');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('anonymized');
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });
});

// ===========================================================================
// createDrizzleApplicationStore
// ===========================================================================

describe('createDrizzleApplicationStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('create', () => {
    it('inserts an application and returns { id }', async () => {
      const store = createDrizzleApplicationStore(db);

      const result = await store.create({
        candidateId: 'cand-1',
        source: 'referral',
      });

      expect(result).toEqual({ id: 'hr-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleApplicationStore(db);
      await store.create({
        candidateId: 'cand-1',
        positionId: 'pos-1',
        source: 'website',
        currentStage: 'screening',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        candidateId: 'cand-1',
        positionId: 'pos-1',
        source: 'website',
        currentStage: 'screening',
      });
    });
  });

  describe('findByCandidate', () => {
    it('returns application records for a candidate', async () => {
      const appRow = {
        id: 'app-1',
        candidateId: 'cand-1',
        positionId: 'pos-1',
        source: 'email',
        currentStage: 'received',
        appliedAt: new Date('2026-03-10'),
      };
      db = createMockDb({ selectResult: [appRow] });
      const store = createDrizzleApplicationStore(db);

      const result = await store.findByCandidate('cand-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(appRow);
    });

    it('returns empty array when no applications found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleApplicationStore(db);

      const result = await store.findByCandidate('no-apps');

      expect(result).toEqual([]);
    });
  });

  describe('updateStage', () => {
    it('updates the application stage', async () => {
      const store = createDrizzleApplicationStore(db);

      await store.updateStage('app-1', 'interview_scheduled');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.currentStage).toBe('interview_scheduled');
      expect(setCall.updatedAt).toBeInstanceOf(Date);
    });
  });
});

// ===========================================================================
// createDrizzleInterviewStore
// ===========================================================================

describe('createDrizzleInterviewStore', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('create', () => {
    it('inserts an interview and returns { id }', async () => {
      const store = createDrizzleInterviewStore(db);

      const result = await store.create({
        applicationId: 'app-1',
        dateTime: new Date('2026-03-15T10:00:00Z'),
        type: 'virtual',
      });

      expect(result).toEqual({ id: 'hr-uuid-001' });
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('passes all fields to the insert builder', async () => {
      const store = createDrizzleInterviewStore(db);
      const dateTime = new Date('2026-03-15T10:00:00Z');
      await store.create({
        applicationId: 'app-1',
        interviewerId: 'user-1',
        dateTime,
        location: 'https://meet.example.com/room-42',
        type: 'virtual',
        status: 'confirmed',
      });

      const valuesCall = db._insertBuilder.values.mock.calls[0]![0];
      expect(valuesCall).toMatchObject({
        applicationId: 'app-1',
        interviewerId: 'user-1',
        dateTime,
        location: 'https://meet.example.com/room-42',
        type: 'virtual',
        status: 'confirmed',
      });
    });
  });

  describe('findByApplication', () => {
    it('returns interview records for an application', async () => {
      const interviewRow = {
        id: 'int-1',
        applicationId: 'app-1',
        interviewerId: 'user-1',
        dateTime: new Date('2026-03-15T10:00:00Z'),
        location: 'Room A',
        type: 'in-person',
        status: 'scheduling',
      };
      db = createMockDb({ selectResult: [interviewRow] });
      const store = createDrizzleInterviewStore(db);

      const result = await store.findByApplication('app-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(interviewRow);
    });

    it('returns empty array when no interviews found', async () => {
      db = createMockDb({ selectResult: [] });
      const store = createDrizzleInterviewStore(db);

      const result = await store.findByApplication('no-interviews');

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates the interview status', async () => {
      const store = createDrizzleInterviewStore(db);

      await store.updateStatus('int-1', 'completed');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateBuilder.set.mock.calls[0]![0];
      expect(setCall.status).toBe('completed');
    });
  });
});
