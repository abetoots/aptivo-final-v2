/**
 * S17-CT-1: TicketService unit tests
 * @task S17-CT-1
 *
 * Verifies validation, tagged-error contract, audit-emit semantics,
 * graph-validation gate, and the closed-ticket guard. Store + audit
 * are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTicketService } from '../../src/lib/case-tracking/ticket-service';
import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  CreateTicketInput,
} from '@aptivo/database/adapters';
import type { AuditEventInput } from '@aptivo/audit';

type EmitAuditFn = (input: AuditEventInput) => Promise<void>;

function makeRecord(overrides: Partial<DrizzleTicketRecord> = {}): DrizzleTicketRecord {
  return {
    id: 'tkt-1',
    workflowDefinitionId: null,
    status: 'open',
    priority: 'medium',
    title: 'sample',
    body: 'body',
    ownerUserId: '11111111-1111-4111-8111-111111111111',
    departmentId: null,
    createdAt: new Date('2026-04-26T10:00:00Z'),
    updatedAt: new Date('2026-04-26T10:00:00Z'),
    closedAt: null,
    ...overrides,
  };
}

function makeStore(initial?: DrizzleTicketRecord): DrizzleTicketStore & {
  createSpy: ReturnType<typeof vi.fn>;
  updateSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
} {
  let current = initial ?? null;
  const createSpy = vi.fn(async (input: CreateTicketInput) => {
    const rec = makeRecord({
      ownerUserId: input.ownerUserId,
      title: input.title,
      body: input.body,
      priority: input.priority ?? 'medium',
      workflowDefinitionId: input.workflowDefinitionId ?? null,
    });
    current = rec;
    return rec;
  });
  const updateSpy = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    if (!current) return null;
    current = { ...current, ...patch } as DrizzleTicketRecord;
    return current;
  });
  const closeSpy = vi.fn(async (_id: string) => {
    if (!current) return null;
    current = { ...current, status: 'closed', closedAt: new Date() };
    return current;
  });
  return {
    create: createSpy,
    findById: vi.fn(async () => current),
    list: vi.fn(async () => ({ rows: current ? [current] : [], totalCount: current ? 1 : 0 })),
    update: updateSpy,
    softClose: closeSpy,
    createSpy,
    updateSpy,
    closeSpy,
  };
}

describe('S17-CT-1: createTicketService', () => {
  let emitSpy: ReturnType<typeof vi.fn> & EmitAuditFn;
  beforeEach(() => {
    emitSpy = vi.fn(async () => {}) as ReturnType<typeof vi.fn> & EmitAuditFn;
  });

  it('create() rejects invalid input with TicketValidationError', async () => {
    const service = createTicketService({ store: makeStore(), emitAudit: emitSpy });
    const result = await service.create({ title: '', body: '', ownerUserId: 'not-a-uuid' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TicketValidationError');
  });

  it('create() persists and emits platform.ticket.created with the actor', async () => {
    const store = makeStore();
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.create(
      {
        title: 'My ticket',
        body: 'Body',
        ownerUserId: '11111111-1111-4111-8111-111111111111',
        priority: 'high',
      },
      { id: 'user-7', type: 'user' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(store.createSpy).toHaveBeenCalledOnce();
    // audit emission is fire-and-forget via void; flush microtasks
    await Promise.resolve();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.ticket.created',
        actor: { id: 'user-7', type: 'user' },
        resource: { type: 'ticket', id: result.value.id },
      }),
    );
  });

  it('create() returns WorkflowDefinitionNotFound when verifier reports missing', async () => {
    const verify = vi.fn(async () => ({ status: 'not_found' as const }));
    const service = createTicketService({
      store: makeStore(),
      emitAudit: emitSpy,
      verifyWorkflowDefinition: verify,
    });
    const result = await service.create({
      title: 'X',
      body: 'Y',
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      workflowDefinitionId: '22222222-2222-4222-8222-222222222222',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('WorkflowDefinitionNotFound');
    expect(verify).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('create() returns WorkflowDefinitionInvalid when verifier reports invalid graph', async () => {
    const service = createTicketService({
      store: makeStore(),
      emitAudit: emitSpy,
      verifyWorkflowDefinition: async () => ({ status: 'invalid', reason: 'cycle: A->B->A' }),
    });
    const result = await service.create({
      title: 'X',
      body: 'Y',
      ownerUserId: '11111111-1111-4111-8111-111111111111',
      workflowDefinitionId: '22222222-2222-4222-8222-222222222222',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('WorkflowDefinitionInvalid');
    if (result.error._tag !== 'WorkflowDefinitionInvalid') return;
    expect(result.error.reason).toBe('cycle: A->B->A');
  });

  it('findById() returns TicketNotFound for missing ids', async () => {
    const service = createTicketService({ store: makeStore(), emitAudit: emitSpy });
    const result = await service.findById('nope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TicketNotFound');
  });

  it('update() rejects PATCH on a closed ticket with TicketAlreadyClosed', async () => {
    const store = makeStore(makeRecord({ status: 'closed', closedAt: new Date() }));
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.update('tkt-1', { priority: 'high' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TicketAlreadyClosed');
    expect(store.updateSpy).not.toHaveBeenCalled();
  });

  it('update() persists patch and emits platform.ticket.updated', async () => {
    const store = makeStore(makeRecord());
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.update(
      'tkt-1',
      { priority: 'critical' },
      { id: 'user-9', type: 'user' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.priority).toBe('critical');
    await Promise.resolve();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.ticket.updated',
        actor: { id: 'user-9', type: 'user' },
      }),
    );
  });

  it('softClose() rejects already-closed ticket with TicketAlreadyClosed', async () => {
    const store = makeStore(makeRecord({ status: 'closed', closedAt: new Date() }));
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.softClose('tkt-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('TicketAlreadyClosed');
    expect(store.closeSpy).not.toHaveBeenCalled();
  });

  it('softClose() persists status=closed and emits platform.ticket.closed', async () => {
    const store = makeStore(makeRecord());
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.softClose('tkt-1', { id: 'user-12', type: 'user' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('closed');
    expect(result.value.closedAt).toBeInstanceOf(Date);
    await Promise.resolve();
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.ticket.closed',
        actor: { id: 'user-12', type: 'user' },
      }),
    );
  });

  it('list() pass-through to store', async () => {
    const store = makeStore(makeRecord());
    const service = createTicketService({ store, emitAudit: emitSpy });
    const result = await service.list({ status: 'open', limit: 10 });
    expect(result.totalCount).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
});
