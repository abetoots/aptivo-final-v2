/**
 * @aptivo/audit — tamper-evident audit logging
 * @task AUD-02
 * @frd FR-CORE-AUD-001
 */

export { createAuditService } from './audit-service.js';
export { computeAuditHash } from './hashing.js';
export { maskMetadata } from './masking.js';
export type {
  AuditEventInput,
  AuditRecord,
  AuditError,
  AuditStore,
  AuditService,
  AuditServiceDeps,
  MaskingConfig,
  ChainHead,
  InsertAuditLog,
} from './types.js';
export { DEFAULT_MASKING_CONFIG } from './types.js';

// OBS-02: audit query & export
export { createAuditQueryService } from './query/index.js';
export type {
  AuditQueryServiceDeps,
  AuditQueryFilters,
  AuditQueryPagination,
  AuditLogRecord,
  AuditQueryResult,
  AuditExportResult,
  AuditQueryStore,
} from './query/index.js';

// OBS-03: retention policies
export { createRetentionService } from './retention/index.js';
export {
  DEFAULT_RETENTION_POLICIES,
} from './retention/index.js';
export type {
  RetentionServiceDeps,
  RetentionPolicy,
  RetentionPurgeResult,
  RetentionStore,
} from './retention/index.js';
