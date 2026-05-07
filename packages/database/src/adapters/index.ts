/**
 * INT-W1: Database adapter barrel export
 * @task INT-W1
 */

export type { DrizzleClient } from './types.js';
export { createDrizzleAuditStore } from './audit-store-drizzle.js';
export { createDrizzleDlqStore } from './dlq-store-drizzle.js';

// INT-W2: notification adapters
export { createDrizzlePreferenceStore } from './notification-preference-drizzle.js';
export { createDrizzleDeliveryLogStore } from './delivery-log-drizzle.js';
export { createDrizzleTemplateStore } from './template-store-drizzle.js';

// crypto domain (S6-INF-CRY)
export {
  createDrizzleWalletStore,
  createDrizzleTradeSignalStore,
  createDrizzleTradeExecutionStore,
} from './crypto-stores.js';
export type {
  WalletStore,
  WalletRecord,
  TradeSignalStore,
  TradeSignalRecord,
  TradeExecutionStore,
  TradeExecutionRecord,
} from './crypto-stores.js';

// hr domain (S6-INF-HR)
export {
  createDrizzleCandidateStore,
  createDrizzleApplicationStore,
  createDrizzleInterviewStore,
  createDrizzleContractStore,
  createDrizzlePositionStore,
} from './hr-stores.js';
export type {
  CandidateStore,
  CandidateRecord,
  ApplicationStore,
  ApplicationRecord,
  InterviewStore,
  InterviewRecord,
  ContractStore,
  ContractRecord,
  PositionStore,
  PositionRecord,
} from './hr-stores.js';

// security reports (S7-INF-01)
export {
  createDrizzleSecurityReportStore,
} from './security-report-store.js';
export type {
  SecurityReportStore,
  SecurityReportRecord,
} from './security-report-store.js';

// metric aggregation queries (S7-CF-01)
export { createMetricQueries } from './metric-queries.js';
export type { MetricQueryDeps } from './metric-queries.js';

// admin dashboard store (S7-INT-02)
export { createDrizzleAdminStore } from './admin-store.js';
export type {
  AdminStore,
  AdminOverview,
  AuditLogEntry,
  PaginatedResult,
  HitlRequestEntry,
} from './admin-store.js';

// FA3-01: department budget store
export { createDrizzleDepartmentBudgetStore } from './department-budget-store-drizzle.js';
export type {
  DepartmentBudgetStore as DrizzleDepartmentBudgetStore,
  DepartmentRecord as DrizzleDepartmentRecord,
  BudgetConfig as DrizzleBudgetConfig,
} from './department-budget-store-drizzle.js';

// S17-B3: anomaly baseline store (closes Sprint-16 enablement gate #5)
export { createDrizzleAnomalyBaselineStore } from './anomaly-baseline-store-drizzle.js';
export type {
  AnomalyBaselineStore as DrizzleAnomalyBaselineStore,
  BaselineRecord as DrizzleBaselineRecord,
} from './anomaly-baseline-store-drizzle.js';

// S17-CT-1: case-tracking ticket store (Epic 4)
export { createDrizzleTicketStore } from './ticket-store-drizzle.js';
export type {
  TicketStore as DrizzleTicketStore,
  TicketRecord as DrizzleTicketRecord,
  TicketStatus,
  TicketPriority,
  CreateTicketInput,
  UpdateTicketInput,
  ListTicketsParams,
  ListTicketsResult,
} from './ticket-store-drizzle.js';

// S17-CT-2: per-priority SLA window store
export { createDrizzleTicketSlaConfigStore } from './ticket-sla-config-store-drizzle.js';
export type {
  TicketSlaConfigStore as DrizzleTicketSlaConfigStore,
  TicketSlaConfigRecord as DrizzleTicketSlaConfigRecord,
} from './ticket-sla-config-store-drizzle.js';

// S17-CT-4: ticket reporting aggregation queries
export { createTicketReportQueries } from './ticket-report-queries.js';
export type {
  TicketReportQueries as DrizzleTicketReportQueries,
  PriorityCount,
  PriorityResolutionRow,
  PriorityComplianceRow,
} from './ticket-report-queries.js';

// S18-B1: crypto live-trade position store (Epic 5 Crypto live-trade)
export { createDrizzleCryptoPositionStore } from './crypto-position-store-drizzle.js';
export type {
  CryptoPositionStore as DrizzleCryptoPositionStore,
  CryptoPositionRecord as DrizzleCryptoPositionRecord,
  PositionExitReason,
} from './crypto-position-store-drizzle.js';

// S18-B2: HR onboarding state + task store (Epic 5 HR onboarding)
export { createDrizzleHrOnboardingStore } from './hr-onboarding-store-drizzle.js';
export type {
  HrOnboardingStore as DrizzleHrOnboardingStore,
  OnboardingRecord as DrizzleOnboardingRecord,
  OnboardingTaskRecord as DrizzleOnboardingTaskRecord,
  OnboardingTaskDef,
  OnboardingState,
  OnboardingTaskStatus,
} from './hr-onboarding-store-drizzle.js';

// hitl persistence (P1.5-01)
export {
  createDrizzleHitlRequestStore,
  createDrizzleHitlDecisionStore,
} from './hitl-store-drizzle.js';
export type {
  HitlRequestStore,
  HitlDecisionStore,
  HitlRequestRecord as DrizzleHitlRequestRecord,
  HitlDecisionRecord as DrizzleHitlDecisionRecord,
  RequestSnapshot,
  ExistingDecision,
} from './hitl-store-drizzle.js';

// llm usage aggregation (S7-INT-03)
export { createDrizzleLlmUsageStore } from './llm-usage-store.js';
export type {
  LlmUsageStore,
  CostByDomain,
  CostByProvider,
  DailyTotal,
  BudgetStatus,
} from './llm-usage-store.js';

// llm budget + usage log stores (P1.5-02)
export { createDrizzleBudgetStore } from './llm-budget-store-drizzle.js';
export { createDrizzleUsageLogStore } from './llm-usage-log-store-drizzle.js';

// mcp registry adapter (P1.5-04)
export { createDrizzleMcpRegistryAdapter } from './mcp-registry-drizzle.js';
export type {
  McpRegistryAdapter,
  McpServerRecord as DrizzleMcpServerRecord,
  McpToolRecord as DrizzleMcpToolRecord,
} from './mcp-registry-drizzle.js';

// approval policy store (HITL2-01)
export { createDrizzleApprovalPolicyStore } from './approval-policy-store.js';
export type {
  ApprovalPolicyStore as DrizzleApprovalPolicyStore,
  ApprovalPolicyRecord as DrizzleApprovalPolicyRecord,
} from './approval-policy-store.js';

// webauthn credential store (INF-01)
export { createDrizzleWebAuthnStore } from './webauthn-store.js';
export type {
  WebAuthnCredentialStore as DrizzleWebAuthnCredentialStore,
  WebAuthnCredential as DrizzleWebAuthnCredential,
} from './webauthn-store.js';
