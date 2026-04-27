/**
 * S17-CT-2: Drizzle adapter for the per-priority SLA window store.
 *
 * Tiny CRUD: list / get / upsert. Local DRIFT-RISK store contract
 * mirroring what the apps/web `ticket-sla-service` consumes.
 */

import { eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { ticketSlaConfigs } from '../schema/ticket-sla-configs.js';
import type { TicketPriority } from './ticket-store-drizzle.js';

export interface TicketSlaConfigRecord {
  priority: TicketPriority;
  resolveMinutes: number;
  warningThresholdPct: number;
  updatedAt: Date;
}

export interface TicketSlaConfigStore {
  list(): Promise<readonly TicketSlaConfigRecord[]>;
  get(priority: TicketPriority): Promise<TicketSlaConfigRecord | null>;
  upsert(input: {
    priority: TicketPriority;
    resolveMinutes: number;
    warningThresholdPct?: number;
  }): Promise<TicketSlaConfigRecord>;
}

function rowToRecord(row: typeof ticketSlaConfigs.$inferSelect): TicketSlaConfigRecord {
  return {
    priority: row.priority,
    resolveMinutes: row.resolveMinutes,
    // numeric columns come back as strings from drizzle/pg; coerce
    warningThresholdPct: Number(row.warningThresholdPct),
    updatedAt: row.updatedAt,
  };
}

export function createDrizzleTicketSlaConfigStore(
  db: DrizzleClient,
): TicketSlaConfigStore {
  return {
    async list() {
      const rows = await db.select().from(ticketSlaConfigs);
      return rows.map(rowToRecord);
    },

    async get(priority) {
      const rows = await db
        .select()
        .from(ticketSlaConfigs)
        .where(eq(ticketSlaConfigs.priority, priority))
        .limit(1);
      const row = rows[0];
      return row ? rowToRecord(row) : null;
    },

    async upsert(input) {
      const warningThresholdPct = input.warningThresholdPct ?? 0.8;
      const [row] = await db
        .insert(ticketSlaConfigs)
        .values({
          priority: input.priority,
          resolveMinutes: input.resolveMinutes,
          warningThresholdPct: String(warningThresholdPct),
        })
        .onConflictDoUpdate({
          target: [ticketSlaConfigs.priority],
          set: {
            resolveMinutes: input.resolveMinutes,
            warningThresholdPct: String(warningThresholdPct),
            updatedAt: sql`now()`,
          },
        })
        .returning();
      if (!row) throw new Error('ticket_sla_configs upsert returned no rows');
      return rowToRecord(row);
    },
  };
}
