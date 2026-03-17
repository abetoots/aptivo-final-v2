/**
 * FEAT-08: MCP Server Discovery — server health
 * @task FEAT-08
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../../../lib/security/rbac-middleware';
import { getDiscoveryService } from '../../../../../../lib/services';

type RouteParams = { params: Promise<{ id: string }> };

// GET — get health details for a specific mcp server
export async function GET(request: Request, context: RouteParams) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const service = getDiscoveryService();
  const result = await service.getServerHealth(id);

  if (!result.ok) {
    if (result.error._tag === 'ServerNotFound') {
      return NextResponse.json(
        { type: 'https://aptivo.dev/errors/not-found', title: 'Not Found', status: 404, detail: `Server ${id} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: 'Failed to get server health' },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value });
}
