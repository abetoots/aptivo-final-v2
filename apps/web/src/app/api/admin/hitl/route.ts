/**
 * S7-INT-02: HITL request listing API
 * @task S7-INT-02
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getAdminStore } from '../../../../lib/services';

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));

  const adminStore = getAdminStore();
  const requests = await adminStore.getHitlRequests({ status, limit });

  return NextResponse.json({ data: requests, count: requests.length });
}
