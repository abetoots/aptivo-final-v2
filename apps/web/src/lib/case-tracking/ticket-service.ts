/**
 * S17-CT-1: ticket service layer.
 *
 * Sits between the HTTP route handlers and the Drizzle store. Owns:
 *   - input validation via Zod (returns tagged error on failure)
 *   - graph validation when the caller binds a workflow definition
 *   - audit-event emission on every mutation (`platform.ticket.*`)
 *   - tagged-error contract `Result<TicketRecord, TicketError>`
 *
 * The service deliberately does NOT own RBAC — that lives in the
 * route layer's `checkPermission` middleware (consistent with the
 * existing `/api/admin/*` pattern). The service trusts that any
 * caller has been authorised upstream.
 */

import { Result } from '@aptivo/types';
import { z } from 'zod';
import type {
  DrizzleTicketStore,
  DrizzleTicketRecord,
  CreateTicketInput,
  UpdateTicketInput,
  ListTicketsParams,
  ListTicketsResult,
  TicketStatus,
  TicketPriority,
} from '@aptivo/database/adapters';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// tagged errors
// ---------------------------------------------------------------------------

export type TicketError =
  | { readonly _tag: 'TicketNotFound'; readonly id: string }
  | { readonly _tag: 'TicketValidationError'; readonly issues: readonly { readonly path: string; readonly message: string }[] }
  | { readonly _tag: 'WorkflowDefinitionNotFound'; readonly workflowDefinitionId: string }
  | { readonly _tag: 'WorkflowDefinitionInvalid'; readonly reason: string }
  | { readonly _tag: 'TicketAlreadyClosed'; readonly id: string };

// ---------------------------------------------------------------------------
// input schemas (Zod) — service owns validation; routes hand raw input
// ---------------------------------------------------------------------------

const TicketStatusSchema = z.enum(['open', 'in_progress', 'escalated', 'closed']);
const TicketPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const CreateTicketSchema = z.object({
  workflowDefinitionId: z.string().uuid().nullish(),
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  ownerUserId: z.string().uuid(),
  departmentId: z.string().uuid().nullish(),
});

export const UpdateTicketSchema = z.object({
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface TicketServiceDeps {
  readonly store: DrizzleTicketStore;
  /**
   * Optional. When the caller binds a `workflowDefinitionId`, the
   * service checks that it exists + is graph-valid before persisting.
   * Returning `null` means "not found"; the wrapped Result decides
   * the error tag. Pass undefined to skip validation entirely
   * (used by tests that don't care about workflow linkage).
   */
  readonly verifyWorkflowDefinition?: (id: string) => Promise<
    | { readonly status: 'ok' }
    | { readonly status: 'not_found' }
    | { readonly status: 'invalid'; readonly reason: string }
  >;
  /** Audit-event sink. Fire-and-forget — failures don't roll back the write. */
  readonly emitAudit: (input: AuditEventInput) => Promise<void>;
  /**
   * Source of the actor identity stamped on audit events. Defaults
   * to system actor when caller doesn't supply one (background jobs).
   */
  readonly defaultActor?: { readonly id: string; readonly type: 'user' | 'system' | 'workflow' };
}

// ---------------------------------------------------------------------------
// service
// ---------------------------------------------------------------------------

export interface TicketService {
  create(
    input: unknown,
    actor?: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, TicketError>>;
  findById(id: string): Promise<Result<DrizzleTicketRecord, TicketError>>;
  list(params?: ListTicketsParams): Promise<ListTicketsResult>;
  update(
    id: string,
    patch: unknown,
    actor?: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, TicketError>>;
  /** Soft-close (DELETE semantically). Returns TicketAlreadyClosed if already closed. */
  softClose(
    id: string,
    actor?: { id: string; type: 'user' | 'system' | 'workflow' },
  ): Promise<Result<DrizzleTicketRecord, TicketError>>;
}

export function createTicketService(deps: TicketServiceDeps): TicketService {
  const defaultActor = deps.defaultActor ?? { id: 'system', type: 'system' as const };

  function zodIssuesToTagged(zErr: z.ZodError): TicketError {
    return {
      _tag: 'TicketValidationError',
      issues: zErr.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  return {
    async create(rawInput, actor) {
      const parsed = CreateTicketSchema.safeParse(rawInput);
      if (!parsed.success) {
        return Result.err(zodIssuesToTagged(parsed.error));
      }
      const input = parsed.data;

      // graph validation gate — only when a workflow definition is bound
      if (input.workflowDefinitionId && deps.verifyWorkflowDefinition) {
        const verdict = await deps.verifyWorkflowDefinition(input.workflowDefinitionId);
        if (verdict.status === 'not_found') {
          return Result.err({
            _tag: 'WorkflowDefinitionNotFound',
            workflowDefinitionId: input.workflowDefinitionId,
          });
        }
        if (verdict.status === 'invalid') {
          return Result.err({ _tag: 'WorkflowDefinitionInvalid', reason: verdict.reason });
        }
      }

      const created = await deps.store.create(input as CreateTicketInput);

      // audit emit — fire-and-forget so HTTP latency stays low
      void deps.emitAudit({
        actor: actor ?? defaultActor,
        action: 'platform.ticket.created',
        resource: { type: 'ticket', id: created.id },
        metadata: {
          ownerUserId: created.ownerUserId,
          departmentId: created.departmentId,
          priority: created.priority,
          workflowDefinitionId: created.workflowDefinitionId,
        },
      });

      return Result.ok(created);
    },

    async findById(id) {
      const row = await deps.store.findById(id);
      if (!row) return Result.err({ _tag: 'TicketNotFound', id });
      return Result.ok(row);
    },

    async list(params) {
      return deps.store.list(params);
    },

    async update(id, rawPatch, actor) {
      const parsed = UpdateTicketSchema.safeParse(rawPatch);
      if (!parsed.success) {
        return Result.err(zodIssuesToTagged(parsed.error));
      }
      const patch = parsed.data;

      // do not allow re-opening a closed ticket via PATCH; that goes
      // through a separate endpoint when we add it (S18-ish). For now,
      // any PATCH on a closed ticket is rejected.
      const existing = await deps.store.findById(id);
      if (!existing) return Result.err({ _tag: 'TicketNotFound', id });
      if (existing.status === 'closed') {
        return Result.err({ _tag: 'TicketAlreadyClosed', id });
      }

      const updated = await deps.store.update(id, patch as UpdateTicketInput);
      if (!updated) return Result.err({ _tag: 'TicketNotFound', id });

      void deps.emitAudit({
        actor: actor ?? defaultActor,
        action: 'platform.ticket.updated',
        resource: { type: 'ticket', id: updated.id },
        metadata: { patch },
      });

      return Result.ok(updated);
    },

    async softClose(id, actor) {
      const existing = await deps.store.findById(id);
      if (!existing) return Result.err({ _tag: 'TicketNotFound', id });
      if (existing.status === 'closed') {
        return Result.err({ _tag: 'TicketAlreadyClosed', id });
      }

      const closed = await deps.store.softClose(id);
      if (!closed) return Result.err({ _tag: 'TicketNotFound', id });

      void deps.emitAudit({
        actor: actor ?? defaultActor,
        action: 'platform.ticket.closed',
        resource: { type: 'ticket', id: closed.id },
        metadata: { closedAt: closed.closedAt?.toISOString() },
      });

      return Result.ok(closed);
    },
  };
}

// re-export the status/priority enum types so route handlers can
// reference them without an extra @aptivo/database import path.
export type { TicketStatus, TicketPriority };
