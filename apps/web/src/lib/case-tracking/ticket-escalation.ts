/**
 * S17-CT-3: ticket escalation service.
 *
 * Tickets carry an opaque `escalationState` JSONB on their row; this
 * service is the only writer. Two operations are exposed:
 *
 *   - `advance(ticketId, actor)` — moves the ticket to the next tier
 *     in its priority's chain. No-ops via tagged error if already at
 *     the top.
 *   - `manualEscalate(ticketId, reason, actor)` — same advance, but
 *     records an explicit human-supplied reason on the history entry.
 *
 * Tiers are NOT HITL approval sequential-chains. The plan AC said to
 * "wrap" `packages/hitl-gateway/src/policy/sequential-chain.ts`, but
 * that primitive models approve/reject decisions — wrong shape for
 * tier-advancement (responsibility transfer between tiers, not
 * approval). Documented in the multi-review as a deliberate scope
 * adjustment.
 *
 * Per-priority chain defaults live here as a const map. Future
 * iteration moves them to a config table; the service contract stays
 * the same.
 */

import { Result } from '@aptivo/types';
import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  TicketPriority,
  TicketStatus,
} from '@aptivo/database/adapters';
import type { AuditEventInput } from '@aptivo/audit';
import type { TicketError } from './ticket-service.js';

// ---------------------------------------------------------------------------
// chain definition
// ---------------------------------------------------------------------------

/**
 * Default escalation tiers per priority. critical gets the longest
 * chain (most opportunities to find help); low has none — there's no
 * one above the default owner for low-priority work. Override via
 * `EscalationServiceDeps.chainsByPriority` for tests or per-tenant
 * customization.
 */
export const DEFAULT_ESCALATION_CHAINS: Readonly<Record<TicketPriority, readonly string[]>> = {
  critical: ['L1', 'L2', 'L3'] as const,
  high: ['L1', 'L2'] as const,
  medium: ['L1'] as const,
  low: [] as const,
};

// Mirrored from the route schema (apps/web/src/app/api/tickets/[id]
// /escalate/route.ts) so direct service callers hit the same cap.
const MAX_REASON_LENGTH = 500;

// ---------------------------------------------------------------------------
// stored shape (opaque to the store)
// ---------------------------------------------------------------------------

export interface EscalationHistoryEntry {
  /** The tier the ticket moved TO at this step. */
  readonly toTier: string;
  /** ISO timestamp. */
  readonly at: string;
  /** Free-form human reason; null on automatic advances. */
  readonly reason: string | null;
  /** Actor that triggered the advance (user id or 'system' / 'workflow'). */
  readonly escalatedBy: { readonly id: string; readonly type: 'user' | 'system' | 'workflow' };
}

export interface TicketEscalationState {
  readonly currentTier: string;
  readonly chain: readonly string[];
  readonly history: readonly EscalationHistoryEntry[];
}

// ---------------------------------------------------------------------------
// extension to TicketError
// ---------------------------------------------------------------------------

export type EscalationError =
  | TicketError
  | { readonly _tag: 'TicketChainExhausted'; readonly ticketId: string }
  | { readonly _tag: 'TicketAlreadyAtTopTier'; readonly ticketId: string }
  | { readonly _tag: 'TicketEscalationConfigMissing'; readonly priority: TicketPriority }
  // S17-CT-3 (post-Codex review): emitted when the optimistic-locked
  // setEscalationState write loses the race against a concurrent
  // escalation. Caller may retry by reading the latest state and
  // re-issuing the request. Distinguished from TicketNotFound so the
  // route maps it to 409 (conflict), not 404.
  | { readonly _tag: 'TicketEscalationStale'; readonly ticketId: string };

// ---------------------------------------------------------------------------
// chain-status read shape
// ---------------------------------------------------------------------------

export interface ChainStatus {
  readonly ticketId: string;
  readonly currentTier: string;
  readonly nextTier: string | null;
  readonly chain: readonly string[];
  readonly history: readonly EscalationHistoryEntry[];
  readonly isAtTopTier: boolean;
}

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface NotificationAdapter {
  /**
   * Called whenever a ticket advances to a new tier. Implementations
   * decide how to deliver (email, Slack, etc.) — the escalation
   * service does not block on the delivery and ignores its result.
   */
  notifyTierChange(input: {
    readonly ticketId: string;
    readonly toTier: string;
    readonly fromTier: string | null;
    readonly priority: TicketPriority;
    readonly reason: string | null;
  }): Promise<void>;
}

export interface TicketEscalationServiceDeps {
  readonly store: DrizzleTicketStore;
  readonly emitAudit: (input: AuditEventInput) => Promise<void>;
  /**
   * Optional override of `DEFAULT_ESCALATION_CHAINS` — useful for
   * tests + future per-tenant config. Empty arrays mean "no
   * escalation possible for this priority" → always returns
   * TicketChainExhausted.
   */
  readonly chainsByPriority?: Readonly<Record<TicketPriority, readonly string[]>>;
  /**
   * Optional. Called fire-and-forget whenever a ticket advances.
   * Adapter failures are logged via the optional logger; never
   * block the advance result.
   */
  readonly notifications?: NotificationAdapter;
  readonly logger?: { warn(event: string, ctx?: Record<string, unknown>): void };
  /** Test-only override; defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// service contract
// ---------------------------------------------------------------------------

export interface TicketEscalationService {
  advance(
    ticketId: string,
    actor?: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, EscalationError>>;
  manualEscalate(
    ticketId: string,
    reason: string,
    actor?: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, EscalationError>>;
  getChainStatus(ticketId: string): Promise<Result<ChainStatus, EscalationError>>;
}

// ---------------------------------------------------------------------------
// pure helpers (test-friendly, no IO)
// ---------------------------------------------------------------------------

/**
 * Coerce the JSONB blob from the store into a typed
 * TicketEscalationState. Returns null when the ticket has never been
 * escalated. Defensive about partially-initialized state — any field
 * out of shape is treated as a fresh state.
 *
 * S17-CT-3 (post-Codex review): history entries are now shape-checked
 * individually rather than blindly cast. A row with a corrupt history
 * collapses to null (treated as fresh state) rather than smuggling
 * garbage through to callers that index `history[i].toTier`.
 */
function isHistoryEntry(value: unknown): value is EscalationHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (typeof e['toTier'] !== 'string') return false;
  if (typeof e['at'] !== 'string') return false;
  if (e['reason'] !== null && typeof e['reason'] !== 'string') return false;
  const by = e['escalatedBy'];
  if (!by || typeof by !== 'object') return false;
  const b = by as Record<string, unknown>;
  if (typeof b['id'] !== 'string') return false;
  if (b['type'] !== 'user' && b['type'] !== 'system' && b['type'] !== 'workflow') return false;
  return true;
}

export function parseEscalationState(raw: unknown): TicketEscalationState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['currentTier'] !== 'string') return null;
  if (!Array.isArray(r['chain']) || !r['chain'].every((t) => typeof t === 'string')) return null;
  if (!Array.isArray(r['history']) || !r['history'].every(isHistoryEntry)) return null;
  return {
    currentTier: r['currentTier'] as string,
    chain: r['chain'] as readonly string[],
    history: r['history'] as readonly EscalationHistoryEntry[],
  };
}

function chainForPriority(
  priority: TicketPriority,
  override: TicketEscalationServiceDeps['chainsByPriority'],
): readonly string[] {
  return override ? (override[priority] ?? []) : DEFAULT_ESCALATION_CHAINS[priority];
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createTicketEscalationService(
  deps: TicketEscalationServiceDeps,
): TicketEscalationService {
  const now = deps.now ?? (() => new Date());

  /**
   * Resolves the current state for a ticket. Returns null `state`
   * when the ticket has never been escalated — caller decides
   * whether to initialize (advance) or synthesize a read view
   * (getChainStatus).
   *
   * S17-CT-3 (post-Codex review): no longer synthesizes
   * `currentTier=chain[0]` for never-escalated tickets. The earlier
   * design caused first-advance to jump straight from chain[0] to
   * chain[1], so single-tier chains (`medium: ['L1']`) could never
   * be escalated. The new contract:
   *   - first advance: records an entry for chain[0] (enters the
   *     tier), no jump — gives single-tier chains exactly one
   *     escalation event.
   *   - subsequent advances: chain[i] → chain[i+1].
   */
  function resolveState(
    ticket: DrizzleTicketRecord,
  ): Result<{ state: TicketEscalationState | null; chain: readonly string[] }, EscalationError> {
    const chain = chainForPriority(ticket.priority, deps.chainsByPriority);
    if (chain.length === 0) {
      return Result.err({ _tag: 'TicketEscalationConfigMissing', priority: ticket.priority });
    }
    const stored = parseEscalationState(ticket.escalationState);
    return Result.ok({ state: stored, chain });
  }

  async function performAdvance(
    ticketId: string,
    reason: string | null,
    actor: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, EscalationError>> {
    const ticket = await deps.store.findById(ticketId);
    if (!ticket) return Result.err({ _tag: 'TicketNotFound', id: ticketId });
    if (ticket.status === 'closed') {
      return Result.err({ _tag: 'TicketAlreadyClosed', id: ticketId });
    }

    const resolved = resolveState(ticket);
    if (!resolved.ok) return resolved;
    const { state, chain } = resolved.value;

    let fromTier: string | null;
    let toTier: string;

    if (state === null) {
      // First advance: enter chain[0]. No jump. Records the tier the
      // ticket is now at (the default ownership tier).
      fromTier = null;
      toTier = chain[0]!;
    } else {
      const idx = chain.indexOf(state.currentTier);
      if (idx < 0) {
        // currentTier not in the chain — config drift; treat as exhausted
        return Result.err({ _tag: 'TicketChainExhausted', ticketId });
      }
      if (idx >= chain.length - 1) {
        return Result.err({ _tag: 'TicketAlreadyAtTopTier', ticketId });
      }
      fromTier = state.currentTier;
      toTier = chain[idx + 1]!;
    }

    const historyEntry: EscalationHistoryEntry = {
      toTier,
      at: now().toISOString(),
      reason,
      escalatedBy: { id: actor.id, type: actor.type },
    };
    const newState: TicketEscalationState = {
      currentTier: toTier,
      chain,
      history: [...(state?.history ?? []), historyEntry],
    };

    // Status transitions to 'escalated' on first advance; preserves
    // 'escalated' on subsequent advances. Closed/escalated tickets are
    // already filtered out by the closed-status guard above.
    //
    // S17-CT-3 (post-Codex review): pass `expectedUpdatedAt` so the
    // store's UPDATE WHERE includes the version guard. Two concurrent
    // escalates on the same ticket would otherwise race a read-modify-
    // write and silently drop one history entry. Because we just
    // proved the ticket exists via findById, a null return from the
    // store now means a lost update (or a TOCTOU delete) — we surface
    // it as TicketEscalationStale so callers can retry.
    const updated = await deps.store.setEscalationState(ticketId, newState, {
      status: 'escalated' as TicketStatus,
      expectedUpdatedAt: ticket.updatedAt,
    });
    if (!updated) return Result.err({ _tag: 'TicketEscalationStale', ticketId });

    // Audit + notify are fire-and-forget — service result lands on the
    // caller before either completes. Audit failures log via service
    // (already wrapped); notification failures log here.
    void deps.emitAudit({
      actor,
      action: 'platform.ticket.escalated',
      resource: { type: 'ticket', id: ticketId },
      metadata: {
        fromTier,
        toTier,
        reason,
        priority: ticket.priority,
      },
    });
    if (deps.notifications) {
      deps.notifications
        .notifyTierChange({
          ticketId,
          toTier,
          fromTier,
          priority: ticket.priority,
          reason,
        })
        .catch((cause) => {
          deps.logger?.warn('ticket_escalation_notify_failed', {
            ticketId,
            toTier,
            cause: cause instanceof Error ? cause.message : String(cause),
          });
        });
    }

    return Result.ok(updated);
  }

  return {
    async advance(ticketId, actor) {
      return performAdvance(
        ticketId,
        null,
        actor ?? { id: 'system', type: 'system' as const },
      );
    },

    async manualEscalate(ticketId, reason, actor) {
      const trimmed = reason.trim();
      if (trimmed.length === 0) {
        return Result.err({
          _tag: 'TicketValidationError',
          issues: [{ path: 'reason', message: 'reason must be non-empty' }],
        });
      }
      // S17-CT-3 (post-Codex review): cap the trimmed reason at the
      // same length the route enforces (500). Mirrored here so direct
      // service callers (Inngest functions, future workflow steps)
      // get the same rejection rather than overflowing the JSONB
      // history entry on a long paste.
      if (trimmed.length > MAX_REASON_LENGTH) {
        return Result.err({
          _tag: 'TicketValidationError',
          issues: [
            {
              path: 'reason',
              message: `reason must be ≤ ${MAX_REASON_LENGTH} characters`,
            },
          ],
        });
      }
      return performAdvance(
        ticketId,
        trimmed,
        actor ?? { id: 'system', type: 'system' as const },
      );
    },

    async getChainStatus(ticketId) {
      const ticket = await deps.store.findById(ticketId);
      if (!ticket) return Result.err({ _tag: 'TicketNotFound', id: ticketId });
      const resolved = resolveState(ticket);
      if (!resolved.ok) return resolved;
      const { state, chain } = resolved.value;

      // S17-CT-3 (post-Codex review): never-escalated tickets read as
      // "sitting at chain[0], no history, next is chain[1] (or null
      // for single-tier chains)". This matches the semantics that
      // `advance()` will record on first call.
      if (state === null) {
        return Result.ok({
          ticketId,
          currentTier: chain[0]!,
          nextTier: chain.length > 1 ? chain[1]! : null,
          chain,
          history: [],
          isAtTopTier: chain.length <= 1,
        });
      }

      const idx = chain.indexOf(state.currentTier);
      // Drift: stored currentTier no longer appears in the configured
      // chain. Surface the same TicketChainExhausted as `advance()`
      // rather than fabricating a next-tier from a misaligned index.
      if (idx < 0) {
        return Result.err({ _tag: 'TicketChainExhausted', ticketId });
      }
      const isAtTopTier = idx >= chain.length - 1;
      return Result.ok({
        ticketId,
        currentTier: state.currentTier,
        nextTier: isAtTopTier ? null : chain[idx + 1]!,
        chain,
        history: state.history,
        isAtTopTier,
      });
    },
  };
}
