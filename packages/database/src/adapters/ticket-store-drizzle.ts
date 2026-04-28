/**
 * S17-CT-1: Drizzle adapter for the case-tracking ticket store.
 *
 * Local store interface mirrors what the apps/web ticket service
 * consumes; the database package intentionally does not depend on
 * apps/web. DRIFT RISK noted per the same pattern as the other
 * domain adapters — tracked alongside the broader interface
 * consolidation in S18.
 *
 * Soft-close semantics: there is no hard `delete()` method. The
 * service-layer `softClose()` updates `status='closed'` and stamps
 * `closedAt`. Hard deletes would break SLA-honoured-after analytics
 * (CT-4) and the audit trail; if a true purge is ever needed, it
 * lives behind a separate retention path.
 */

import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { tickets } from '../schema/tickets.js';

// ---------------------------------------------------------------------------
// store contract
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'in_progress' | 'escalated' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TicketRecord {
  id: string;
  workflowDefinitionId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  title: string;
  body: string;
  ownerUserId: string;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  // S17-CT-3: opaque to the store; the case-tracking service is the
  // only writer/reader. Null until first escalation.
  escalationState: unknown;
}

export interface CreateTicketInput {
  workflowDefinitionId?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  title: string;
  body: string;
  ownerUserId: string;
  departmentId?: string | null;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  title?: string;
  body?: string;
  // ownerUserId and departmentId are intentionally not updatable via
  // PATCH today — those are CT-3 escalation / FA3-01 admin-only paths
  // and need their own audit + RBAC story.
}

export interface ListTicketsParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  ownerUserId?: string;
  departmentId?: string;
  /** 1-based; default 50, max 200 (HTTP layer enforces). */
  limit?: number;
  offset?: number;
  /** Newest-first by default. */
  order?: 'createdAt-asc' | 'createdAt-desc';
}

export interface ListTicketsResult {
  rows: readonly TicketRecord[];
  totalCount: number;
}

export interface TicketStore {
  create(input: CreateTicketInput): Promise<TicketRecord>;
  findById(id: string): Promise<TicketRecord | null>;
  list(params?: ListTicketsParams): Promise<ListTicketsResult>;
  update(id: string, patch: UpdateTicketInput): Promise<TicketRecord | null>;
  /** Soft-close: status='closed', closedAt=now(). Returns null when ticket not found. */
  softClose(id: string): Promise<TicketRecord | null>;
  /**
   * S17-CT-3: persists `escalationState` JSONB and optionally flips
   * status (typically 'escalated' on advance). The case-tracking
   * service is the only caller; the store stays opaque to the JSONB
   * shape.
   *
   * Returns null when the ticket doesn't exist OR — when
   * `expectedUpdatedAt` is supplied — when the row's `updated_at`
   * has moved on since the caller read it. The service distinguishes
   * the two by the prior findById it must have performed: a null
   * here after a known-existing ticket means a lost update (race
   * with a concurrent escalation or status change). This is the
   * optimistic-concurrency contract the escalation service relies on
   * to surface `TicketEscalationStale` instead of silently dropping
   * a history entry.
   */
  setEscalationState(
    id: string,
    state: unknown,
    opts?: { status?: TicketStatus; expectedUpdatedAt?: Date },
  ): Promise<TicketRecord | null>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function createDrizzleTicketStore(db: DrizzleClient): TicketStore {
  function rowToRecord(row: typeof tickets.$inferSelect): TicketRecord {
    return {
      id: row.id,
      workflowDefinitionId: row.workflowDefinitionId,
      status: row.status,
      priority: row.priority,
      title: row.title,
      body: row.body,
      ownerUserId: row.ownerUserId,
      departmentId: row.departmentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      closedAt: row.closedAt,
      escalationState: row.escalationState,
    };
  }

  return {
    async create(input) {
      const [row] = await db
        .insert(tickets)
        .values({
          workflowDefinitionId: input.workflowDefinitionId ?? null,
          status: input.status ?? 'open',
          priority: input.priority ?? 'medium',
          title: input.title,
          body: input.body,
          ownerUserId: input.ownerUserId,
          departmentId: input.departmentId ?? null,
        })
        .returning();
      if (!row) {
        // drizzle .returning() should always yield a row on a successful insert
        throw new Error('ticket insert returned no rows');
      }
      return rowToRecord(row);
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      const row = rows[0];
      return row ? rowToRecord(row) : null;
    },

    async list(params = {}) {
      const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = params.offset ?? 0;
      const order = params.order ?? 'createdAt-desc';

      const filters = [];
      if (params.status) filters.push(eq(tickets.status, params.status));
      if (params.priority) filters.push(eq(tickets.priority, params.priority));
      if (params.ownerUserId) filters.push(eq(tickets.ownerUserId, params.ownerUserId));
      if (params.departmentId) filters.push(eq(tickets.departmentId, params.departmentId));
      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const rows = await db
        .select()
        .from(tickets)
        .where(whereClause)
        .orderBy(order === 'createdAt-asc' ? asc(tickets.createdAt) : desc(tickets.createdAt))
        .limit(limit)
        .offset(offset);

      // count(*) for pagination — separate query so the page result + total
      // are decoupled (drizzle has no equivalent of a single windowed-count).
      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(tickets)
        .where(whereClause);

      return {
        rows: rows.map(rowToRecord),
        totalCount: Number(totalCount ?? 0),
      };
    },

    async update(id, patch) {
      // Build an update object excluding undefined fields so a missing
      // patch property doesn't overwrite the existing column with null.
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set['status'] = patch.status;
      if (patch.priority !== undefined) set['priority'] = patch.priority;
      if (patch.title !== undefined) set['title'] = patch.title;
      if (patch.body !== undefined) set['body'] = patch.body;
      if (Object.keys(set).length === 0) {
        // no-op patch — fetch and return the existing row so callers
        // can rely on the contract "returns the latest record or null"
        return this.findById(id);
      }
      const [row] = await db
        .update(tickets)
        .set(set)
        .where(eq(tickets.id, id))
        .returning();
      return row ? rowToRecord(row) : null;
    },

    async softClose(id) {
      const [row] = await db
        .update(tickets)
        .set({
          status: 'closed',
          closedAt: sql`now()`,
        })
        .where(eq(tickets.id, id))
        .returning();
      return row ? rowToRecord(row) : null;
    },

    async setEscalationState(id, state, opts) {
      const set: Record<string, unknown> = { escalationState: state };
      if (opts?.status !== undefined) set['status'] = opts.status;
      // Optimistic concurrency: when the caller pinned a version,
      // include it in the WHERE so a racing UPDATE invalidates ours
      // (the .returning() comes back empty and we report null).
      const whereClause = opts?.expectedUpdatedAt
        ? and(eq(tickets.id, id), eq(tickets.updatedAt, opts.expectedUpdatedAt))
        : eq(tickets.id, id);
      const [row] = await db
        .update(tickets)
        .set(set)
        .where(whereClause)
        .returning();
      return row ? rowToRecord(row) : null;
    },
  };
}
