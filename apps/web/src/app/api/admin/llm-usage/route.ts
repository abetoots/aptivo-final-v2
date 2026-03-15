/**
 * S7-INT-03: LLM usage & cost API
 * @task S7-INT-03
 * @warning S2-W12
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '../../../../lib/security/rbac-middleware';
import { getLlmUsageStore } from '../../../../lib/services';

const ALERT_THRESHOLD_USD = 5; // per-domain daily threshold (S2-W12)

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermission('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const range = url.searchParams.get('range') ?? '30d';

  // parse range to ms — clamp to [1, 365] to prevent negative or unbounded queries
  const days = Math.min(365, Math.max(1, parseInt(range, 10) || 30));
  const windowMs = days * 24 * 60 * 60 * 1000;

  const store = getLlmUsageStore();
  const [byDomain, byProvider, dailyTotals, alertDomains] = await Promise.all([
    store.getCostByDomain(windowMs),
    store.getCostByProvider(windowMs),
    store.getDailyTotals(days),
    store.getAlertDomains(ALERT_THRESHOLD_USD),
  ]);

  // compute total cost
  const totalCost = byDomain.reduce((sum, d) => sum + parseFloat(d.totalCost), 0);

  return NextResponse.json({
    range,
    totalCost: totalCost.toFixed(6),
    costByDomain: byDomain,
    costByProvider: byProvider,
    dailyTotals,
    alerts: {
      threshold: ALERT_THRESHOLD_USD,
      domainsExceeding: alertDomains,
      hasAlerts: alertDomains.length > 0,
    },
  });
}
