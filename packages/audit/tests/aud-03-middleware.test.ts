/**
 * AUD-03: Audit middleware tests
 * @task AUD-03, AUD-05
 *
 * Tests:
 * - POST/PATCH/DELETE produce audit events
 * - GET does not produce audit events
 * - HITL decision emits correct audit action + metadata
 * - RBAC role change emits correct audit action + metadata
 * - Audit failures are non-blocking (fire-and-forget)
 * - Action mapper produces correct action strings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { createAuditMiddleware } from '../src/middleware/audit-middleware.js';
import { mapHttpAction, AUDIT_ACTIONS } from '../src/middleware/action-mapper.js';
import type { AuditService } from '../src/types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockAuditService(overrides?: Partial<AuditService>): AuditService {
  return {
    emit: vi.fn().mockResolvedValue(Result.ok({
      id: 'audit-001',
      previousHash: '0'.repeat(64),
      currentHash: 'a'.repeat(64),
      sequence: 1,
      timestamp: new Date(),
    })),
    ...overrides,
  };
}

// need to flush microtasks for fire-and-forget
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// mapHttpAction
// ---------------------------------------------------------------------------

describe('mapHttpAction', () => {
  it('maps POST to create action', () => {
    expect(mapHttpAction('POST', 'user')).toBe('user.create');
  });

  it('maps PUT to update action', () => {
    expect(mapHttpAction('PUT', 'user')).toBe('user.update');
  });

  it('maps PATCH to update action', () => {
    expect(mapHttpAction('PATCH', 'setting')).toBe('setting.update');
  });

  it('maps DELETE to delete action', () => {
    expect(mapHttpAction('DELETE', 'file')).toBe('file.delete');
  });

  it('returns null for GET', () => {
    expect(mapHttpAction('GET')).toBeNull();
  });

  it('returns null for HEAD', () => {
    expect(mapHttpAction('HEAD')).toBeNull();
  });

  it('returns null for OPTIONS', () => {
    expect(mapHttpAction('OPTIONS')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(mapHttpAction('post', 'item')).toBe('item.create');
  });

  it('uses default route when not provided', () => {
    expect(mapHttpAction('POST')).toBe('resource.create');
  });
});

// ---------------------------------------------------------------------------
// AUDIT_ACTIONS constants
// ---------------------------------------------------------------------------

describe('AUDIT_ACTIONS', () => {
  it('has HITL decision actions', () => {
    expect(AUDIT_ACTIONS.HITL_DECISION_APPROVED).toBe('hitl.decision.approved');
    expect(AUDIT_ACTIONS.HITL_DECISION_REJECTED).toBe('hitl.decision.rejected');
  });

  it('has RBAC actions', () => {
    expect(AUDIT_ACTIONS.RBAC_ROLE_GRANTED).toBe('rbac.role.granted');
    expect(AUDIT_ACTIONS.RBAC_ROLE_REVOKED).toBe('rbac.role.revoked');
  });
});

// ---------------------------------------------------------------------------
// createAuditMiddleware
// ---------------------------------------------------------------------------

describe('createAuditMiddleware', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = createMockAuditService();
  });

  // -- auditRequest --

  it('emits audit event for POST request', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRequest({
      method: 'POST',
      route: 'user',
      actor: { id: 'user-1', type: 'user' },
      resource: { type: 'user', id: 'user-2' },
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'user-1', type: 'user' },
        action: 'user.create',
        resource: { type: 'user', id: 'user-2' },
      }),
    );
  });

  it('emits audit event for DELETE request', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRequest({
      method: 'DELETE',
      route: 'file',
      actor: { id: 'user-1', type: 'user' },
      resource: { type: 'file', id: 'file-1' },
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'file.delete' }),
    );
  });

  it('does not emit for GET request', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRequest({
      method: 'GET',
      actor: { id: 'user-1', type: 'user' },
      resource: { type: 'user', id: 'user-2' },
    });
    await flushPromises();

    expect(auditService.emit).not.toHaveBeenCalled();
  });

  it('includes ipAddress and userAgent', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRequest({
      method: 'PATCH',
      route: 'profile',
      actor: { id: 'user-1', type: 'user' },
      resource: { type: 'profile', id: 'p-1' },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }),
    );
  });

  it('is non-blocking when audit fails', async () => {
    const failingService = createMockAuditService({
      emit: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const logger = { warn: vi.fn() };
    const middleware = createAuditMiddleware(failingService, logger);

    // should not throw
    middleware.auditRequest({
      method: 'POST',
      actor: { id: 'u1', type: 'user' },
      resource: { type: 'test', id: 't1' },
    });
    await flushPromises();

    expect(logger.warn).toHaveBeenCalledWith(
      'audit middleware: emit threw unexpectedly',
      expect.any(Object),
    );
  });

  it('logs when emit returns Result.err', async () => {
    const failingService = createMockAuditService({
      emit: vi.fn().mockResolvedValue(Result.err({
        _tag: 'PersistenceError',
        operation: 'emit',
        cause: new Error('fail'),
      })),
    });
    const logger = { warn: vi.fn() };
    const middleware = createAuditMiddleware(failingService, logger);

    middleware.auditRequest({
      method: 'POST',
      actor: { id: 'u1', type: 'user' },
      resource: { type: 'test', id: 't1' },
    });
    await flushPromises();

    expect(logger.warn).toHaveBeenCalledWith(
      'audit middleware: emit returned error',
      expect.objectContaining({ error: 'PersistenceError' }),
    );
  });

  // -- auditHitlDecision --

  it('emits HITL approval audit event', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditHitlDecision({
      requestId: 'req-1',
      approverId: 'approver-1',
      decision: 'approved',
      comment: 'Looks good',
      originalSummary: 'Deploy v2',
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'approver-1', type: 'user' },
        action: 'hitl.decision.approved',
        resource: { type: 'hitl-request', id: 'req-1' },
        metadata: expect.objectContaining({
          decision: 'approved',
          comment: 'Looks good',
          originalSummary: 'Deploy v2',
        }),
      }),
    );
  });

  it('emits HITL rejection audit event', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditHitlDecision({
      requestId: 'req-2',
      approverId: 'approver-2',
      decision: 'rejected',
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'hitl.decision.rejected',
      }),
    );
  });

  // -- auditRbacChange --

  it('emits RBAC role grant audit event', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRbacChange({
      granterId: 'admin-1',
      granteeId: 'user-1',
      role: 'hitl:approver',
      domain: 'hr',
      action: 'grant',
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { id: 'admin-1', type: 'user' },
        action: 'rbac.role.granted',
        resource: { type: 'user-role', id: 'user-1' },
        domain: 'hr',
        metadata: expect.objectContaining({
          role: 'hitl:approver',
          granteeId: 'user-1',
          action: 'grant',
        }),
      }),
    );
  });

  it('emits RBAC role revoke audit event', async () => {
    const middleware = createAuditMiddleware(auditService);
    middleware.auditRbacChange({
      granterId: 'admin-1',
      granteeId: 'user-1',
      role: 'admin',
      action: 'revoke',
    });
    await flushPromises();

    expect(auditService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac.role.revoked',
      }),
    );
  });
});
