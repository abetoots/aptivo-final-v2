/**
 * WFE3-01: Workflow draft validation endpoint
 *
 * validates a *draft* workflow body (shape + graph) without persisting.
 * not under /[id] — the request body alone determines validity, there's no
 * persisted workflow to reference. Returns 200 with a JSON report either way;
 * the `valid` boolean tells the caller whether the draft is acceptable.
 *
 * This is a validation tool (like a linter), not a gateway: even for invalid
 * drafts the HTTP status is 200 so clients can show structured feedback
 * inline without treating validation failure as a request failure.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { withBodyLimits } from '../../../../lib/security/route-guard';
import { WorkflowStepSchema } from '../../../../lib/workflows/workflow-definition-service';
import { validateGraph, type GraphValidationError } from '../../../../lib/workflows/graph-validation';

// ---------------------------------------------------------------------------
// request shape — just steps; no persistence context needed
// ---------------------------------------------------------------------------

const ValidateRequestSchema = z.object({
  steps: z.array(WorkflowStepSchema),
});

// ---------------------------------------------------------------------------
// error → type-URI mapping (for callers that want deep-linkable error docs)
// ---------------------------------------------------------------------------

const GRAPH_ERROR_TYPE_URI: Record<GraphValidationError['_tag'], string> = {
  NoEntryStep: 'https://aptivo.dev/errors/workflow-no-entry-step',
  DuplicateStepId: 'https://aptivo.dev/errors/workflow-duplicate-step-id',
  DanglingReference: 'https://aptivo.dev/errors/workflow-dangling-reference',
  CycleDetected: 'https://aptivo.dev/errors/workflow-cycle',
  UnreachableSteps: 'https://aptivo.dev/errors/workflow-unreachable-steps',
};

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

async function handlePost(request: NextRequest, body: unknown) {
  // validation is a linter (read-only, no persistence) — any viewer can
  // lint a draft, not only workflow managers
  const forbidden = await checkPermissionWithBlacklist('platform/workflow.view')(request);
  if (forbidden) return forbidden;

  const parsed = ValidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    // shape issues surface as structured errors too — callers don't need to
    // distinguish between "not a workflow body" and "cyclic workflow body"
    return NextResponse.json({
      valid: false,
      errors: [
        {
          _tag: 'ShapeInvalid',
          type: 'https://aptivo.dev/errors/validation',
          detail: parsed.error.message,
        },
      ],
    });
  }

  const result = validateGraph(parsed.data.steps);
  if (result.ok) {
    return NextResponse.json({ valid: true, errors: [] });
  }

  return NextResponse.json({
    valid: false,
    errors: [{ ...result.error, type: GRAPH_ERROR_TYPE_URI[result.error._tag] }],
  });
}

export const POST = withBodyLimits(handlePost);
