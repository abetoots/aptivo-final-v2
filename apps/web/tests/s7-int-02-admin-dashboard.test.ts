/**
 * S7-INT-02: admin dashboard tests
 * @task S7-INT-02
 *
 * verifies RBAC enforcement, API response shapes, and store integration
 * for the admin overview, audit, and hitl endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock services
// ---------------------------------------------------------------------------

const mockAdminStore = {
  getPendingHitlCount: vi.fn().mockResolvedValue(3),
  getActiveWorkflowCount: vi.fn().mockResolvedValue(7),
  getRecentAuditLogs: vi.fn().mockResolvedValue([
    {
      id: 'audit-1',
      action: 'workflow.complete',
      resourceType: 'workflow',
      resourceId: 'wf-1',
      domain: 'crypto',
      actorType: 'system',
      userId: null,
      timestamp: new Date('2026-03-11T10:00:00Z'),
      metadata: {},
    },
  ]),
  getAuditLogsPaginated: vi.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 50,
  }),
  getHitlRequests: vi.fn().mockResolvedValue([]),
};

const mockMetricService = {
  getWorkflowCounts: vi.fn().mockResolvedValue({ total: 1000, success: 999 }),
  getMcpCallCounts: vi.fn().mockResolvedValue({ total: 200, success: 200 }),
  getHitlLatencyP95: vi.fn().mockResolvedValue(1500),
  getAuditDlqPendingCount: vi.fn().mockResolvedValue(2),
  getRetentionFailureCount: vi.fn().mockResolvedValue(0),
  getNotificationCounts: vi.fn().mockResolvedValue({ total: 100, delivered: 100 }),
};

vi.mock('../src/lib/services', () => ({
  getAdminStore: () => mockAdminStore,
  getMetricService: () => mockMetricService,
}));

vi.mock('../src/lib/security/rbac-middleware', () => ({
  checkPermission: (_permission: string) => async (req: Request) => {
    const role = req.headers.get('x-user-role');
    if (!role) {
      return new Response(JSON.stringify({ status: 403 }), { status: 403 });
    }
    return null;
  },
  checkPermissionWithBlacklist: (_permission: string) => async (req: Request) => {
    const role = req.headers.get('x-user-role');
    if (!role) {
      return new Response(JSON.stringify({ status: 403 }), { status: 403 });
    }
    return null;
  },
}));

// ---------------------------------------------------------------------------
// imports (after mocks)
// ---------------------------------------------------------------------------

import { GET as getOverview } from '../src/app/api/admin/overview/route';
import { GET as getAudit } from '../src/app/api/admin/audit/route';
import { GET as getHitl } from '../src/app/api/admin/hitl/route';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, headers?: Record<string, string>) {
  return new Request(`http://localhost:3000${path}`, {
    headers: { 'x-user-role': 'admin', ...headers },
  });
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // reset defaults
  mockAdminStore.getPendingHitlCount.mockResolvedValue(3);
  mockAdminStore.getActiveWorkflowCount.mockResolvedValue(7);
  mockAdminStore.getRecentAuditLogs.mockResolvedValue([]);
  mockAdminStore.getAuditLogsPaginated.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
  mockAdminStore.getHitlRequests.mockResolvedValue([]);
  mockMetricService.getWorkflowCounts.mockResolvedValue({ total: 1000, success: 999 });
  mockMetricService.getMcpCallCounts.mockResolvedValue({ total: 200, success: 200 });
  mockMetricService.getHitlLatencyP95.mockResolvedValue(1500);
  mockMetricService.getAuditDlqPendingCount.mockResolvedValue(2);
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S7-INT-02: Admin Dashboard', () => {
  // -------------------------------------------------------------------------
  // RBAC enforcement
  // -------------------------------------------------------------------------
  describe('RBAC enforcement', () => {
    it('returns 403 for overview without role', async () => {
      const req = makeRequest('/api/admin/overview', { 'x-user-role': '' });
      // clear the header to simulate no role
      const noRoleReq = new Request('http://localhost:3000/api/admin/overview');
      const res = await getOverview(noRoleReq);
      expect(res.status).toBe(403);
    });

    it('returns 403 for audit without role', async () => {
      const noRoleReq = new Request('http://localhost:3000/api/admin/audit');
      const res = await getAudit(noRoleReq);
      expect(res.status).toBe(403);
    });

    it('returns 403 for hitl without role', async () => {
      const noRoleReq = new Request('http://localhost:3000/api/admin/hitl');
      const res = await getHitl(noRoleReq);
      expect(res.status).toBe(403);
    });

    it('returns 200 for overview with admin role', async () => {
      const req = makeRequest('/api/admin/overview');
      const res = await getOverview(req);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // overview API
  // -------------------------------------------------------------------------
  describe('GET /api/admin/overview', () => {
    it('returns overview with correct shape', async () => {
      const req = makeRequest('/api/admin/overview');
      const res = await getOverview(req);
      const body = await res.json();

      expect(body).toHaveProperty('pendingHitlCount', 3);
      expect(body).toHaveProperty('activeWorkflowCount', 7);
      expect(body).toHaveProperty('recentAuditEvents');
      expect(body).toHaveProperty('sloHealth');
    });

    it('includes SLO health status', async () => {
      const req = makeRequest('/api/admin/overview');
      const res = await getOverview(req);
      const body = await res.json();

      expect(body.sloHealth).toHaveProperty('workflowSuccessRate');
      expect(body.sloHealth).toHaveProperty('mcpSuccessRate');
      expect(body.sloHealth).toHaveProperty('hitlLatencyP95Ms');
      expect(body.sloHealth).toHaveProperty('auditDlqPending');
      expect(body.sloHealth).toHaveProperty('status');
    });

    it('reports healthy status when all SLOs are within thresholds', async () => {
      const req = makeRequest('/api/admin/overview');
      const res = await getOverview(req);
      const body = await res.json();

      expect(body.sloHealth.status).toBe('healthy');
    });

    it('reports degraded status when workflow success rate is low', async () => {
      mockMetricService.getWorkflowCounts.mockResolvedValue({ total: 100, success: 90 });
      const req = makeRequest('/api/admin/overview');
      const res = await getOverview(req);
      const body = await res.json();

      expect(body.sloHealth.status).toBe('degraded');
    });
  });

  // -------------------------------------------------------------------------
  // audit API
  // -------------------------------------------------------------------------
  describe('GET /api/admin/audit', () => {
    it('returns paginated audit logs', async () => {
      mockAdminStore.getAuditLogsPaginated.mockResolvedValue({
        data: [{ id: 'audit-1', action: 'test' }],
        total: 1,
        page: 1,
        limit: 50,
      });

      const req = makeRequest('/api/admin/audit?page=1&limit=50');
      const res = await getAudit(req);
      const body = await res.json();

      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
    });

    it('passes resource filter to store', async () => {
      const req = makeRequest('/api/admin/audit?resource=trade-signal');
      await getAudit(req);

      expect(mockAdminStore.getAuditLogsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'trade-signal' }),
      );
    });

    it('defaults to page 1 and limit 50', async () => {
      const req = makeRequest('/api/admin/audit');
      await getAudit(req);

      expect(mockAdminStore.getAuditLogsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });

    it('clamps limit to 200 max', async () => {
      const req = makeRequest('/api/admin/audit?limit=500');
      await getAudit(req);

      expect(mockAdminStore.getAuditLogsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 200 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // hitl API
  // -------------------------------------------------------------------------
  describe('GET /api/admin/hitl', () => {
    it('returns HITL requests with data and count', async () => {
      mockAdminStore.getHitlRequests.mockResolvedValue([
        { id: 'hitl-1', status: 'pending', summary: 'test' },
      ]);

      const req = makeRequest('/api/admin/hitl?status=pending');
      const res = await getHitl(req);
      const body = await res.json();

      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('count', 1);
    });

    it('passes status filter to store', async () => {
      const req = makeRequest('/api/admin/hitl?status=pending');
      await getHitl(req);

      expect(mockAdminStore.getHitlRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('returns all statuses when no filter', async () => {
      const req = makeRequest('/api/admin/hitl');
      await getHitl(req);

      expect(mockAdminStore.getHitlRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });
});
