/**
 * FW-02: Database Package
 * @task FW-02
 * @spec docs/04-specs/database.md
 * @see docs/04-specs/common-patterns.md §2 (Result types for DB operations)
 */

export { createDatabase, type Database } from './client.js';
export {
  users,
  sessions,
  hitlStatusEnum,
  hitlRequests,
  hitlDecisionEnum,
  hitlDecisions,
  llmUsageLogs,
  llmBudgetConfigs,
  auditLogs,
  auditChainHeads,
  dlqStatusEnum,
  auditWriteDlq,
  userRoles,
  rolePermissions,
  mcpServers,
  mcpTools,
  files,
  fileEntityLinks,
  notificationTemplates,
  notificationPreferences,
  deliveryStatusEnum,
  notificationDeliveries,
  // approval policies (HITL2-01)
  approvalPolicyTypeEnum,
  approvalPolicies,
  // per-approver tokens (HITL2-02)
  hitlRequestTokens,
} from './schema/index.js';

// domain seeds (S6-INF-SEED)
export {
  seedAllCrypto,
  seedCryptoRoles,
  seedCryptoTemplates,
  seedCryptoMcpServers,
  seedAllHr,
  seedHrRoles,
  seedHrTemplates,
  seedHrMcpServers,
} from './seeds/index.js';
