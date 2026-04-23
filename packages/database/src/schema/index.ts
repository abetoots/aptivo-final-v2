/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

export { users } from './users.js';
export { sessions } from './sessions.js';
export { hitlStatusEnum, hitlRequests } from './hitl-requests.js';
export { hitlDecisionEnum, hitlDecisions } from './hitl-decisions.js';
export { llmUsageLogs } from './llm-usage.js';
export { llmBudgetConfigs } from './llm-budget-configs.js';
export { auditLogs, auditChainHeads, dlqStatusEnum, auditWriteDlq } from './audit-logs.js';
export { userRoles, rolePermissions, webauthnCredentials } from './user-roles.js';
export { mcpServers, mcpTools } from './mcp-registry.js';
export { files, fileEntityLinks } from './file-storage.js';
export {
  notificationTemplates,
  notificationPreferences,
  deliveryStatusEnum,
  notificationDeliveries,
} from './notifications.js';

// approval policies (HITL2-01)
export { approvalPolicyTypeEnum, approvalPolicies } from './approval-policies.js';

// per-approver tokens (HITL2-02)
export { hitlRequestTokens } from './hitl-request-tokens.js';

// crypto domain (S6-INF-CRY)
export {
  monitoredWallets,
  tradeSignals,
  tradeExecutions,
  portfolioStates,
  securityReports,
} from './crypto-domain.js';

// hr domain (S6-INF-HR)
export {
  candidates,
  applications,
  interviews,
  interviewFeedback,
  consentRecords,
  positions,
  contracts,
} from './hr-domain.js';

// workflow definitions (FEAT-01)
export { workflowStatusEnum, workflowDefinitions } from './workflow-definitions.js';
export type { WorkflowStep } from './workflow-definitions.js';

// FA3-01: first-class department entity + per-department budget configs
export { departments } from './departments.js';
export { departmentBudgetConfigs } from './department-budget-configs.js';

// S17-B3: per-(actor, scope) baseline statistics for the LLM3-04
// anomaly gate. Replaces the S16 placeholder constant; closes Gate #5.
export { anomalyBaselines } from './anomaly-baselines.js';
