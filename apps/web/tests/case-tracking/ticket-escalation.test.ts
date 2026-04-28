/**
 * S17-CT-3: TicketEscalationService unit tests
 * @task S17-CT-3
 *
 * Verifies advance / manualEscalate / getChainStatus paths, the
 * tagged-error contract, audit emission, and the optional
 * notification-adapter call. Stub store + audit; clock pinned via
 * the now() injection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTicketEscalationService,
  parseEscalationState,
  DEFAULT_ESCALATION_CHAINS,
  type TicketEscalationState,
} from '../../src/lib/case-tracking/ticket-escalation';
import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  TicketPriority,
} from '@aptivo/database/adapters';
import type { AuditEventInput } from '@aptivo/audit';

const FIXED_NOW = new Date('2026-04-27T10:00:00Z');

function makeTicket(overrides: Partial<DrizzleTicketRecord> = {}): DrizzleTicketRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workflowDefinitionId: null,
    status: 'open',
    priority: 'high', // chain L1 → L2
    title: 't',
    body: 'b',
    ownerUserId: '22222222-2222-4222-8222-222222222222',
    departmentId: null,
    createdAt: new Date('2026-04-27T08:00:00Z'),
    updatedAt: new Date('2026-04-27T08:00:00Z'),
    closedAt: null,
    escalationState: null,
    ...overrides,
  };
}

function makeStore(initial?: DrizzleTicketRecord): DrizzleTicketStore & {
  setEscalationStateSpy: ReturnType<typeof vi.fn>;
} {
  let current = initial ?? null;
  const setEscalationStateSpy = vi.fn(
    async (
      _id: string,
      state: unknown,
      opts?: { status?: string; expectedUpdatedAt?: Date },
    ) => {
      if (!current) return null;
      // Mirror the Drizzle adapter's optimistic-lock behaviour: a
      // mismatched expectedUpdatedAt makes the WHERE miss → null row.
      if (opts?.expectedUpdatedAt && opts.expectedUpdatedAt.getTime() !== current.updatedAt.getTime()) {
        return null;
      }
      current = {
        ...current,
        escalationState: state,
        // simulate the trigger that bumps updated_at on every UPDATE
        updatedAt: new Date(current.updatedAt.getTime() + 1),
        ...(opts?.status ? { status: opts.status as DrizzleTicketRecord['status'] } : {}),
      };
      return current;
    },
  );
  return {
    create: vi.fn(),
    findById: vi.fn(async () => current),
    list: vi.fn(),
    update: vi.fn(),
    softClose: vi.fn(),
    setEscalationState: setEscalationStateSpy,
    setEscalationStateSpy,
  };
}

type EmitAuditFn = (input: AuditEventInput) => Promise<void>;

describe('S17-CT-3: parseEscalationState', () => {
  it('returns null for malformed payloads', () => {
    expect(parseEscalationState(null)).toBeNull();
    expect(parseEscalationState({})).toBeNull();
    expect(parseEscalationState({ currentTier: 'L1' })).toBeNull();
    expect(parseEscalationState({ currentTier: 'L1', chain: 'not-an-array', history: [] })).toBeNull();
  });

  it('coerces a well-formed payload to TicketEscalationState', () => {
    const out = parseEscalationState({
      currentTier: 'L2',
      chain: ['L1', 'L2'],
      history: [{ toTier: 'L2', at: '2026-04-27T09:00:00Z', reason: null, escalatedBy: { id: 'system', type: 'system' } }],
    });
    expect(out?.currentTier).toBe('L2');
    expect(out?.chain).toEqual(['L1', 'L2']);
    expect(out?.history).toHaveLength(1);
  });
});

describe('S17-CT-3: createTicketEscalationService', () => {
  let emitSpy: ReturnType<typeof vi.fn> & EmitAuditFn;
  beforeEach(() => {
    emitSpy = vi.fn(async () => {}) as ReturnType<typeof vi.fn> & EmitAuditFn;
  });

  it('advance() returns TicketNotFound when the ticket is missing', async () => {
    const store = makeStore();
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.advance('99999999-9999-4999-8999-999999999999');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketNotFound');
  });

  it('advance() returns TicketAlreadyClosed for closed tickets', async () => {
    const store = makeStore(makeTicket({ status: 'closed', closedAt: new Date() }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketAlreadyClosed');
  });

  it('advance() returns TicketEscalationConfigMissing when the priority has no chain', async () => {
    const store = makeStore(makeTicket({ priority: 'low' as TicketPriority }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketEscalationConfigMissing');
  });

  it('advance() first call enters chain[0] (no jump) — single-tier chains can escalate exactly once', async () => {
    // medium chain is just ['L1']. Pre-fix this could never escalate
    // because state was synthesized at chain[0] then jumped to chain[1].
    const store = makeStore(makeTicket({ priority: 'medium' }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.advance('11111111-1111-4111-8111-111111111111', { id: 'user-1', type: 'user' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const state = r.value.escalationState as TicketEscalationState;
    expect(state.currentTier).toBe('L1');
    expect(state.chain).toEqual(['L1']);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.toTier).toBe('L1');
    expect(r.value.status).toBe('escalated');
    // a second advance has nowhere to go
    const r2 = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error._tag).toBe('TicketAlreadyAtTopTier');
  });

  it('advance() multi-tier chain — first call enters L1, second moves L1 → L2', async () => {
    const store = makeStore(makeTicket({ priority: 'high' }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });

    const r1 = await service.advance('11111111-1111-4111-8111-111111111111', { id: 'user-1', type: 'user' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const s1 = r1.value.escalationState as TicketEscalationState;
    expect(s1.currentTier).toBe('L1');
    expect(s1.history).toHaveLength(1);
    expect(s1.history[0]!.toTier).toBe('L1');

    const r2 = await service.advance('11111111-1111-4111-8111-111111111111', { id: 'user-1', type: 'user' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const s2 = r2.value.escalationState as TicketEscalationState;
    expect(s2.currentTier).toBe('L2');
    expect(s2.history).toHaveLength(2);
    expect(s2.history[1]!.toTier).toBe('L2');
    expect(r2.value.status).toBe('escalated');
    // audit fire-and-forget — second advance should record the L1 → L2 transition
    await Promise.resolve();
    expect(emitSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'platform.ticket.escalated',
        actor: { id: 'user-1', type: 'user' },
        metadata: expect.objectContaining({ fromTier: 'L1', toTier: 'L2', priority: 'high' }),
      }),
    );
  });

  it('advance() returns TicketAlreadyAtTopTier at the top of the chain', async () => {
    // priority high → chain L1, L2 ; ticket already at L2
    const store = makeStore(makeTicket({
      priority: 'high',
      escalationState: {
        currentTier: 'L2',
        chain: ['L1', 'L2'],
        history: [{ toTier: 'L2', at: '2026-04-27T09:00:00Z', reason: null, escalatedBy: { id: 'system', type: 'system' } }],
      },
    }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketAlreadyAtTopTier');
  });

  it('advance() returns TicketChainExhausted when currentTier is no longer in the chain (config drift)', async () => {
    // ticket has currentTier=L99 which isn't in any chain
    const store = makeStore(makeTicket({
      priority: 'high',
      escalationState: { currentTier: 'L99', chain: ['L99'], history: [] },
    }));
    const service = createTicketEscalationService({
      store,
      emitAudit: emitSpy,
      now: () => FIXED_NOW,
      // override chain so the stored currentTier no longer appears
      chainsByPriority: {
        critical: ['L1', 'L2', 'L3'],
        high: ['L1', 'L2'],
        medium: ['L1'],
        low: [],
      },
    });
    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketChainExhausted');
  });

  it('manualEscalate() rejects empty/whitespace reasons with TicketValidationError', async () => {
    const store = makeStore(makeTicket());
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.manualEscalate('11111111-1111-4111-8111-111111111111', '   ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketValidationError');
  });

  it('manualEscalate() persists the trimmed reason on the history entry', async () => {
    const store = makeStore(makeTicket());
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.manualEscalate(
      '11111111-1111-4111-8111-111111111111',
      '  customer reported P0  ',
      { id: 'user-7', type: 'user' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const state = r.value.escalationState as TicketEscalationState;
    expect(state.history[0]!.reason).toBe('customer reported P0');
  });

  it('notifies the adapter on advance, fire-and-forget (failure does NOT block the result)', async () => {
    const store = makeStore(makeTicket());
    const notifications = {
      notifyTierChange: vi.fn().mockRejectedValue(new Error('slack down')),
    };
    const logger = { warn: vi.fn() };
    const service = createTicketEscalationService({
      store,
      emitAudit: emitSpy,
      notifications,
      logger,
      now: () => FIXED_NOW,
    });

    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(true);
    // First advance enters chain[0], so fromTier is null and toTier is L1.
    expect(notifications.notifyTierChange).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: '11111111-1111-4111-8111-111111111111', toTier: 'L1', fromTier: null, priority: 'high' }),
    );
    // wait for the fire-and-forget to settle, then assert the warn fired
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logger.warn).toHaveBeenCalledWith(
      'ticket_escalation_notify_failed',
      expect.objectContaining({ ticketId: expect.any(String), cause: expect.stringContaining('slack down') }),
    );
  });

  it('getChainStatus() returns chain + history + nextTier + isAtTopTier', async () => {
    const store = makeStore(makeTicket({
      priority: 'critical', // chain L1, L2, L3
      escalationState: {
        currentTier: 'L2',
        chain: ['L1', 'L2', 'L3'],
        history: [{ toTier: 'L2', at: '2026-04-27T09:00:00Z', reason: 'page', escalatedBy: { id: 'system', type: 'system' } }],
      },
    }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.getChainStatus('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.currentTier).toBe('L2');
    expect(r.value.nextTier).toBe('L3');
    expect(r.value.chain).toEqual(['L1', 'L2', 'L3']);
    expect(r.value.history).toHaveLength(1);
    expect(r.value.isAtTopTier).toBe(false);
  });

  it('getChainStatus() reports isAtTopTier=true and nextTier=null at the top', async () => {
    const store = makeStore(makeTicket({
      priority: 'high',
      escalationState: { currentTier: 'L2', chain: ['L1', 'L2'], history: [] },
    }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.getChainStatus('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isAtTopTier).toBe(true);
    expect(r.value.nextTier).toBeNull();
  });

  it('DEFAULT_ESCALATION_CHAINS shape sanity check', () => {
    expect(DEFAULT_ESCALATION_CHAINS.critical).toEqual(['L1', 'L2', 'L3']);
    expect(DEFAULT_ESCALATION_CHAINS.high).toEqual(['L1', 'L2']);
    expect(DEFAULT_ESCALATION_CHAINS.medium).toEqual(['L1']);
    expect(DEFAULT_ESCALATION_CHAINS.low).toEqual([]);
  });

  // ---------------------------------------------------------------
  // S17-CT-3 (post-Codex review) regression coverage
  // ---------------------------------------------------------------

  it('getChainStatus() on a never-escalated ticket reports chain[0] / chain[1] without inventing history', async () => {
    const store = makeStore(makeTicket({ priority: 'critical', escalationState: null }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.getChainStatus('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.currentTier).toBe('L1');
    expect(r.value.nextTier).toBe('L2');
    expect(r.value.history).toEqual([]);
    expect(r.value.isAtTopTier).toBe(false);
  });

  it('getChainStatus() on never-escalated single-tier chain reports isAtTopTier=true and nextTier=null', async () => {
    const store = makeStore(makeTicket({ priority: 'medium', escalationState: null }));
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.getChainStatus('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.currentTier).toBe('L1');
    expect(r.value.nextTier).toBeNull();
    expect(r.value.isAtTopTier).toBe(true);
  });

  it('getChainStatus() returns TicketChainExhausted on stored-tier drift (matches advance behaviour)', async () => {
    const store = makeStore(makeTicket({
      priority: 'high',
      escalationState: { currentTier: 'L99', chain: ['L99'], history: [] },
    }));
    const service = createTicketEscalationService({
      store,
      emitAudit: emitSpy,
      now: () => FIXED_NOW,
      // override puts the configured chain out of sync with the stored tier
      chainsByPriority: {
        critical: ['L1', 'L2', 'L3'],
        high: ['L1', 'L2'],
        medium: ['L1'],
        low: [],
      },
    });
    const r = await service.getChainStatus('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketChainExhausted');
  });

  it('advance() returns TicketEscalationStale when the optimistic-lock condition fails (concurrent writer)', async () => {
    // Simulate a second writer landing between findById and the
    // setEscalationState UPDATE. We bump updatedAt on the underlying
    // record after findById is captured so the WHERE updated_at = ?
    // misses on our turn.
    const ticket = makeTicket({ priority: 'high' });
    let current: DrizzleTicketRecord | null = ticket;
    const setEscalationStateSpy = vi.fn(
      async (
        _id: string,
        state: unknown,
        opts?: { status?: string; expectedUpdatedAt?: Date },
      ) => {
        if (!current) return null;
        if (opts?.expectedUpdatedAt && opts.expectedUpdatedAt.getTime() !== current.updatedAt.getTime()) {
          return null; // optimistic-lock miss
        }
        current = {
          ...current,
          escalationState: state,
          updatedAt: new Date(current.updatedAt.getTime() + 1),
          ...(opts?.status ? { status: opts.status as DrizzleTicketRecord['status'] } : {}),
        };
        return current;
      },
    );
    const store: DrizzleTicketStore = {
      create: vi.fn(),
      findById: vi.fn(async () => current),
      list: vi.fn(),
      update: vi.fn(),
      softClose: vi.fn(),
      setEscalationState: setEscalationStateSpy as unknown as DrizzleTicketStore['setEscalationState'],
    };
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });

    // Concurrent writer wins between findById and setEscalationState.
    // We monkey-patch findById to bump updatedAt right after it returns,
    // simulating another transaction writing in between.
    (store.findById as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      const snapshot = current;
      // racing writer lands now
      if (current) current = { ...current, updatedAt: new Date(current.updatedAt.getTime() + 5) };
      return snapshot;
    });

    const r = await service.advance('11111111-1111-4111-8111-111111111111');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketEscalationStale');
  });

  it('manualEscalate() rejects reasons longer than the 500-char service cap', async () => {
    const store = makeStore(makeTicket());
    const service = createTicketEscalationService({ store, emitAudit: emitSpy, now: () => FIXED_NOW });
    const r = await service.manualEscalate(
      '11111111-1111-4111-8111-111111111111',
      'x'.repeat(501),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error._tag).toBe('TicketValidationError');
  });

  it('parseEscalationState rejects payloads with malformed history entries', () => {
    const out = parseEscalationState({
      currentTier: 'L1',
      chain: ['L1', 'L2'],
      history: [{ toTier: 'L1' /* missing at, reason, escalatedBy */ }],
    });
    expect(out).toBeNull();
  });
});
