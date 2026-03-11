/**
 * S7-INT-03: LLM usage & cost dashboard tests
 * @task S7-INT-03
 * @warning S2-W12
 *
 * verifies rbac enforcement, response shape, alert flags,
 * and budget endpoint calculations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock store — hoisted before route imports
// ---------------------------------------------------------------------------

const mockLlmUsageStore = {
  getCostByDomain: vi.fn().mockResolvedValue([]),
  getCostByProvider: vi.fn().mockResolvedValue([]),
  getDailyTotals: vi.fn().mockResolvedValue([]),
  getDailySpend: vi.fn().mockResolvedValue('0'),
  getMonthlySpend: vi.fn().mockResolvedValue('0'),
  getDomainDailySpend: vi.fn().mockResolvedValue('0'),
  getAlertDomains: vi.fn().mockResolvedValue([]),
};

vi.mock('../src/lib/services', () => ({
  getLlmUsageStore: () => mockLlmUsageStore,
}));

vi.mock('../src/lib/security/rbac-middleware', () => ({
  checkPermission: (permission: string) => async (req: Request) => {
    const role = req.headers.get('x-user-role');
    if (!role || role === 'anonymous') {
      return new Response(
        JSON.stringify({
          type: 'https://aptivo.dev/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: `Missing permission: ${permission}`,
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
    return null;
  },
}));

import { GET as getUsage } from '../src/app/api/admin/llm-usage/route';
import { GET as getBudget } from '../src/app/api/admin/llm-usage/budget/route';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, headers?: Record<string, string>) {
  return new Request(`http://localhost:3000${path}`, {
    headers: { 'x-user-role': 'admin', ...headers },
  });
}

function makeAnonRequest(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // reset defaults
  mockLlmUsageStore.getCostByDomain.mockResolvedValue([]);
  mockLlmUsageStore.getCostByProvider.mockResolvedValue([]);
  mockLlmUsageStore.getDailyTotals.mockResolvedValue([]);
  mockLlmUsageStore.getDailySpend.mockResolvedValue('0');
  mockLlmUsageStore.getMonthlySpend.mockResolvedValue('0');
  mockLlmUsageStore.getDomainDailySpend.mockResolvedValue('0');
  mockLlmUsageStore.getAlertDomains.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// usage endpoint
// ---------------------------------------------------------------------------

describe('S7-INT-03: GET /api/admin/llm-usage', () => {
  it('returns 403 without x-user-role header', async () => {
    const res = await getUsage(makeAnonRequest('/api/admin/llm-usage'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain('Missing permission');
  });

  it('returns 403 for anonymous role', async () => {
    const res = await getUsage(
      makeRequest('/api/admin/llm-usage', { 'x-user-role': 'anonymous' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 with correct shape for admin', async () => {
    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('range');
    expect(body).toHaveProperty('totalCost');
    expect(body).toHaveProperty('costByDomain');
    expect(body).toHaveProperty('costByProvider');
    expect(body).toHaveProperty('dailyTotals');
    expect(body).toHaveProperty('alerts');
    expect(body.alerts).toHaveProperty('threshold');
    expect(body.alerts).toHaveProperty('domainsExceeding');
    expect(body.alerts).toHaveProperty('hasAlerts');
  });

  it('defaults to 30d range when no query param', async () => {
    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();
    expect(body.range).toBe('30d');
  });

  it('passes custom range to store methods', async () => {
    const res = await getUsage(makeRequest('/api/admin/llm-usage?range=7d'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.range).toBe('7d');

    // verify store was called with 7-day window
    const expectedMs = 7 * 24 * 60 * 60 * 1000;
    expect(mockLlmUsageStore.getCostByDomain).toHaveBeenCalledWith(expectedMs);
    expect(mockLlmUsageStore.getCostByProvider).toHaveBeenCalledWith(expectedMs);
    expect(mockLlmUsageStore.getDailyTotals).toHaveBeenCalledWith(7);
  });

  it('returns costByDomain and costByProvider arrays', async () => {
    mockLlmUsageStore.getCostByDomain.mockResolvedValue([
      { domain: 'crypto', totalCost: '12.500000', requestCount: 50 },
      { domain: 'hr', totalCost: '3.200000', requestCount: 20 },
    ]);
    mockLlmUsageStore.getCostByProvider.mockResolvedValue([
      { provider: 'openai', model: 'gpt-4o', totalCost: '10.000000', requestCount: 30 },
      { provider: 'anthropic', model: 'claude-3', totalCost: '5.700000', requestCount: 40 },
    ]);

    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();

    expect(body.costByDomain).toHaveLength(2);
    expect(body.costByDomain[0].domain).toBe('crypto');
    expect(body.costByProvider).toHaveLength(2);
    expect(body.costByProvider[0].provider).toBe('openai');
  });

  it('computes totalCost from domain breakdown', async () => {
    mockLlmUsageStore.getCostByDomain.mockResolvedValue([
      { domain: 'crypto', totalCost: '10.000000', requestCount: 50 },
      { domain: 'hr', totalCost: '5.500000', requestCount: 20 },
    ]);

    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();

    expect(parseFloat(body.totalCost)).toBeCloseTo(15.5, 4);
  });

  it('sets alerts.hasAlerts true when domains exceed threshold', async () => {
    mockLlmUsageStore.getAlertDomains.mockResolvedValue(['crypto', 'hr']);

    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();

    expect(body.alerts.hasAlerts).toBe(true);
    expect(body.alerts.domainsExceeding).toEqual(['crypto', 'hr']);
  });

  it('sets alerts.hasAlerts false when no domains exceed threshold', async () => {
    mockLlmUsageStore.getAlertDomains.mockResolvedValue([]);

    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();

    expect(body.alerts.hasAlerts).toBe(false);
    expect(body.alerts.domainsExceeding).toEqual([]);
  });

  it('returns dailyTotals from store', async () => {
    mockLlmUsageStore.getDailyTotals.mockResolvedValue([
      { date: '2026-03-10', totalCost: '2.500000', requestCount: 15 },
      { date: '2026-03-11', totalCost: '3.100000', requestCount: 20 },
    ]);

    const res = await getUsage(makeRequest('/api/admin/llm-usage'));
    const body = await res.json();

    expect(body.dailyTotals).toHaveLength(2);
    expect(body.dailyTotals[0].date).toBe('2026-03-10');
    expect(body.dailyTotals[1].requestCount).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// budget endpoint
// ---------------------------------------------------------------------------

describe('S7-INT-03: GET /api/admin/llm-usage/budget', () => {
  it('returns 403 without x-user-role header', async () => {
    const res = await getBudget(makeAnonRequest('/api/admin/llm-usage/budget'));
    expect(res.status).toBe(403);
  });

  it('returns 200 with correct shape for admin', async () => {
    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('daily');
    expect(body).toHaveProperty('monthly');
    expect(body).toHaveProperty('burnRate');
    expect(body).toHaveProperty('alerts');
    expect(body.daily).toHaveProperty('spend');
    expect(body.daily).toHaveProperty('limit');
    expect(body.daily).toHaveProperty('pctUsed');
    expect(body.monthly).toHaveProperty('spend');
    expect(body.monthly).toHaveProperty('limit');
    expect(body.monthly).toHaveProperty('pctUsed');
  });

  it('returns daily/monthly spend from store', async () => {
    mockLlmUsageStore.getDailySpend.mockResolvedValue('12.340000');
    mockLlmUsageStore.getMonthlySpend.mockResolvedValue('156.780000');

    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    const body = await res.json();

    expect(body.daily.spend).toBe('12.340000');
    expect(body.monthly.spend).toBe('156.780000');
  });

  it('calculates pctUsed against limits', async () => {
    mockLlmUsageStore.getDailySpend.mockResolvedValue('25.000000');
    mockLlmUsageStore.getMonthlySpend.mockResolvedValue('500.000000');

    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    const body = await res.json();

    // 25/50 = 50%, 500/1000 = 50%
    expect(body.daily.pctUsed).toBe('50.0');
    expect(body.monthly.pctUsed).toBe('50.0');
  });

  it('includes burn rate calculation', async () => {
    mockLlmUsageStore.getMonthlySpend.mockResolvedValue('110.000000');

    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    const body = await res.json();

    // burn rate = monthlySpend / dayOfMonth
    const dayOfMonth = new Date().getDate();
    const expectedBurnRate = (110 / dayOfMonth).toFixed(2);
    expect(body.burnRate).toBe(expectedBurnRate);
  });

  it('includes alert domains in budget response', async () => {
    mockLlmUsageStore.getAlertDomains.mockResolvedValue(['crypto']);

    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    const body = await res.json();

    expect(body.alerts.hasAlerts).toBe(true);
    expect(body.alerts.domainsExceeding).toEqual(['crypto']);
  });

  it('returns daily limit of $50 and monthly limit of $1000', async () => {
    const res = await getBudget(makeRequest('/api/admin/llm-usage/budget'));
    const body = await res.json();

    expect(body.daily.limit).toBe(50);
    expect(body.monthly.limit).toBe(1000);
  });
});
