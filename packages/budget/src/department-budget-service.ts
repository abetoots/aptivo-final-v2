/**
 * FA3-01: Department budget service — factory with DI (platform convention).
 *
 * Deliberately uses the factory+deps form rather than the class form of
 * the existing `BudgetService` in `@aptivo/llm-gateway/budget`, both
 * because the platform's newer convention is factory-style AND because
 * department budgeting is organisationally scoped while the LLM budget
 * service is system-scoped (crypto/hr/core). Same shape is
 * intentional so operators see a familiar set of knobs.
 */

import { Result } from '@aptivo/types';
import type {
  BudgetConfig,
  DepartmentBudgetError,
  DepartmentBudgetStore,
  DepartmentRecord,
  SpendReport,
} from './types.js';

// ---------------------------------------------------------------------------
// minimal logger contract — packages must not import app-level loggers
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface DepartmentBudgetServiceDeps {
  readonly store: DepartmentBudgetStore;
  readonly logger?: Logger;
  /** injectable clock for deterministic tests */
  readonly nowMs?: () => number;
}

// ---------------------------------------------------------------------------
// public surface
// ---------------------------------------------------------------------------

export interface DepartmentBudgetService {
  createDepartment(input: { name: string; ownerUserId: string }): Promise<Result<DepartmentRecord, DepartmentBudgetError>>;
  findDepartment(id: string): Promise<Result<DepartmentRecord, DepartmentBudgetError>>;
  listDepartments(): Promise<DepartmentRecord[]>;

  setBudget(departmentId: string, config: BudgetConfig): Promise<Result<void, DepartmentBudgetError>>;
  getBudget(departmentId: string): Promise<Result<BudgetConfig, DepartmentBudgetError>>;

  /**
   * `{ allowed: true, remaining: N }` when the department is either
   * within budget or `blockOnExceed: false`. `{ allowed: false,
   * remaining: 0 }` only when over the monthly limit AND block-on-exceed
   * is set. Callers must honour the return value — this function is
   * advisory unless the caller enforces at the point of spend.
   */
  checkBudget(departmentId: string, amountUsd: number): Promise<Result<{ allowed: boolean; remaining: number }, DepartmentBudgetError>>;

  getSpendReport(
    departmentId: string,
    range: { from: Date; to: Date },
  ): Promise<Result<SpendReport, DepartmentBudgetError>>;
}

// ---------------------------------------------------------------------------
// validation helpers
// ---------------------------------------------------------------------------

function validateConfig(config: BudgetConfig): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(config.monthlyLimitUsd) || config.monthlyLimitUsd <= 0) {
    issues.push('monthlyLimitUsd must be positive');
  }
  if (
    !Number.isFinite(config.warningThreshold) ||
    config.warningThreshold <= 0 ||
    config.warningThreshold > 1
  ) {
    issues.push('warningThreshold must be in the range (0, 1]');
  }
  return issues;
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createDepartmentBudgetService(
  deps: DepartmentBudgetServiceDeps,
): DepartmentBudgetService {
  const now = deps.nowMs ?? Date.now;

  return {
    async createDepartment(input) {
      if (!input.name?.trim()) {
        return Result.err({ _tag: 'BudgetConfigInvalid', issues: ['name must not be empty'] });
      }
      try {
        const record = await deps.store.createDepartment(input);
        return Result.ok(record);
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', cause });
      }
    },

    async findDepartment(id) {
      const record = await deps.store.findDepartmentById(id);
      if (!record) return Result.err({ _tag: 'DepartmentNotFound', id });
      return Result.ok(record);
    },

    async listDepartments() {
      return deps.store.listDepartments();
    },

    async setBudget(departmentId, config) {
      const issues = validateConfig(config);
      if (issues.length > 0) return Result.err({ _tag: 'BudgetConfigInvalid', issues });
      const dept = await deps.store.findDepartmentById(departmentId);
      if (!dept) return Result.err({ _tag: 'DepartmentNotFound', id: departmentId });
      try {
        await deps.store.setBudget(departmentId, config);
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', cause });
      }
    },

    async getBudget(departmentId) {
      // pre-commit review caught that returning DepartmentNotFound for
      // "dept exists but no budget config yet" is misleading. Probe
      // the department first, then the budget — two distinct error
      // tags let callers render clearer messages.
      const dept = await deps.store.findDepartmentById(departmentId);
      if (!dept) return Result.err({ _tag: 'DepartmentNotFound', id: departmentId });
      const config = await deps.store.getBudget(departmentId);
      if (!config) return Result.err({ _tag: 'BudgetNotConfigured', id: departmentId });
      return Result.ok(config);
    },

    async checkBudget(departmentId, amountUsd) {
      const dept = await deps.store.findDepartmentById(departmentId);
      if (!dept) return Result.err({ _tag: 'DepartmentNotFound', id: departmentId });
      const config = await deps.store.getBudget(departmentId);
      if (!config) return Result.err({ _tag: 'BudgetNotConfigured', id: departmentId });

      const nowDate = new Date(now());
      const spend = await deps.store.aggregateSpend({
        departmentId,
        from: startOfMonth(nowDate),
        to: nowDate,
      });
      const projected = spend.totalUsd + amountUsd;
      const remaining = Math.max(0, config.monthlyLimitUsd - spend.totalUsd);

      if (projected > config.monthlyLimitUsd) {
        if (config.blockOnExceed) {
          deps.logger?.warn?.('department_budget_exceeded', {
            departmentId,
            currentSpendUsd: spend.totalUsd,
            limitUsd: config.monthlyLimitUsd,
            amountUsd,
          });
          return Result.err({
            _tag: 'MonthlyBudgetExceeded',
            remaining: 0 as const,
            limitUsd: config.monthlyLimitUsd,
            currentSpendUsd: spend.totalUsd,
          });
        }
        // block-on-exceed disabled → allow but warn
        deps.logger?.warn?.('department_budget_soft_exceed', {
          departmentId,
          currentSpendUsd: spend.totalUsd,
          limitUsd: config.monthlyLimitUsd,
        });
      }
      return Result.ok({ allowed: true, remaining });
    },

    async getSpendReport(departmentId, range) {
      const dept = await deps.store.findDepartmentById(departmentId);
      if (!dept) return Result.err({ _tag: 'DepartmentNotFound', id: departmentId });

      try {
        const spend = await deps.store.aggregateSpend({
          departmentId,
          from: range.from,
          to: range.to,
        });
        // coverageLevel: pre-commit review simplified this to a binary
        // signal. 'none' when this department has zero stamped rows
        // (S16 default state); 'full' when at least one stamped row
        // exists for this department (S17+ after stamping lands).
        // Earlier implementation tried to distinguish 'partial' by
        // comparing against global unstamped rows, but unstamped rows
        // can't be attributed to a specific department — the signal
        // was misleading.
        const coverageLevel: SpendReport['coverageLevel'] =
          spend.rowCount === 0 ? 'none' : 'full';
        return Result.ok({
          totalUsd: spend.totalUsd,
          rowCount: spend.rowCount,
          coverageLevel,
        });
      } catch (cause) {
        return Result.err({ _tag: 'PersistenceError', cause });
      }
    },
  };
}
