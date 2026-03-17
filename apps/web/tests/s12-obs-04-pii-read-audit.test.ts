/**
 * S12-OBS-04: PII Read Audit Trail
 * @task OBS-04
 *
 * verifies pii field registry, pii read audit emission, bulk reads,
 * non-pii filtering, withPiiReadAudit HOF behavior, custom overrides,
 * and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPiiReadAuditMiddleware,
  createPiiFieldRegistry,
  withPiiReadAudit,
  DEFAULT_PII_FIELDS,
} from '@aptivo/audit/middleware';
import type { PiiReadAuditDeps } from '@aptivo/audit/middleware';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockDeps(): PiiReadAuditDeps & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// pii field registry
// ---------------------------------------------------------------------------

describe('OBS-04: pii field registry', () => {
  it('returns correct fields for candidate resource type', () => {
    const registry = createPiiFieldRegistry();
    const fields = registry.getFields('candidate');
    expect(fields).toEqual(['email', 'phone', 'ssn', 'dateOfBirth', 'address']);
  });

  it('returns correct fields for employee resource type', () => {
    const registry = createPiiFieldRegistry();
    const fields = registry.getFields('employee');
    expect(fields).toEqual(['email', 'phone', 'ssn', 'salary', 'bankAccount']);
  });

  it('returns correct fields for contract resource type', () => {
    const registry = createPiiFieldRegistry();
    const fields = registry.getFields('contract');
    expect(fields).toEqual(['salary', 'benefits', 'personalTerms']);
  });

  it('returns empty array for unknown resource type', () => {
    const registry = createPiiFieldRegistry();
    const fields = registry.getFields('nonexistent');
    expect(fields).toEqual([]);
  });

  it('custom overrides extend and replace defaults', () => {
    const registry = createPiiFieldRegistry({
      candidate: ['email', 'customField'],
      newType: ['secret'],
    });
    expect(registry.getFields('candidate')).toEqual(['email', 'customField']);
    expect(registry.getFields('newType')).toEqual(['secret']);
    // employee unchanged
    expect(registry.getFields('employee')).toEqual(DEFAULT_PII_FIELDS.employee);
  });
});

// ---------------------------------------------------------------------------
// single pii read audit
// ---------------------------------------------------------------------------

describe('OBS-04: auditPiiRead', () => {
  it('emits pii.read action when pii fields are accessed', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiRead(
      'user-1',
      { type: 'candidate', id: 'cand-123' },
      ['email', 'phone', 'name'],
    );

    expect(result.ok).toBe(true);
    expect(deps.emit).toHaveBeenCalledTimes(1);
    expect(deps.emit).toHaveBeenCalledWith({
      action: 'pii.read',
      actor: 'user-1',
      resource: { type: 'candidate', id: 'cand-123' },
      metadata: { accessedFields: ['email', 'phone'] },
    });
  });

  it('filters out non-pii fields from the audit event', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    await middleware.auditPiiRead(
      'user-1',
      { type: 'candidate', id: 'cand-1' },
      ['email', 'name', 'status', 'phone'],
    );

    const emittedMetadata = deps.emit.mock.calls[0]![0].metadata;
    // only pii fields should appear
    expect(emittedMetadata.accessedFields).toEqual(['email', 'phone']);
    expect(emittedMetadata.accessedFields).not.toContain('name');
    expect(emittedMetadata.accessedFields).not.toContain('status');
  });

  it('does not emit when no pii fields are accessed', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiRead(
      'user-1',
      { type: 'candidate', id: 'cand-1' },
      ['name', 'status', 'title'],
    );

    expect(result.ok).toBe(true);
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('does not emit for unknown resource types with no pii fields', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiRead(
      'user-1',
      { type: 'settings', id: 'set-1' },
      ['theme', 'language'],
    );

    expect(result.ok).toBe(true);
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('returns AuditEmitError when emit fails', async () => {
    const deps = createMockDeps();
    const error = new Error('network failure');
    deps.emit.mockRejectedValueOnce(error);
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiRead(
      'user-1',
      { type: 'candidate', id: 'cand-1' },
      ['email'],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('AuditEmitError');
      expect(result.error.cause).toBe(error);
    }
  });
});

// ---------------------------------------------------------------------------
// bulk pii read audit
// ---------------------------------------------------------------------------

describe('OBS-04: auditPiiReadBulk', () => {
  it('emits pii.read.bulk with record count', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiReadBulk('user-2', 'candidate', 42);

    expect(result.ok).toBe(true);
    expect(deps.emit).toHaveBeenCalledWith({
      action: 'pii.read.bulk',
      actor: 'user-2',
      resource: { type: 'candidate', id: 'bulk' },
      metadata: { recordCount: 42 },
    });
  });

  it('returns AuditEmitError on bulk emit failure', async () => {
    const deps = createMockDeps();
    deps.emit.mockRejectedValueOnce(new Error('timeout'));
    const middleware = createPiiReadAuditMiddleware(deps);

    const result = await middleware.auditPiiReadBulk('user-1', 'employee', 10);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('AuditEmitError');
    }
  });
});

// ---------------------------------------------------------------------------
// withPiiReadAudit hof
// ---------------------------------------------------------------------------

describe('OBS-04: withPiiReadAudit HOF', () => {
  it('emits audit event after successful handler response', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withPiiReadAudit(
      handler,
      'candidate',
      ['email', 'phone'],
      middleware,
      () => 'actor-1',
    );

    const response = await wrapped(new Request('http://localhost/api/candidates'));
    expect(response.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    // allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.emit).toHaveBeenCalledTimes(1);
  });

  it('skips audit when handler returns error response', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const handler = vi.fn(async () => new Response('not found', { status: 404 }));
    const wrapped = withPiiReadAudit(
      handler,
      'candidate',
      ['email'],
      middleware,
      () => 'actor-1',
    );

    const response = await wrapped(new Request('http://localhost/api/candidates'));
    expect(response.ok).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('skips audit when actor is null', async () => {
    const deps = createMockDeps();
    const middleware = createPiiReadAuditMiddleware(deps);

    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withPiiReadAudit(
      handler,
      'candidate',
      ['email'],
      middleware,
      () => null,
    );

    await wrapped(new Request('http://localhost/api/candidates'));
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.emit).not.toHaveBeenCalled();
  });

  it('does not block response on audit failure', async () => {
    const deps = createMockDeps();
    deps.emit.mockRejectedValueOnce(new Error('audit down'));
    const middleware = createPiiReadAuditMiddleware(deps);

    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withPiiReadAudit(
      handler,
      'candidate',
      ['email'],
      middleware,
      () => 'actor-1',
    );

    // should resolve without throwing
    const response = await wrapped(new Request('http://localhost/api/candidates'));
    expect(response.ok).toBe(true);
  });
});
