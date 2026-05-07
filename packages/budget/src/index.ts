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

// S18-B3: budget-threshold notification + HITL escalation
export {
  createBudgetDedupeStore,
  currentMonthPeriod,
  secondsUntilNextMonth,
} from './budget-dedupe-store.js';
export type {
  BudgetDedupeStore,
  BudgetDedupeStoreOptions,
  BudgetDedupeRedis,
  BudgetThreshold,
} from './budget-dedupe-store.js';

export {
  createBudgetNotificationService,
} from './budget-notification-service.js';
export type {
  BudgetNotificationService,
  BudgetNotificationServiceDeps,
  BudgetNotificationContext,
  BudgetNotificationResult,
  BudgetNotificationError,
  BudgetNotificationThreshold,
} from './budget-notification-service.js';

export {
  createBudgetHitlEscalation,
} from './budget-hitl-escalation.js';
export type {
  BudgetHitlEscalationService,
  BudgetHitlEscalationServiceDeps,
  BudgetHitlEscalationContext,
  BudgetHitlEscalationResult,
  BudgetHitlEscalationError,
  TriggerBudgetExceptionChain,
} from './budget-hitl-escalation.js';
