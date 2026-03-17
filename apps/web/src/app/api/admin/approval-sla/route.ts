/**
 * OPS-01: Approval SLA Dashboard API
 * @task OPS-01
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getApprovalSlaService } from '../../../../lib/services';

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const filters: { from?: Date; to?: Date } = {};
  if (from) filters.from = new Date(from);
  if (to) filters.to = new Date(to);

  const service = getApprovalSlaService();
  const result = await service.getDashboard(filters);

  if (!result.ok) {
    return NextResponse.json(
      {
        type: 'https://aptivo.dev/errors/internal',
        title: 'SLA Dashboard Error',
        status: 500,
        detail: 'Failed to compute approval SLA dashboard',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value });
}
