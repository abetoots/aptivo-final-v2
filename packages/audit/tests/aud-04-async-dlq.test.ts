/**
 * AUD-04: Async audit writer + DLQ processor tests
 * @task AUD-04, AUD-05
 *
 * Tests:
 * - Async writer: publishes event via sender
 * - Async writer: validates against Zod schema
 * - Async writer: timeout budget enforcement
 * - Async writer: publish failure returns Result.err
 * - DLQ processor: successful audit write
 * - DLQ processor: failure persists to DLQ
 * - DLQ replay: processes pending entries
 * - DLQ replay: exhausts entries exceeding maxAttempts
 * - Event schemas: valid data passes, invalid fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { createAsyncAuditWriter } from '../src/async/async-audit-writer.js';
import { createProcessAuditEvent, createReplayDlqEvents } from '../src/async/dlq-processor.js';
import { AUDIT_EVENT_SCHEMAS, AUDIT_EVENT_NAME } from '../src/async/event-schemas.js';
import type { AuditEventSender } from '../src/async/async-audit-writer.js';
import type { AuditService, AuditEventInput } from '../src/types.js';
import type { DlqStore, InngestStepTools, DlqEntry } from '../src/async/dlq-processor.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VALID_EVENT: AuditEventInput = {
  actor: { id: 'user-1', type: 'user' },
  action: 'resource.create',
  resource: { type: 'document', id: 'doc-1' },
};

function createMockSender(overrides?: Partial<AuditEventSender>): AuditEventSender {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockAuditService(overrides?: Partial<AuditService>): AuditService {
  return {
    emit: vi.fn().mockResolvedValue(Result.ok({
      id: 'audit-001',
      previousHash: '0'.repeat(64),
      currentHash: 'a'.repeat(64),
      sequence: 1,
      timestamp: new Date(),
    })),
    ...overrides,
  };
}

function createMockDlqStore(overrides?: Partial<DlqStore>): DlqStore {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getPending: vi.fn().mockResolvedValue([]),
    markRetrying: vi.fn().mockResolvedValue(undefined),
    markExhausted: vi.fn().mockResolvedValue(undefined),
    markReplayed: vi.fn().mockResolvedValue(undefined),
    incrementAttempt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockStep(): InngestStepTools {
  return {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
  };
}

// ---------------------------------------------------------------------------
// event schemas
// ---------------------------------------------------------------------------

describe('AUDIT_EVENT_SCHEMAS', () => {
  const schema = AUDIT_EVENT_SCHEMAS[AUDIT_EVENT_NAME];

  it('validates correct event data', () => {
    const result = schema.safeParse({
      actor: { id: 'u1', type: 'user' },
      action: 'test.action',
      resource: { type: 'doc', id: 'd1' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing actor.id', () => {
    const result = schema.safeParse({
      actor: { id: '', type: 'user' },
      action: 'test',
      resource: { type: 'doc', id: 'd1' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid actor type', () => {
    const result = schema.safeParse({
      actor: { id: 'u1', type: 'invalid' },
      action: 'test',
      resource: { type: 'doc', id: 'd1' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional metadata', () => {
    const result = schema.safeParse({
      actor: { id: 'u1', type: 'system' },
      action: 'cleanup',
      resource: { type: 'cache', id: 'c1' },
      metadata: { reason: 'expired' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts workflow actor type', () => {
    const result = schema.safeParse({
      actor: { id: 'wf-1', type: 'workflow' },
      action: 'step.complete',
      resource: { type: 'task', id: 't1' },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createAsyncAuditWriter
// ---------------------------------------------------------------------------

describe('createAsyncAuditWriter', () => {
  let sender: AuditEventSender;

  beforeEach(() => {
    sender = createMockSender();
  });

  it('publishes valid event via sender', async () => {
    const writer = createAsyncAuditWriter(sender);
    const result = await writer.emit(VALID_EVENT);

    expect(result.ok).toBe(true);
    expect(sender.send).toHaveBeenCalledWith({
      name: AUDIT_EVENT_NAME,
      data: expect.objectContaining({
        actor: VALID_EVENT.actor,
        action: VALID_EVENT.action,
      }),
    });
  });

  it('rejects invalid event data', async () => {
    const writer = createAsyncAuditWriter(sender);
    const result = await writer.emit({
      actor: { id: '', type: 'user' },
      action: 'test',
      resource: { type: 'doc', id: 'd1' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationFailed');
  });

  it('does not call sender for invalid events', async () => {
    const writer = createAsyncAuditWriter(sender);
    await writer.emit({
      actor: { id: '', type: 'user' },
      action: '',
      resource: { type: '', id: '' },
    });

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('returns PublishTimeout when sender is slow', async () => {
    const slowSender = createMockSender({
      send: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500))),
    });
    const writer = createAsyncAuditWriter(slowSender, { timeoutMs: 50 });
    const result = await writer.emit(VALID_EVENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PublishTimeout');
  });

  it('returns PublishFailed when sender throws', async () => {
    const failSender = createMockSender({
      send: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const writer = createAsyncAuditWriter(failSender);
    const result = await writer.emit(VALID_EVENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PublishFailed');
  });

  it('logs validation failures', async () => {
    const logger = { warn: vi.fn() };
    const writer = createAsyncAuditWriter(sender, { logger });
    await writer.emit({
      actor: { id: '', type: 'user' },
      action: 'test',
      resource: { type: 'doc', id: 'd1' },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'audit event validation failed',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });
});

// ---------------------------------------------------------------------------
// createProcessAuditEvent
// ---------------------------------------------------------------------------

describe('createProcessAuditEvent', () => {
  it('writes audit event via durable step', async () => {
    const auditService = createMockAuditService();
    const dlqStore = createMockDlqStore();
    const step = createMockStep();
    const handler = createProcessAuditEvent(auditService, dlqStore);

    const result = await handler({ data: VALID_EVENT }, step);

    expect(step.run).toHaveBeenCalledWith('write-audit', expect.any(Function));
    expect(result).toHaveProperty('ok', true);
  });

  it('persists to DLQ on audit failure', async () => {
    const auditService = createMockAuditService({
      emit: vi.fn().mockResolvedValue(Result.err({
        _tag: 'PersistenceError',
        operation: 'emit',
        cause: new Error('db error'),
      })),
    });
    const dlqStore = createMockDlqStore();
    const step = createMockStep();
    const handler = createProcessAuditEvent(auditService, dlqStore);

    const result = await handler({ data: VALID_EVENT }, step);

    expect(result).toEqual({ dlq: true });
    expect(step.run).toHaveBeenCalledWith('persist-dlq', expect.any(Function));
    expect(dlqStore.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: VALID_EVENT,
        status: 'pending',
        attemptCount: 1,
        nextRetryAt: expect.any(Date),
      }),
    );
  });

  it('uses configurable maxAttempts', async () => {
    const auditService = createMockAuditService({
      emit: vi.fn().mockResolvedValue(Result.err({
        _tag: 'PersistenceError',
        operation: 'emit',
        cause: new Error('fail'),
      })),
    });
    const dlqStore = createMockDlqStore();
    const step = createMockStep();
    const handler = createProcessAuditEvent(auditService, dlqStore, { maxAttempts: 5 });

    await handler({ data: VALID_EVENT }, step);

    expect(dlqStore.insert).toHaveBeenCalledWith(
      expect.objectContaining({ maxAttempts: 5 }),
    );
  });
});

// ---------------------------------------------------------------------------
// createReplayDlqEvents
// ---------------------------------------------------------------------------

describe('createReplayDlqEvents', () => {
  it('processes pending DLQ entries', async () => {
    const auditService = createMockAuditService();
    const entry: DlqEntry = {
      id: 'dlq-1',
      payload: VALID_EVENT,
      error: 'PersistenceError: db fail',
      attemptCount: 1,
      maxAttempts: 3,
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([entry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const result = await handler(step);

    expect(result.processed).toBe(1);
    expect(result.exhausted).toBe(0);
    expect(dlqStore.markRetrying).toHaveBeenCalledWith('dlq-1');
    expect(dlqStore.markReplayed).toHaveBeenCalledWith('dlq-1');
  });

  it('marks exhausted entries when maxAttempts reached', async () => {
    const auditService = createMockAuditService();
    const entry: DlqEntry = {
      id: 'dlq-2',
      payload: VALID_EVENT,
      error: 'fail',
      attemptCount: 3,
      maxAttempts: 3,
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([entry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const result = await handler(step);

    expect(result.exhausted).toBe(1);
    expect(result.processed).toBe(0);
    expect(dlqStore.markExhausted).toHaveBeenCalledWith('dlq-2');
  });

  it('increments attempt count on replay failure', async () => {
    const auditService = createMockAuditService({
      emit: vi.fn().mockResolvedValue(Result.err({
        _tag: 'PersistenceError',
        operation: 'emit',
        cause: new Error('still failing'),
      })),
    });
    const entry: DlqEntry = {
      id: 'dlq-3',
      payload: VALID_EVENT,
      error: 'fail',
      attemptCount: 1,
      maxAttempts: 3,
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([entry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    await handler(step);

    expect(dlqStore.incrementAttempt).toHaveBeenCalledWith('dlq-3', expect.any(Date));
    expect(dlqStore.markReplayed).not.toHaveBeenCalled();
  });

  it('returns zero counts for empty DLQ', async () => {
    const auditService = createMockAuditService();
    const dlqStore = createMockDlqStore();
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const result = await handler(step);

    expect(result).toEqual({ processed: 0, exhausted: 0 });
  });

  it('skips entries with nextRetryAt in the future', async () => {
    const auditService = createMockAuditService();
    const futureEntry: DlqEntry = {
      id: 'dlq-future',
      payload: VALID_EVENT,
      error: 'fail',
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: new Date(Date.now() + 60_000), // 1 minute from now
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([futureEntry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const result = await handler(step);

    expect(result.processed).toBe(0);
    expect(result.exhausted).toBe(0);
    expect(dlqStore.markRetrying).not.toHaveBeenCalled();
  });

  it('processes entries with nextRetryAt in the past', async () => {
    const auditService = createMockAuditService();
    const pastEntry: DlqEntry = {
      id: 'dlq-past',
      payload: VALID_EVENT,
      error: 'fail',
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: new Date(Date.now() - 1_000), // 1 second ago
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([pastEntry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const result = await handler(step);

    expect(result.processed).toBe(1);
    expect(dlqStore.markReplayed).toHaveBeenCalledWith('dlq-past');
  });

  it('computes exponential backoff on retry failure', async () => {
    const auditService = createMockAuditService({
      emit: vi.fn().mockResolvedValue(Result.err({
        _tag: 'PersistenceError',
        operation: 'emit',
        cause: new Error('still failing'),
      })),
    });
    const entry: DlqEntry = {
      id: 'dlq-backoff',
      payload: VALID_EVENT,
      error: 'fail',
      attemptCount: 2,
      maxAttempts: 5,
      status: 'pending',
    };
    const dlqStore = createMockDlqStore({
      getPending: vi.fn().mockResolvedValue([entry]),
    });
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore);

    const before = Date.now();
    await handler(step);

    // next attempt is 3, so backoff = 1000 * 2^(3-1) = 4000ms
    const [, nextRetryAt] = vi.mocked(dlqStore.incrementAttempt).mock.calls[0]!;
    expect(nextRetryAt).toBeInstanceOf(Date);
    const delayMs = (nextRetryAt as Date).getTime() - before;
    // should be ~4000ms (allow margin for test execution)
    expect(delayMs).toBeGreaterThanOrEqual(3500);
    expect(delayMs).toBeLessThan(5000);
  });

  it('respects configurable batchSize', async () => {
    const auditService = createMockAuditService();
    const dlqStore = createMockDlqStore();
    const step = createMockStep();
    const handler = createReplayDlqEvents(auditService, dlqStore, { batchSize: 5 });

    await handler(step);

    expect(dlqStore.getPending).toHaveBeenCalledWith(5);
  });
});
