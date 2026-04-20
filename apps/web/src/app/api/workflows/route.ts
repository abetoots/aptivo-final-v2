/**
 * FEAT-01: Workflow Definition CRUD — list + create
 * @task FEAT-01
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../lib/security/rbac-middleware';
import { extractUser } from '../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../lib/security/route-guard';
import { getWorkflowDefinitionService } from '../../../lib/services';

// POST — create a new workflow definition
async function handlePost(request: NextRequest, body: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.manage')(request);
  if (forbidden) return forbidden;

  const user = await extractUser(request);
  if (!user) {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/unauthorized', title: 'Unauthorized', status: 401 },
      { status: 401 },
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
    if (result.error._tag === 'GraphInvalid') {
      const typeUri = `https://aptivo.dev/errors/workflow-${graphTagToSlug(result.error.graphError._tag)}`;
      return NextResponse.json(
        {
          type: typeUri,
          title: 'Workflow Graph Invalid',
          status: 400,
          // nested graphError mirrors the validate-endpoint shape so clients
          // can share a single schema across linter + gateway responses
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

  return NextResponse.json({ data: result.value }, { status: 201 });
}

// extracts a human-readable detail string from any WorkflowDefinitionError
// variant — some have `message`, others only `_tag`
function errorDetail(err: { readonly _tag: string; readonly message?: string }): string {
  return err.message ?? err._tag;
}

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

export const POST = withBodyLimits(handlePost);

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
      { type: 'https://aptivo.dev/errors/internal', title: 'Internal Error', status: 500, detail: errorDetail(result.error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: result.value, count: result.value.length });
}
