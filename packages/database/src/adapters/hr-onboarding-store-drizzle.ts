/**
 * S18-B2: HR onboarding store adapter.
 *
 * Backs the `hr_onboarding` + `hr_onboarding_tasks` tables (see
 * packages/database/src/schema/hr-onboarding.ts). Three primary call
 * surfaces:
 *
 *   - `findOrCreate(candidateId, contractId)` from the workflow's
 *     trigger step. Returns existing row on second-trigger
 *     (idempotency via the unique candidateId constraint) or creates
 *     a new pending row.
 *   - `transitionState(id, to, metadata?)` from each workflow step.
 *     Optimistic — callers handle constraint violations.
 *   - `findById(id)` / `findByCandidateId(candidateId)` for the
 *     read endpoints (Phase 3.5 admin UI consumes these).
 *
 * Plus task management:
 *   - `seedTasks(onboardingId, taskDefs)` — idempotent via the
 *     (onboardingId, slug) unique constraint; ON CONFLICT DO NOTHING
 *   - `submitTask(taskId, fileId, metadata?)` — flips status to
 *     'submitted' and records the file
 *   - `verifyTask(taskId, metadata?)` — flips to 'verified'
 *   - `findTasksByOnboarding(id)` — for the detail endpoint
 */

import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { hrOnboarding, hrOnboardingTasks } from '../schema/hr-onboarding.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

/**
 * State machine values per AD-S18-5. The workflow forbids reverse
 * transitions today; admin override (Phase 3.5) can move to
 * 'cancelled'.
 */
export type OnboardingState =
  | 'pending'
  | 'docs_collected'
  | 'manager_assigned'
  | 'approved'
  | 'onboarded'
  | 'cancelled';

export type OnboardingTaskStatus = 'pending' | 'submitted' | 'verified' | 'waived';

export interface OnboardingRecord {
  id: string;
  candidateId: string;
  contractId: string | null;
  state: OnboardingState;
  managerId: string | null;
  hitlRequestId: string | null;
  approvedBy: string | null;
  lastStepFailedAt: Date | null;
  lastStepFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  onboardedAt: Date | null;
}

export interface OnboardingTaskRecord {
  id: string;
  onboardingId: string;
  slug: string;
  label: string;
  status: OnboardingTaskStatus;
  fileId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingTaskDef {
  slug: string;
  label: string;
}

export interface HrOnboardingStore {
  /**
   * Idempotent: returns existing row when candidateId already has an
   * onboarding (second trigger from `hr.contract.signed` or, future,
   * `candidate.hired`), else inserts a new `pending` row.
   *
   * The store handles the race via PostgreSQL's `ON CONFLICT (candidateId)
   * DO UPDATE` returning the existing row; both racing inserts read
   * the same id deterministically.
   */
  findOrCreate(input: {
    candidateId: string;
    contractId?: string;
  }): Promise<OnboardingRecord>;

  findById(id: string): Promise<OnboardingRecord | null>;
  findByCandidateId(candidateId: string): Promise<OnboardingRecord | null>;

  /**
   * Set the new state (and optional metadata fields) on the row.
   * Caller is responsible for guarding against invalid transitions —
   * the workflow does this via Inngest step ordering.
   */
  transitionState(
    id: string,
    to: OnboardingState,
    metadata?: {
      managerId?: string;
      hitlRequestId?: string;
      approvedBy?: string;
      onboardedAt?: Date;
    },
  ): Promise<void>;

  /**
   * Mark the row as having a failed step. Pairs with the
   * `lastStepFailedAt` index so admin queries surface stuck rows.
   */
  recordStepFailure(id: string, reason: string): Promise<void>;

  /**
   * Idempotent task seeding via `ON CONFLICT DO NOTHING` on the
   * (onboardingId, slug) unique index. Re-running the docs-collected
   * workflow step doesn't create duplicates.
   */
  seedTasks(onboardingId: string, taskDefs: readonly OnboardingTaskDef[]): Promise<void>;

  findTasksByOnboarding(onboardingId: string): Promise<readonly OnboardingTaskRecord[]>;

  submitTask(
    taskId: string,
    args: { fileId: string; metadata?: Record<string, unknown> },
  ): Promise<void>;

  verifyTask(taskId: string, args?: { metadata?: Record<string, unknown> }): Promise<void>;
}

// ---------------------------------------------------------------------------
// adapter factory
// ---------------------------------------------------------------------------

function rowToRecord(r: typeof hrOnboarding.$inferSelect): OnboardingRecord {
  return {
    id: r.id,
    candidateId: r.candidateId,
    contractId: r.contractId,
    state: r.state as OnboardingState,
    managerId: r.managerId,
    hitlRequestId: r.hitlRequestId,
    approvedBy: r.approvedBy,
    lastStepFailedAt: r.lastStepFailedAt,
    lastStepFailureReason: r.lastStepFailureReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    onboardedAt: r.onboardedAt,
  };
}

function taskRowToRecord(r: typeof hrOnboardingTasks.$inferSelect): OnboardingTaskRecord {
  return {
    id: r.id,
    onboardingId: r.onboardingId,
    slug: r.slug,
    label: r.label,
    status: r.status as OnboardingTaskStatus,
    fileId: r.fileId,
    metadata: r.metadata,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createDrizzleHrOnboardingStore(db: DrizzleClient): HrOnboardingStore {
  return {
    async findOrCreate(input) {
      // ON CONFLICT DO UPDATE on candidate_id with a no-op update so
      // RETURNING gives us the existing row deterministically.
      // Postgres `ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col`
      // is the canonical pattern for "upsert returning row".
      const rows = await db
        .insert(hrOnboarding)
        .values({
          candidateId: input.candidateId,
          contractId: input.contractId ?? null,
        })
        .onConflictDoUpdate({
          target: hrOnboarding.candidateId,
          // no-op SET to force the RETURNING clause to fire on conflict
          set: { candidateId: sql`EXCLUDED.candidate_id` },
        })
        .returning();
      return rowToRecord(rows[0]!);
    },

    async findById(id) {
      const rows = await db
        .select()
        .from(hrOnboarding)
        .where(eq(hrOnboarding.id, id));
      if (rows.length === 0) return null;
      return rowToRecord(rows[0]!);
    },

    async findByCandidateId(candidateId) {
      const rows = await db
        .select()
        .from(hrOnboarding)
        .where(eq(hrOnboarding.candidateId, candidateId));
      if (rows.length === 0) return null;
      return rowToRecord(rows[0]!);
    },

    async transitionState(id, to, metadata) {
      const updates: Record<string, unknown> = {
        state: to,
        updatedAt: new Date(),
      };
      if (metadata?.managerId !== undefined) updates.managerId = metadata.managerId;
      if (metadata?.hitlRequestId !== undefined) updates.hitlRequestId = metadata.hitlRequestId;
      if (metadata?.approvedBy !== undefined) updates.approvedBy = metadata.approvedBy;
      if (to === 'onboarded') {
        updates.onboardedAt = metadata?.onboardedAt ?? new Date();
      }
      await db
        .update(hrOnboarding)
        .set(updates)
        .where(eq(hrOnboarding.id, id));
    },

    async recordStepFailure(id, reason) {
      await db
        .update(hrOnboarding)
        .set({
          lastStepFailedAt: new Date(),
          lastStepFailureReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(hrOnboarding.id, id));
    },

    async seedTasks(onboardingId, taskDefs) {
      if (taskDefs.length === 0) return;
      await db
        .insert(hrOnboardingTasks)
        .values(
          taskDefs.map((t) => ({
            onboardingId,
            slug: t.slug,
            label: t.label,
          })),
        )
        .onConflictDoNothing();
    },

    async findTasksByOnboarding(onboardingId) {
      const rows = await db
        .select()
        .from(hrOnboardingTasks)
        .where(eq(hrOnboardingTasks.onboardingId, onboardingId));
      return rows.map(taskRowToRecord);
    },

    async submitTask(taskId, args) {
      await db
        .update(hrOnboardingTasks)
        .set({
          status: 'submitted',
          fileId: args.fileId,
          metadata: args.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(hrOnboardingTasks.id, taskId));
    },

    async verifyTask(taskId, args) {
      await db
        .update(hrOnboardingTasks)
        .set({
          status: 'verified',
          metadata: args?.metadata ?? {},
          updatedAt: new Date(),
        })
        .where(and(eq(hrOnboardingTasks.id, taskId)));
    },
  };
}
