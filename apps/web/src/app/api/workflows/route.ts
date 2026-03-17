/**
 * FEAT-01: Workflow Definition CRUD — list + create
 * @task FEAT-01
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../lib/security/rbac-middleware';
import { extractUser } from '../../../lib/security/rbac-resolver';
import { getWorkflowDefinitionService } from '../../../lib/services';

// POST — create a new workflow definition
export async function POST(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const user = await extractUser(request);
  if (!user) {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/unauthorized', title: 'Unauthorized', status: 401 },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/bad-request', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const service = getWorkflowDefinitionService();
  const result = await service.create(body, user.userId);

  if (!result.ok) {
    if (result.error._tag === 'ValidationError') {
      return NextResponse.json(
        { type: 'https://aptivo.dev/errors/validation', title: 'Validation Error', status: 400, detail: result.error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value }, { status: 201 });
}

// GET — list workflow definitions (optional ?domain= filter)
export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') ?? undefined;

  const service = getWorkflowDefinitionService();
  const result = await service.list(domain);

  if (!result.ok) {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value, count: result.value.length });
}
