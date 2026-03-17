/**
 * FEAT-01: Workflow Definition CRUD — get, update, delete by id
 * @task FEAT-01
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getWorkflowDefinitionService } from '../../../../lib/services';

type RouteParams = { params: Promise<{ id: string }> };

// GET — find by id
export async function GET(request: Request, context: RouteParams) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const service = getWorkflowDefinitionService();
  const result = await service.findById(id);

  if (!result.ok) {
    if (result.error._tag === 'NotFoundError') {
      return NextResponse.json(
        { type: 'https://aptivo.dev/errors/not-found', title: 'Not Found', status: 404, detail: `Workflow ${id} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value });
}

// PUT — update
export async function PUT(request: Request, context: RouteParams) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const { id } = await context.params;

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
  const result = await service.update(id, body);

  if (!result.ok) {
    if (result.error._tag === 'NotFoundError') {
      return NextResponse.json(
        { type: 'https://aptivo.dev/errors/not-found', title: 'Not Found', status: 404, detail: `Workflow ${id} not found` },
        { status: 404 },
      );
    }
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

  return NextResponse.json({ data: result.value });
}

// DELETE — remove by id
export async function DELETE(request: Request, context: RouteParams) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const service = getWorkflowDefinitionService();
  const result = await service.delete(id);

  if (!result.ok) {
    if (result.error._tag === 'NotFoundError') {
      return NextResponse.json(
        { type: 'https://aptivo.dev/errors/not-found', title: 'Not Found', status: 404, detail: `Workflow ${id} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
