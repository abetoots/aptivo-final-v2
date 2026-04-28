/**
 * S17-CT-4: GET /api/tickets/reports route tests.
 * @task S17-CT-4
 *
 * Verifies RBAC short-circuit, range parsing + clamping (RFC 7807
 * problem+json on bad inputs), and the success envelope shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReportService = {
  getReport: vi.fn(),
};
const mockCheckPermission = vi.fn();

vi.mock('../../src/lib/services', () => ({
  getTicketReportService: () => mockReportService,
}));

vi.mock('../../src/lib/security/rbac-middleware', () => ({
  checkPermissionWithBlacklist: (perm: string) => async (req: Request) => mockCheckPermission(perm, req),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckPermission.mockResolvedValue(null);
});

describe('S17-CT-4: GET /api/tickets/reports', () => {
  function getReq(query = '') {
    const url = `http://t/api/tickets/reports${query ? `?${query}` : ''}`;
    return new Request(url);
  }

  it('returns 403 when permission middleware rejects', async () => {
    mockCheckPermission.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(mockReportService.getReport).not.toHaveBeenCalled();
  });

  it('uses default 30-day range when no query param is supplied', async () => {
    mockReportService.getReport.mockResolvedValueOnce({ windowDays: 30, openTotal: 0 });
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockReportService.getReport).toHaveBeenCalledWith({ windowDays: 30 });
  });

  it('accepts both "7" and "7d" range formats', async () => {
    mockReportService.getReport.mockResolvedValue({ windowDays: 7, openTotal: 0 });
    const { GET } = await import('../../src/app/api/tickets/reports/route');

    const r1 = await GET(getReq('range=7'));
    expect(r1.status).toBe(200);
    expect(mockReportService.getReport).toHaveBeenLastCalledWith({ windowDays: 7 });

    const r2 = await GET(getReq('range=7d'));
    expect(r2.status).toBe(200);
    expect(mockReportService.getReport).toHaveBeenLastCalledWith({ windowDays: 7 });
  });

  it('rejects malformed range with 400 ticket-report-invalid-range', async () => {
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq('range=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('https://aptivo.dev/errors/ticket-report-invalid-range');
    expect(mockReportService.getReport).not.toHaveBeenCalled();
  });

  it('rejects range=0 with 400', async () => {
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq('range=0'));
    expect(res.status).toBe(400);
    expect(mockReportService.getReport).not.toHaveBeenCalled();
  });

  it('rejects range above the 365-day cap with 400', async () => {
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq('range=400'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('between 1 and 365 days');
    expect(mockReportService.getReport).not.toHaveBeenCalled();
  });

  it('returns 200 with the full report shape wrapped in { data }', async () => {
    // Mirror the real TicketReport shape so the test catches contract
    // drift. Includes all four priority keys + the post-Codex fields:
    // evaluatedClosed, unconfiguredPriorities.
    const emptyByPriority = {
      critical: { totalClosed: 0, avgResolutionMinutes: null },
      high: { totalClosed: 0, avgResolutionMinutes: null },
      medium: { totalClosed: 0, avgResolutionMinutes: null },
      low: { totalClosed: 0, avgResolutionMinutes: null },
    };
    const emptyComplianceByPriority = {
      critical: { totalClosed: 0, withinSlaCount: 0, compliancePct: null },
      high: { totalClosed: 0, withinSlaCount: 0, compliancePct: null },
      medium: { totalClosed: 0, withinSlaCount: 0, compliancePct: null },
      low: { totalClosed: 0, withinSlaCount: 0, compliancePct: null },
    };
    const report = {
      windowDays: 14,
      windowStart: '2026-04-14T12:00:00.000Z',
      windowEnd: '2026-04-28T12:00:00.000Z',
      openByPriority: { critical: 1, high: 2, medium: 0, low: 0 },
      openTotal: 3,
      resolution: { totalClosed: 0, avgResolutionMinutes: null, byPriority: emptyByPriority },
      slaCompliance: {
        totalClosed: 0,
        withinSlaCount: 0,
        evaluatedClosed: 0,
        compliancePct: null,
        unconfiguredPriorities: [],
        byPriority: emptyComplianceByPriority,
      },
    };
    mockReportService.getReport.mockResolvedValueOnce(report);
    const { GET } = await import('../../src/app/api/tickets/reports/route');
    const res = await GET(getReq('range=14d'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(report);
  });
});
