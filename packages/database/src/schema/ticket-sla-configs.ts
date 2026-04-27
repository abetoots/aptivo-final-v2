/**
 * S17-CT-2: per-priority SLA windows for case-tracking tickets.
 *
 * One row per ticket priority (low/medium/high/critical). The
 * `priority` column is the primary key — a deliberate denormalization
 * vs an autoincrement id, because there are exactly four rows
 * forever and lookups always go by priority.
 *
 * `resolveMinutes`: ticket must close within this many minutes of
 * `createdAt` to satisfy the SLA. `warningThresholdPct` is the
 * fraction of the window at which the ticket is flagged "at risk"
 * — default 0.80 (80% consumed). The SLO cron's
 * `ticketSlaAtRiskAlert` fires when too many open tickets cross
 * this threshold.
 *
 * Reusing the `ticket_priority` enum from tickets.ts keeps the FK
 * constraint implicit at the type level (drizzle-zod can't enforce
 * an actual FK on enum values, but the unique-priority pkey makes
 * it impossible to insert an unknown priority).
 */

import { check, numeric, pgTable, integer, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ticketPriorityEnum } from './tickets.js';

export const ticketSlaConfigs = pgTable(
  'ticket_sla_configs',
  {
    priority: ticketPriorityEnum('priority').notNull(),
    resolveMinutes: integer('resolve_minutes').notNull(),
    warningThresholdPct: numeric('warning_threshold_pct', { precision: 4, scale: 3 })
      .notNull()
      .default('0.800'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.priority] }),
    // S17-CT-2 (post-Codex review): schema-level validation so an
    // upstream bug (e.g. an admin panel passing 0 or 1.5) can't
    // poison the SLA math.
    resolveMinutesPositive: check(
      'ticket_sla_configs_resolve_minutes_positive',
      sql`${table.resolveMinutes} > 0`,
    ),
    warningThresholdRange: check(
      'ticket_sla_configs_warning_threshold_range',
      sql`${table.warningThresholdPct} >= 0 AND ${table.warningThresholdPct} <= 1`,
    ),
  }),
);
