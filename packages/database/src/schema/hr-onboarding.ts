/**
 * S18-B2: HR onboarding state + task checklist tables.
 *
 * Triggered by `hr.contract.signed` (per packages/types/src/events/hr.ts).
 * State machine — minimal viable per AD-S18-5; the HR FRD does not
 * formally define onboarding states, so the workflow commits to:
 *
 *   pending → docs_collected → manager_assigned → approved → onboarded
 *
 * HITL gate sits between `manager_assigned` and `approved` (manager
 * + HR head sign-off). Each transition is a separate Inngest step so
 * Inngest retries individual steps rather than re-running the whole
 * onboarding from scratch on transient failures.
 *
 * Idempotency: `unique(candidateId)` blocks duplicate-trigger ghosting.
 * If both `candidate.hired` (when that event lands later) AND
 * `hr.contract.signed` ever fire for the same candidate, the second
 * trigger sees the existing onboarding row and resumes — does not
 * create a new row. Mirrors B1's defensive uniqueness pattern on
 * `crypto_positions.signal_id`.
 *
 * `lastStepFailedAt` populates when an Inngest step retry budget
 * exhausts. Phase 3.5 admin UI can surface stuck onboardings via this
 * column without parsing event logs.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { candidates, contracts } from './hr-domain.js';

// ---------------------------------------------------------------------------
// hr_onboarding — the workflow's persistent state row
// ---------------------------------------------------------------------------

export const hrOnboarding = pgTable(
  'hr_onboarding',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * one onboarding per candidate (round-1 plan idempotency rule —
     * unique constraint blocks duplicate-trigger ghosting). PostgreSQL
     * UNIQUE allows multiple NULLs, but candidateId is NOT NULL so
     * the constraint is strict.
     */
    candidateId: uuid('candidate_id').references(() => candidates.id).notNull().unique(),

    /**
     * the contract whose `signed` terminal triggered this onboarding,
     * or null for paths added later (e.g. `candidate.hired` event when
     * a hire-decision workflow lands). Informational FK.
     */
    contractId: uuid('contract_id').references(() => contracts.id),

    /**
     * State machine values per AD-S18-5:
     *   pending | docs_collected | manager_assigned | approved | onboarded
     * No reverse transitions in the workflow today; admin override
     * routes (Phase 3.5) can move to a 'cancelled' terminal.
     */
    state: varchar('state', { length: 30 }).notNull().default('pending'),

    /** UUID of the assigned manager once `manager_assigned` is reached */
    managerId: uuid('manager_id'),

    /**
     * HITL approval request id (the `hitl_requests.id` from the gateway)
     * once `manager_assigned → approved` HITL is created. Null until
     * that transition.
     */
    hitlRequestId: uuid('hitl_request_id'),

    /**
     * Approver userId once HITL approves. Stamped at the
     * `approved` transition; carries through to the `onboarded` audit
     * emit so audit_logs.user_id is populated and the anomaly aggregate
     * matches per-user volume (S18-A1 attribution chain).
     */
    approvedBy: uuid('approved_by'),

    /**
     * S18-B2 retry surface: populates when an Inngest step retry
     * budget exhausts. Phase 3.5 admin UI surfaces stuck onboardings
     * via this column.
     */
    lastStepFailedAt: timestamp('last_step_failed_at', { withTimezone: true }),

    /** free-form failure detail to pair with `lastStepFailedAt` */
    lastStepFailureReason: text('last_step_failure_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    /** populated when state reaches 'onboarded' */
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  },
  (table) => [
    // admin queries by state (e.g. "show all manager_assigned awaiting approval")
    index('hr_onboarding_state_idx').on(table.state),
    // detail-page lookups by contract
    index('hr_onboarding_contract_idx').on(table.contractId),
    // surfacing stuck onboardings — Phase 3.5 admin UI
    index('hr_onboarding_failed_idx').on(table.lastStepFailedAt),
  ],
);

// ---------------------------------------------------------------------------
// hr_onboarding_tasks — document checklist (one row per required item)
// ---------------------------------------------------------------------------

export const hrOnboardingTasks = pgTable(
  'hr_onboarding_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    onboardingId: uuid('onboarding_id').references(() => hrOnboarding.id).notNull(),
    /** task slug — e.g. 'i9-form', 'tax-w4', 'direct-deposit-form' */
    slug: varchar('slug', { length: 100 }).notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    /** 'pending' | 'submitted' | 'verified' | 'waived' */
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** submitted-document file id when status='submitted' */
    fileId: uuid('file_id'),
    /** free-form audit metadata captured at submission/verification */
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // primary access pattern: list tasks for one onboarding
    index('hr_onboarding_tasks_onboarding_idx').on(table.onboardingId),
    // idempotency: a (onboardingId, slug) pair must be unique so
    // re-running the docs-collected step doesn't create duplicate rows
    uniqueIndex('hr_onboarding_tasks_unique_idx').on(table.onboardingId, table.slug),
  ],
);
