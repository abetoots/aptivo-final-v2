/**
 * FEAT-01: Workflow Definition CRUD — get, update, delete by id
 * @task FEAT-01
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { withBodyLimits } from '../../../../lib/security/route-guard';
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
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: errorDetail(result.error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value });
}

// PUT — update
async function handlePut(request: NextRequest, body: unknown, context?: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const { id } = await (context as RouteParams).params;

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
    if (result.error._tag === 'GraphInvalid') {
      const typeUri = `https://aptivo.dev/errors/workflow-${graphTagToSlug(result.error.graphError._tag)}`;
      return NextResponse.json(
        {
          type: typeUri,
          title: 'Workflow Graph Invalid',
          status: 400,
          graphError: { ...result.error.graphError, type: typeUri },
        },
        { status: 400, headers: { 'content-type': 'application/problem+json' } },
      );
    }
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: errorDetail(result.error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value });
}

export const PUT = withBodyLimits(handlePut);

function graphTagToSlug(tag: string): string {
  switch (tag) {
    case 'NoEntryStep': return 'no-entry-step';
    case 'DuplicateStepId': return 'duplicate-step-id';
    case 'DanglingReference': return 'dangling-reference';
    case 'CycleDetected': return 'cycle';
    case 'UnreachableSteps': return 'unreachable-steps';
    default: return 'invalid';
  }
}

// extracts a human-readable detail string from any WorkflowDefinitionError
// variant — some have `message`, others only `_tag`
function errorDetail(err: { readonly _tag: string; readonly message?: string }): string {
  return err.message ?? err._tag;
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
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: errorDetail(result.error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
