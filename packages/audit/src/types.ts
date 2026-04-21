/**
 * AUD-02: Audit service types
 * @task AUD-02
 * @frd FR-CORE-AUD-001
 * @guidelines §2.1 (Result types, tagged union errors)
 */

import type { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// audit event input
// ---------------------------------------------------------------------------

export interface AuditEventInput {
  actor: { id: string; type: 'user' | 'system' | 'workflow' };
  action: string;
  resource: { type: string; id: string };
  domain?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// audit record (returned after successful write)
// ---------------------------------------------------------------------------

export interface AuditRecord {
  id: string;
  previousHash: string | null;
  currentHash: string;
  sequence: number;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// errors (tagged union)
// ---------------------------------------------------------------------------

export type AuditError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown }
  | { _tag: 'ChainIntegrityError'; expected: string; actual: string };

// ---------------------------------------------------------------------------
// store interface (DB-decoupled)
// ---------------------------------------------------------------------------

export interface ChainHead {
  lastSeq: number;
  lastHash: string;
}

export interface InsertAuditLog {
  userId: string | null;
  actorType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  domain?: string | null;
  metadata: Record<string, unknown> | null;
  previousHash: string | null;
  currentHash: string;
}

/**
 * Store adapter for audit persistence.
 *
 * IMPORTANT: implementations MUST run lockChainHead → insert → updateChainHead
 * within a single database transaction. The service calls these sequentially;
 * the store adapter holds the transaction open across all three calls.
 */
export interface AuditStore {
  /** lock chain head row (SELECT ... FOR UPDATE) and return current state */
  lockChainHead(scope: string): Promise<ChainHead | null>;
  /** update chain head after successful insert */
  updateChainHead(scope: string, seq: number, hash: string): Promise<void>;
  /** insert audit log record */
  insert(record: InsertAuditLog): Promise<{ id: string }>;
  /**
   * LLM3-04: aggregate recent access-pattern counts for the anomaly gate.
   * Implementations should return count = 0 and empty-window timestamps
   * when no events match, rather than throwing, so cold-start callers
   * can treat absence as a valid signal.
   *
   * `actions`: optional whitelist. When provided, only rows whose action
   * is in the list are counted. When omitted, ALL actions for the
   * (actor, resourceType) tuple are counted — use this when the caller
   * doesn't know the exact action taxonomy. Needed because PII audit
   * events emit `pii.read`, `pii.read.bulk`, `pii.read.export` etc.,
   * not a single `'read'` action.
   */
  aggregateAccessPattern(params: {
    actor: string;
    resourceType: string;
    actions?: readonly string[];
    windowMs: number;
  }): Promise<{
    actor: string;
    resourceType: string;
    /** representative action label ('any' when no filter applied); for display only */
    action: string;
    count: number;
    windowStart: Date;
    windowEnd: Date;
  }>;
}

// ---------------------------------------------------------------------------
// PII masking configuration
// ---------------------------------------------------------------------------

export interface MaskingConfig {
  /** field names to replace with '[REDACTED]' */
  redactFields: string[];
  /** field names to replace with sha256(salt + value) */
  hashFields: string[];
  /** salt for hashed fields */
  hashSalt: string;
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  redactFields: ['email', 'phone', 'ssn', 'address', 'dateOfBirth'],
  hashFields: [],
  hashSalt: 'aptivo-audit-mask',
};

// ---------------------------------------------------------------------------
// service deps and interface
// ---------------------------------------------------------------------------

export interface AuditServiceDeps {
  store: AuditStore;
  masking: MaskingConfig;
  chainScope?: string; // default: 'global'
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

export interface AuditService {
  emit(event: AuditEventInput): Promise<Result<AuditRecord, AuditError>>;
}
