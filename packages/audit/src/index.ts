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
