/**
 * FA3-01: Drizzle adapter for DepartmentBudgetStore.
 *
 * Redefines the store interface locally (same pattern as the
 * llm-usage-log-store adapter) so the database package doesn't depend
 * on @aptivo/budget at runtime. The TS-level contract is identical —
 * see `packages/budget/src/types.ts` — and any drift would surface at
 * composition time in apps/web.
 *
 * DRIFT RISK: this interface is intentionally duplicated from
 * `@aptivo/budget`. Any addition / widening to the store interface
 * there must be mirrored here manually. S17 task: consolidate the
 * BudgetStore interface in `@aptivo/types`.
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { departments } from '../schema/departments.js';
import { departmentBudgetConfigs } from '../schema/department-budget-configs.js';
import { llmUsageLogs } from '../schema/llm-usage.js';

// -- local types (mirror @aptivo/budget) --

export interface DepartmentRecord {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetConfig {
  monthlyLimitUsd: number;
  warningThreshold: number;
  blockOnExceed: boolean;
  notifyOnWarning: boolean;
}

export interface DepartmentBudgetStore {
  createDepartment(input: { name: string; ownerUserId: string }): Promise<DepartmentRecord>;
  findDepartmentById(id: string): Promise<DepartmentRecord | null>;
  listDepartments(): Promise<DepartmentRecord[]>;
  getBudget(departmentId: string): Promise<BudgetConfig | null>;
  setBudget(departmentId: string, config: BudgetConfig): Promise<void>;
  aggregateSpend(params: {
    departmentId: string;
    from: Date;
    to: Date;
  }): Promise<{ totalUsd: number; rowCount: number; unstampedRowCount: number }>;
}

// -- factory --

export function createDrizzleDepartmentBudgetStore(db: DrizzleClient): DepartmentBudgetStore {
  return {
    async createDepartment({ name, ownerUserId }) {
      const [row] = await db
        .insert(departments)
        .values({ name, ownerUserId })
        .returning();
      if (!row) throw new Error('createDepartment: insert returned no row');
      return {
        id: row.id,
        name: row.name,
        ownerUserId: row.ownerUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    async findDepartmentById(id) {
      const [row] = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        ownerUserId: row.ownerUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    async listDepartments() {
      const rows = await db.select().from(departments);
      return rows.map((r: typeof rows[number]) => ({
        id: r.id,
        name: r.name,
        ownerUserId: r.ownerUserId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getBudget(departmentId) {
      const [row] = await db
        .select()
        .from(departmentBudgetConfigs)
        .where(eq(departmentBudgetConfigs.departmentId, departmentId))
        .limit(1);
      if (!row) return null;
      // numeric columns come back as strings — parse to numbers
      return {
        monthlyLimitUsd: Number(row.monthlyLimitUsd),
        warningThreshold: Number(row.warningThreshold),
        blockOnExceed: row.blockOnExceed,
        notifyOnWarning: row.notifyOnWarning,
      };
    },

    async setBudget(departmentId, config) {
      // upsert: insert if none, update if one exists. Uses the unique
      // index on department_id.
      await db
        .insert(departmentBudgetConfigs)
        .values({
          departmentId,
          monthlyLimitUsd: String(config.monthlyLimitUsd),
          warningThreshold: String(config.warningThreshold),
          blockOnExceed: config.blockOnExceed,
          notifyOnWarning: config.notifyOnWarning,
        })
        .onConflictDoUpdate({
          target: departmentBudgetConfigs.departmentId,
          set: {
            monthlyLimitUsd: String(config.monthlyLimitUsd),
            warningThreshold: String(config.warningThreshold),
            blockOnExceed: config.blockOnExceed,
            notifyOnWarning: config.notifyOnWarning,
            updatedAt: new Date(),
          },
        });
    },

    async aggregateSpend({ departmentId, from, to }) {
      // Returns ONLY stamped-spend for this department. Pre-commit
      // review caught that the prior implementation was also counting
      // ALL unstamped rows globally in the window, which would mark
      // a department report 'partial' because of unrelated traffic.
      // Unstamped attribution is inherently unknown at the row level
      // (that's what stamping is for), so we surface `unstampedRowCount: 0`
      // and let the service's coverageLevel logic rely solely on
      // "did this department have at least one stamped row?" — a
      // simpler and more honest signal.
      const stamped = await db
        .select({
          totalUsd: sql<string>`COALESCE(SUM(${llmUsageLogs.costUsd}), 0)`.as('total'),
          rowCount: sql<number>`COUNT(*)::int`.as('count'),
        })
        .from(llmUsageLogs)
        .where(
          and(
            eq(llmUsageLogs.departmentId, departmentId),
            gte(llmUsageLogs.timestamp, from),
            lte(llmUsageLogs.timestamp, to),
          ),
        );

      return {
        totalUsd: Number(stamped[0]?.totalUsd ?? 0),
        rowCount: stamped[0]?.rowCount ?? 0,
        unstampedRowCount: 0,
      };
    },
  };
}
