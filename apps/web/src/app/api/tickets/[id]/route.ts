/**
 * S17-CT-1: GET / PATCH / DELETE for a single ticket.
 *
 * DELETE is a soft-close — sets status='closed' + closedAt=now()
 * rather than removing the row. Hard delete would break SLA-honoured-
 * after analytics (CT-4) and the audit trail; if a true purge is
 * needed it lives behind a separate retention path.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../../lib/security/route-guard';
import {
  getAdminRateLimit,
  getTicketService,
  getTicketSlaService,
} from '../../../../lib/services';
import type { TicketError } from '../../../../lib/case-tracking/ticket-service';

const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' } as const;

function problem(status: number, type: string, title: string, detail?: string, extras?: Record<string, unknown>) {
  return NextResponse.json(
    { type, title, status, ...(detail ? { detail } : {}), ...(extras ?? {}) },
    { status, headers: PROBLEM_HEADERS },
  );
}

function ticketErrorToResponse(err: TicketError) {
  switch (err._tag) {
    case 'TicketNotFound':
      return problem(404, 'https://aptivo.dev/errors/ticket-not-found', 'Ticket not found', `No ticket with id ${err.id}`);
    case 'TicketValidationError':
      return problem(400, 'https://aptivo.dev/errors/ticket-validation', 'Ticket validation failed', 'One or more fields are invalid', { issues: err.issues });
    case 'WorkflowDefinitionNotFound':
      return problem(400, 'https://aptivo.dev/errors/workflow-definition-not-found', 'Workflow definition not found', `No workflow definition with id ${err.workflowDefinitionId}`);
    case 'WorkflowDefinitionInvalid':
      return problem(400, 'https://aptivo.dev/errors/workflow-definition-invalid', 'Workflow definition graph invalid', err.reason);
    case 'TicketAlreadyClosed':
      return problem(409, 'https://aptivo.dev/errors/ticket-already-closed', 'Ticket already closed', `Ticket ${err.id} is already closed`);
  }
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Codex S17_CT_1_MULTI_REVIEW caught that the path :id was unvalidated.
const UUID_RE =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

function rejectIfInvalidId(id: string) {
  if (UUID_RE.test(id)) return null;
  return problem(
    400,
    'https://aptivo.dev/errors/ticket-id-invalid',
    'Invalid ticket id',
    'id must be a UUID',
  );
}

// ---------------------------------------------------------------------------
// GET /api/tickets/:id
// ---------------------------------------------------------------------------

export async function GET(request: Request, ctx: RouteContext) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.read')(request);
  if (forbidden) return forbidden;

  const { id } = await ctx.params;
  const idCheck = rejectIfInvalidId(id);
  if (idCheck) return idCheck;

  const result = await getTicketService().findById(id);
  if (!result.ok) return ticketErrorToResponse(result.error);
  // S17-CT-2: enrich the response with the computed SLA status so
  // clients can render deadline / breach / at-risk inline without
  // a follow-up call. Returns null when the ticket's priority has
  // no SLA config row yet (cold-start); routes never fail on a
  // missing SLA — sla=null is the documented contract.
  const sla = await getTicketSlaService().computeSla(result.value);
  return NextResponse.json({ data: result.value, slaStatus: sla });
}

// ---------------------------------------------------------------------------
// PATCH /api/tickets/:id — partial update
// ---------------------------------------------------------------------------

async function handlePatch(request: NextRequest, body: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.update')(request);
  if (forbidden) return forbidden;

  const limited = await getAdminRateLimit().check(request);
  if (limited) return limited;

  const user = await extractUser(request);
  if (!user) return problem(401, 'https://aptivo.dev/errors/unauthorized', 'Unauthorized');

  // extract :id from URL (PATCH wrapper doesn't carry the route ctx)
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1] ?? '';
  const idCheck = rejectIfInvalidId(id);
  if (idCheck) return idCheck;

  const result = await getTicketService().update(id, body, { id: user.userId, type: 'user' });
  if (!result.ok) return ticketErrorToResponse(result.error);
  return NextResponse.json({ data: result.value });
}

export const PATCH = withBodyLimits(handlePatch);

// ---------------------------------------------------------------------------
// DELETE /api/tickets/:id — soft close
// ---------------------------------------------------------------------------

export async function DELETE(request: Request, ctx: RouteContext) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.delete')(request);
  if (forbidden) return forbidden;

  const limited = await getAdminRateLimit().check(request);
  if (limited) return limited;

  const user = await extractUser(request);
  if (!user) return problem(401, 'https://aptivo.dev/errors/unauthorized', 'Unauthorized');

  const { id } = await ctx.params;
  const idCheck = rejectIfInvalidId(id);
  if (idCheck) return idCheck;

  const result = await getTicketService().softClose(id, { id: user.userId, type: 'user' });
  if (!result.ok) return ticketErrorToResponse(result.error);
  return NextResponse.json({ data: result.value });
}
