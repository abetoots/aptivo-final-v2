/**
 * OBS-02: Audit query & export service
 * @task OBS-02
 * @guidelines §2.1 (Functional core — factory pattern, Result types)
 *
 * createAuditQueryService(deps) — queries and exports audit logs with
 * pagination clamping and sha-256 checksum integrity.
 */

import { createHash } from 'node:crypto';
import type {
  AuditQueryStore,
  AuditQueryFilters,
  AuditQueryPagination,
  AuditQueryResult,
  AuditExportResult,
  AuditLogRecord,
} from './query-types.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const MAX_LIMIT = 500;

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface AuditQueryServiceDeps {
  store: AuditQueryStore;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createAuditQueryService(deps: AuditQueryServiceDeps) {
  const { store } = deps;

  return {
    /**
     * query audit logs with clamped pagination.
     * limit is clamped to 500 regardless of caller input.
     */
    async query(
      filters: AuditQueryFilters,
      pagination: AuditQueryPagination,
    ): Promise<AuditQueryResult> {
      const clampedLimit = Math.min(Math.max(pagination.limit, 1), MAX_LIMIT);
      const clampedPagination: AuditQueryPagination = {
        limit: clampedLimit,
        offset: Math.max(pagination.offset, 0),
      };

      const [records, total] = await Promise.all([
        store.query(filters, clampedPagination),
        store.count(filters),
      ]);

      return {
        records,
        total,
        hasMore: clampedPagination.offset + records.length < total,
      };
    },

    /**
     * export audit logs matching filters in csv or json format.
     * fetches all matching records (paginated internally) and computes
     * a sha-256 checksum over the formatted output.
     */
    async exportAuditLogs(
      filters: AuditQueryFilters,
      format: 'csv' | 'json',
    ): Promise<AuditExportResult> {
      // fetch all records in batches
      const allRecords: AuditLogRecord[] = [];
      let offset = 0;
      const batchSize = MAX_LIMIT;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await store.query(filters, { limit: batchSize, offset });
        allRecords.push(...batch);
        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      const data = format === 'csv'
        ? formatCsv(allRecords)
        : formatJson(allRecords);

      const checksum = createHash('sha256').update(data).digest('hex');

      return {
        data,
        checksum,
        recordCount: allRecords.length,
        format,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------

/** rfc 4180 csv with header row */
function formatCsv(records: AuditLogRecord[]): string {
  const headers = ['id', 'actor', 'action', 'resource', 'domain', 'metadata', 'previousHash', 'currentHash', 'createdAt'];
  const lines = [headers.join(',')];

  for (const record of records) {
    const row = [
      escapeCsvField(record.id),
      escapeCsvField(record.actor),
      escapeCsvField(record.action),
      escapeCsvField(record.resource),
      escapeCsvField(record.domain),
      escapeCsvField(record.metadata ? JSON.stringify(record.metadata) : ''),
      escapeCsvField(record.previousHash ?? ''),
      escapeCsvField(record.currentHash ?? ''),
      escapeCsvField(record.createdAt.toISOString()),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

/** rfc 4180: wrap in quotes if field contains comma, quote, or newline */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** json export — JSON.stringify of the records array */
function formatJson(records: AuditLogRecord[]): string {
  return JSON.stringify(records);
}
