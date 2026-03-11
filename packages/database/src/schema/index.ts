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
export { userRoles, rolePermissions } from './user-roles.js';
export { mcpServers, mcpTools } from './mcp-registry.js';
export { files, fileEntityLinks } from './file-storage.js';
export {
  notificationTemplates,
  notificationPreferences,
  deliveryStatusEnum,
  notificationDeliveries,
} from './notifications.js';

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
