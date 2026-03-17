/**
 * OBS-02: Audit query & export types
 * @task OBS-02
 * @guidelines §2.1 (Result types, tagged union errors)
 */

// ---------------------------------------------------------------------------
// query filters
// ---------------------------------------------------------------------------

export interface AuditQueryFilters {
  resourceType?: string;
  actorId?: string;
  action?: string;
  domain?: string;
  from?: Date;
  to?: Date;
}

// ---------------------------------------------------------------------------
// pagination
// ---------------------------------------------------------------------------

export interface AuditQueryPagination {
  limit: number; // clamped to 500
  offset: number;
}

// ---------------------------------------------------------------------------
// records
// ---------------------------------------------------------------------------

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  resource: string;
  domain: string;
  metadata?: Record<string, unknown>;
  previousHash?: string;
  currentHash?: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// result shapes
// ---------------------------------------------------------------------------

export interface AuditQueryResult {
  records: AuditLogRecord[];
  total: number;
  hasMore: boolean;
}

export interface AuditExportResult {
  data: string;
  checksum: string; // sha-256
  recordCount: number;
  format: 'csv' | 'json';
}

// ---------------------------------------------------------------------------
// store interface (db-decoupled)
// ---------------------------------------------------------------------------

export interface AuditQueryStore {
  query(filters: AuditQueryFilters, pagination: AuditQueryPagination): Promise<AuditLogRecord[]>;
  count(filters: AuditQueryFilters): Promise<number>;
}
