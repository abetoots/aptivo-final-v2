/**
 * FEAT-08: MCP Server Discovery — list servers
 * @task FEAT-08
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getDiscoveryService } from '../../../../lib/services';

// GET — list all registered mcp servers with health
export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const service = getDiscoveryService();
  const result = await service.listServers();

  if (!result.ok) {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: 'Failed to list servers' },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value, count: result.value.length });
}
