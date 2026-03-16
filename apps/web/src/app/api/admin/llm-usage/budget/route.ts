/**
 * S7-INT-03: LLM budget status API
 * @task S7-INT-03
 * @warning S2-W12
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../../lib/security/rbac-middleware';
import { getLlmUsageStore } from '../../../../../lib/services';

const DAILY_LIMIT_USD = 50;
const MONTHLY_LIMIT_USD = 1000;
const ALERT_THRESHOLD_USD = 5;

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const store = getLlmUsageStore();
  const [dailySpend, monthlySpend, alertDomains] = await Promise.all([
    store.getDailySpend(),
    store.getMonthlySpend(),
    store.getAlertDomains(ALERT_THRESHOLD_USD),
  ]);

  const dailySpendNum = parseFloat(dailySpend);
  const monthlySpendNum = parseFloat(monthlySpend);

  // calculate burn rate (daily average for current month)
  const dayOfMonth = new Date().getDate();
  const burnRate = dayOfMonth > 0 ? monthlySpendNum / dayOfMonth : 0;

  return NextResponse.json({
    daily: {
      spend: dailySpend,
      limit: DAILY_LIMIT_USD,
      pctUsed: ((dailySpendNum / DAILY_LIMIT_USD) * 100).toFixed(1),
    },
    monthly: {
      spend: monthlySpend,
      limit: MONTHLY_LIMIT_USD,
      pctUsed: ((monthlySpendNum / MONTHLY_LIMIT_USD) * 100).toFixed(1),
    },
    burnRate: burnRate.toFixed(2),
    alerts: {
      threshold: ALERT_THRESHOLD_USD,
      domainsExceeding: alertDomains,
      hasAlerts: alertDomains.length > 0,
    },
  });
}
