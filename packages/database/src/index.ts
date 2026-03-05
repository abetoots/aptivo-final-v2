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
  auditLogs,
} from './schema/index.js';
