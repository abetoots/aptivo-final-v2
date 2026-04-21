/**
 * AUD-02: Audit write path tests
 * @task AUD-02
 *
 * Tests:
 * - hash chaining correctness (sequential events produce valid chain)
 * - PII masking (configured fields redacted/hashed, unconfigured pass through)
 * - chain head locking (store.lockChainHead called before insert)
 * - store error → Result.err PersistenceError
 * - validation (missing required fields)
 * - genesis event (no prior chain head)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuditService } from '../src/audit-service.js';
import { computeAuditHash } from '../src/hashing.js';
import { maskMetadata } from '../src/masking.js';
import type { AuditStore, MaskingConfig, AuditEventInput, ChainHead } from '../src/types.js';
import { DEFAULT_MASKING_CONFIG } from '../src/types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockStore(overrides?: Partial<AuditStore>): AuditStore {
  return {
    lockChainHead: vi.fn().mockResolvedValue({ lastSeq: 0, lastHash: '0'.repeat(64) }),
    updateChainHead: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue({ id: 'audit-001' }),
    // LLM3-04: added to AuditStore for anomaly-gate access-pattern lookups;
    // default returns a zero-count aggregate (cold-start semantics)
    aggregateAccessPattern: vi.fn().mockResolvedValue({
      actor: 'test-actor',
      resourceType: 'test-resource',
      action: 'read',
      count: 0,
      windowStart: new Date(0),
      windowEnd: new Date(0),
    }),
    ...overrides,
  };
}

const MINIMAL_EVENT: AuditEventInput = {
  actor: { id: 'user-1', type: 'user' },
  action: 'hitl.decision.approved',
  resource: { type: 'hitl-request', id: 'req-1' },
};

const TEST_MASKING: MaskingConfig = {
  redactFields: ['email', 'phone'],
  hashFields: ['externalId'],
  hashSalt: 'test-salt',
};

// ---------------------------------------------------------------------------
// computeAuditHash (pure function)
// ---------------------------------------------------------------------------

describe('computeAuditHash', () => {
  it('produces a 64-char hex string', () => {
    const hash = computeAuditHash('prev', { action: 'test' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const data = { action: 'test', seq: 1 };
    const h1 = computeAuditHash('prev', data);
    const h2 = computeAuditHash('prev', data);
    expect(h1).toBe(h2);
  });

  it('differs when previousHash changes', () => {
    const data = { action: 'test' };
    const h1 = computeAuditHash('aaa', data);
    const h2 = computeAuditHash('bbb', data);
    expect(h1).not.toBe(h2);
  });

  it('differs when event data changes', () => {
    const h1 = computeAuditHash('prev', { action: 'create' });
    const h2 = computeAuditHash('prev', { action: 'delete' });
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// maskMetadata
// ---------------------------------------------------------------------------

describe('maskMetadata', () => {
  it('returns null for null/undefined input', () => {
    expect(maskMetadata(null, TEST_MASKING)).toBeNull();
    expect(maskMetadata(undefined, TEST_MASKING)).toBeNull();
  });

  it('redacts configured fields', () => {
    const result = maskMetadata(
      { email: 'alice@example.com', name: 'Alice' },
      TEST_MASKING,
    );
    expect(result).toEqual({ email: '[REDACTED]', name: 'Alice' });
  });

  it('redacts fields case-insensitively', () => {
    const result = maskMetadata(
      { Email: 'test@test.com', Phone: '555-0100' },
      TEST_MASKING,
    );
    expect(result).toEqual({ Email: '[REDACTED]', Phone: '[REDACTED]' });
  });

  it('hashes configured fields with salt', () => {
    const result = maskMetadata({ externalId: 'ext-123' }, TEST_MASKING);
    expect(result!.externalId).toMatch(/^[a-f0-9]{64}$/);
    expect(result!.externalId).not.toBe('ext-123');
  });

  it('recurses into nested objects', () => {
    const result = maskMetadata(
      { contact: { email: 'test@test.com', name: 'Bob' } },
      TEST_MASKING,
    );
    expect(result).toEqual({
      contact: { email: '[REDACTED]', name: 'Bob' },
    });
  });

  it('passes non-configured fields through unchanged', () => {
    const result = maskMetadata(
      { action: 'approve', amount: 100 },
      TEST_MASKING,
    );
    expect(result).toEqual({ action: 'approve', amount: 100 });
  });
});

// ---------------------------------------------------------------------------
// createAuditService — emit()
// ---------------------------------------------------------------------------

describe('createAuditService', () => {
  let store: AuditStore;

  beforeEach(() => {
    store = createMockStore();
  });

  it('returns Result.ok with audit record on success', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    const result = await service.emit(MINIMAL_EVENT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('audit-001');
    expect(result.value.currentHash).toHaveLength(64);
    expect(result.value.sequence).toBe(1);
    expect(result.value.previousHash).toBe('0'.repeat(64));
  });

  it('locks chain head before inserting', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    await service.emit(MINIMAL_EVENT);

    const lockCall = vi.mocked(store.lockChainHead).mock.invocationCallOrder[0];
    const insertCall = vi.mocked(store.insert).mock.invocationCallOrder[0];
    expect(lockCall).toBeDefined();
    expect(insertCall).toBeDefined();
    expect(lockCall!).toBeLessThan(insertCall!);
  });

  it('updates chain head after inserting', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    const result = await service.emit(MINIMAL_EVENT);

    expect(store.updateChainHead).toHaveBeenCalledWith(
      'global',
      1,
      (result as { ok: true; value: { currentHash: string } }).value.currentHash,
    );
  });

  it('builds correct hash chain across sequential events', async () => {
    let currentHead: ChainHead = { lastSeq: 0, lastHash: '0'.repeat(64) };
    const chainStore = createMockStore({
      lockChainHead: vi.fn().mockImplementation(async () => ({ ...currentHead })),
      updateChainHead: vi.fn().mockImplementation(async (_scope: string, seq: number, hash: string) => {
        currentHead = { lastSeq: seq, lastHash: hash };
      }),
    });

    const service = createAuditService({ store: chainStore, masking: TEST_MASKING });

    const r1 = await service.emit({ ...MINIMAL_EVENT, action: 'create' });
    const r2 = await service.emit({ ...MINIMAL_EVENT, action: 'update' });

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    // second event's previousHash should be first event's currentHash
    expect(r2.value.previousHash).toBe(r1.value.currentHash);
    expect(r2.value.sequence).toBe(2);
  });

  it('masks PII fields in metadata before insert', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    await service.emit({
      ...MINIMAL_EVENT,
      metadata: { email: 'secret@test.com', note: 'public' },
    });

    const insertCall = vi.mocked(store.insert).mock.calls[0]![0];
    expect(insertCall.metadata).toEqual({ email: '[REDACTED]', note: 'public' });
  });

  it('handles genesis event (no prior chain head)', async () => {
    const genesisStore = createMockStore({
      lockChainHead: vi.fn().mockResolvedValue(null),
    });
    const service = createAuditService({ store: genesisStore, masking: TEST_MASKING });
    const result = await service.emit(MINIMAL_EVENT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previousHash).toBeNull();
    expect(result.value.sequence).toBe(1);
  });

  it('sets userId from actor when type is user', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    await service.emit(MINIMAL_EVENT);

    const insertCall = vi.mocked(store.insert).mock.calls[0]![0];
    expect(insertCall.userId).toBe('user-1');
  });

  it('sets userId to null when actor type is system', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    await service.emit({
      ...MINIMAL_EVENT,
      actor: { id: 'sys-cleanup', type: 'system' },
    });

    const insertCall = vi.mocked(store.insert).mock.calls[0]![0];
    expect(insertCall.userId).toBeNull();
  });

  it('uses custom chainScope when provided', async () => {
    const service = createAuditService({
      store,
      masking: TEST_MASKING,
      chainScope: 'domain:hr',
    });
    await service.emit(MINIMAL_EVENT);

    expect(store.lockChainHead).toHaveBeenCalledWith('domain:hr');
    expect(store.updateChainHead).toHaveBeenCalledWith(
      'domain:hr',
      expect.any(Number),
      expect.any(String),
    );
  });

  // error paths

  it('returns ValidationError for missing actor.id', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    const result = await service.emit({
      actor: { id: '', type: 'user' },
      action: 'test',
      resource: { type: 'test', id: 'x' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for missing action', async () => {
    const service = createAuditService({ store, masking: TEST_MASKING });
    const result = await service.emit({
      actor: { id: 'u1', type: 'user' },
      action: '',
      resource: { type: 'test', id: 'x' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns PersistenceError when store.insert throws', async () => {
    const failStore = createMockStore({
      insert: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });
    const service = createAuditService({ store: failStore, masking: TEST_MASKING });
    const result = await service.emit(MINIMAL_EVENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PersistenceError');
    expect(result.error.operation).toBe('emit');
  });

  it('returns PersistenceError when store.lockChainHead throws', async () => {
    const failStore = createMockStore({
      lockChainHead: vi.fn().mockRejectedValue(new Error('lock timeout')),
    });
    const service = createAuditService({ store: failStore, masking: TEST_MASKING });
    const result = await service.emit(MINIMAL_EVENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PersistenceError');
  });

  it('logs warning on failure when logger is provided', async () => {
    const logger = { warn: vi.fn() };
    const failStore = createMockStore({
      insert: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const service = createAuditService({ store: failStore, masking: TEST_MASKING, logger });
    await service.emit(MINIMAL_EVENT);

    expect(logger.warn).toHaveBeenCalledWith(
      'audit emit failed',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
