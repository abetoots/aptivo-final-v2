/**
 * FA3-01: @aptivo/budget — department budgeting
 *
 * Org-scoped budget management (departments + monthly spend tracking),
 * kept in its own workspace package so it doesn't couple to the
 * LLM-specific budget service in @aptivo/llm-gateway.
 */

export type {
  DepartmentRecord,
  BudgetConfig,
  SpendReport,
  DepartmentBudgetError,
  DepartmentBudgetStore,
} from './types.js';

export {
  createDepartmentBudgetService,
} from './department-budget-service.js';
export type {
  DepartmentBudgetService,
  DepartmentBudgetServiceDeps,
  Logger,
} from './department-budget-service.js';
