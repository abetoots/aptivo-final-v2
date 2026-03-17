/**
 * S12-OBS-02: Audit Query & Export Service
 * @task OBS-02
 *
 * verifies query filtering, pagination clamping, csv/json export,
 * sha-256 checksum integrity, and empty result handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createAuditQueryService } from '@aptivo/audit/query';
import type { AuditQueryStore, AuditLogRecord, AuditQueryFilters, AuditQueryPagination } from '@aptivo/audit/query';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    actor: overrides.actor ?? 'user-1',
    action: overrides.action ?? 'read',
    resource: overrides.resource ?? 'document',
    domain: overrides.domain ?? 'core',
    metadata: overrides.metadata,
    previousHash: overrides.previousHash ?? 'abc123',
    currentHash: overrides.currentHash ?? 'def456',
    createdAt: overrides.createdAt ?? new Date('2026-01-15T10:00:00Z'),
  };
}

function createMockStore(records: AuditLogRecord[] = []): AuditQueryStore {
  return {
    query: vi.fn(async (filters: AuditQueryFilters, pagination: AuditQueryPagination) => {
      let filtered = [...records];

      if (filters.resourceType) filtered = filtered.filter((r) => r.resource === filters.resourceType);
      if (filters.actorId) filtered = filtered.filter((r) => r.actor === filters.actorId);
      if (filters.action) filtered = filtered.filter((r) => r.action === filters.action);
      if (filters.domain) filtered = filtered.filter((r) => r.domain === filters.domain);
      if (filters.from) filtered = filtered.filter((r) => r.createdAt >= filters.from!);
      if (filters.to) filtered = filtered.filter((r) => r.createdAt <= filters.to!);

      return filtered.slice(pagination.offset, pagination.offset + pagination.limit);
    }),
    count: vi.fn(async (filters: AuditQueryFilters) => {
      let filtered = [...records];

      if (filters.resourceType) filtered = filtered.filter((r) => r.resource === filters.resourceType);
      if (filters.actorId) filtered = filtered.filter((r) => r.actor === filters.actorId);
      if (filters.action) filtered = filtered.filter((r) => r.action === filters.action);
      if (filters.domain) filtered = filtered.filter((r) => r.domain === filters.domain);
      if (filters.from) filtered = filtered.filter((r) => r.createdAt >= filters.from!);
      if (filters.to) filtered = filtered.filter((r) => r.createdAt <= filters.to!);

      return filtered.length;
    }),
  };
}

// ---------------------------------------------------------------------------
// query filtering
// ---------------------------------------------------------------------------

describe('OBS-02: audit query — filtering', () => {
  const records = [
    makeRecord({ actor: 'user-1', action: 'read', resource: 'document', domain: 'core' }),
    makeRecord({ actor: 'user-2', action: 'write', resource: 'contract', domain: 'hr' }),
    makeRecord({ actor: 'user-1', action: 'delete', resource: 'trade', domain: 'crypto' }),
    makeRecord({ actor: 'user-3', action: 'read', resource: 'document', domain: 'core' }),
  ];

  it('filters by resourceType', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({ resourceType: 'document' }, { limit: 100, offset: 0 });
    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.resource === 'document')).toBe(true);
  });

  it('filters by actorId', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({ actorId: 'user-1' }, { limit: 100, offset: 0 });
    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.actor === 'user-1')).toBe(true);
  });

  it('filters by action', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({ action: 'write' }, { limit: 100, offset: 0 });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.action).toBe('write');
  });

  it('filters by domain', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({ domain: 'crypto' }, { limit: 100, offset: 0 });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.domain).toBe('crypto');
  });

  it('filters by date range (from)', async () => {
    const earlyRecord = makeRecord({ createdAt: new Date('2025-01-01T00:00:00Z') });
    const lateRecord = makeRecord({ createdAt: new Date('2026-06-01T00:00:00Z') });
    const store = createMockStore([earlyRecord, lateRecord]);
    const service = createAuditQueryService({ store });

    const result = await service.query(
      { from: new Date('2026-01-01T00:00:00Z') },
      { limit: 100, offset: 0 },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.createdAt).toEqual(lateRecord.createdAt);
  });

  it('filters by date range (to)', async () => {
    const earlyRecord = makeRecord({ createdAt: new Date('2025-01-01T00:00:00Z') });
    const lateRecord = makeRecord({ createdAt: new Date('2026-06-01T00:00:00Z') });
    const store = createMockStore([earlyRecord, lateRecord]);
    const service = createAuditQueryService({ store });

    const result = await service.query(
      { to: new Date('2025-12-31T23:59:59Z') },
      { limit: 100, offset: 0 },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.createdAt).toEqual(earlyRecord.createdAt);
  });

  it('returns empty records when no filters match', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({ domain: 'nonexistent' }, { limit: 100, offset: 0 });
    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pagination
// ---------------------------------------------------------------------------

describe('OBS-02: audit query — pagination', () => {
  const records = Array.from({ length: 10 }, (_, i) =>
    makeRecord({ id: `record-${i}`, actor: `user-${i}` }),
  );

  it('clamps limit to 500 when requested limit exceeds', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    await service.query({}, { limit: 1000, offset: 0 });
    expect(store.query).toHaveBeenCalledWith({}, { limit: 500, offset: 0 });
  });

  it('clamps limit to 1 when requested limit is 0', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    await service.query({}, { limit: 0, offset: 0 });
    expect(store.query).toHaveBeenCalledWith({}, { limit: 1, offset: 0 });
  });

  it('clamps negative limit to 1', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    await service.query({}, { limit: -5, offset: 0 });
    expect(store.query).toHaveBeenCalledWith({}, { limit: 1, offset: 0 });
  });

  it('clamps negative offset to 0', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    await service.query({}, { limit: 10, offset: -3 });
    expect(store.query).toHaveBeenCalledWith({}, { limit: 10, offset: 0 });
  });

  it('reports hasMore=true when more records exist', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({}, { limit: 5, offset: 0 });
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(10);
    expect(result.records).toHaveLength(5);
  });

  it('reports hasMore=false when all records returned', async () => {
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.query({}, { limit: 100, offset: 0 });
    expect(result.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// csv export
// ---------------------------------------------------------------------------

describe('OBS-02: audit export — csv', () => {
  it('exports csv with header row and data rows', async () => {
    const record = makeRecord({
      id: 'rec-1',
      actor: 'user-1',
      action: 'read',
      resource: 'document',
      domain: 'core',
      createdAt: new Date('2026-03-01T12:00:00Z'),
    });
    const store = createMockStore([record]);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'csv');
    expect(result.format).toBe('csv');
    expect(result.recordCount).toBe(1);

    const lines = result.data.split('\r\n');
    expect(lines[0]).toBe('id,actor,action,resource,domain,metadata,previousHash,currentHash,createdAt');
    expect(lines[1]).toContain('rec-1');
    expect(lines[1]).toContain('user-1');
    expect(lines[1]).toContain('2026-03-01');
  });

  it('escapes csv fields containing commas', async () => {
    const record = makeRecord({
      metadata: { note: 'hello, world' },
    });
    const store = createMockStore([record]);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'csv');
    // metadata field contains a comma from json, so it should be quoted
    expect(result.data).toContain('"');
  });

  it('computes valid sha-256 checksum for csv', async () => {
    const records = [makeRecord(), makeRecord()];
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'csv');
    const recomputed = createHash('sha256').update(result.data).digest('hex');
    expect(result.checksum).toBe(recomputed);
  });
});

// ---------------------------------------------------------------------------
// json export
// ---------------------------------------------------------------------------

describe('OBS-02: audit export — json', () => {
  it('exports json array of records', async () => {
    const records = [makeRecord({ id: 'j-1' }), makeRecord({ id: 'j-2' })];
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'json');
    expect(result.format).toBe('json');
    expect(result.recordCount).toBe(2);

    const parsed = JSON.parse(result.data);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('j-1');
    expect(parsed[1].id).toBe('j-2');
  });

  it('computes valid sha-256 checksum for json', async () => {
    const records = [makeRecord()];
    const store = createMockStore(records);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'json');
    const recomputed = createHash('sha256').update(result.data).digest('hex');
    expect(result.checksum).toBe(recomputed);
  });

  it('exports empty array for no matching records', async () => {
    const store = createMockStore([]);
    const service = createAuditQueryService({ store });

    const result = await service.exportAuditLogs({}, 'json');
    expect(result.recordCount).toBe(0);
    expect(JSON.parse(result.data)).toEqual([]);
  });
});
