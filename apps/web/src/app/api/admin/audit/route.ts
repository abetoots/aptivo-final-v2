/**
 * S7-INT-02: paginated audit log API
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
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const resource = url.searchParams.get('resource') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;

  const adminStore = getAdminStore();
  const result = await adminStore.getAuditLogsPaginated({ page, limit, resource, actor });

  return NextResponse.json(result);
}
