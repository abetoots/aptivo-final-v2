/**
 * S17-CT-1: GET (list) + POST (create) ticket endpoints.
 *
 * RBAC: GET requires `platform/tickets.read`; POST requires
 * `platform/tickets.create`. Writes emit a `platform.ticket.created`
 * audit event (via the service layer) and are rate-limited via the
 * admin rate-limiter (same instance as FA3-01 admin writes).
 *
 * RFC 7807 problem+json for every error path. Errors carry a
 * stable `type` URI so clients can pattern-match without parsing
 * `detail`. Validation failures include the per-field issues from
 * the service's tagged TicketValidationError so callers can render
 * them inline.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../lib/security/rbac-middleware';
import { extractUser } from '../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../lib/security/route-guard';
import {
  getAdminRateLimit,
  getTicketService,
} from '../../../lib/services';
import type { TicketError } from '../../../lib/case-tracking/ticket-service';
import type { ListTicketsParams } from '@aptivo/database/adapters';

// ---------------------------------------------------------------------------
// helpers — RFC 7807 problem+json builders
// ---------------------------------------------------------------------------

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
      return problem(
        400,
        'https://aptivo.dev/errors/ticket-validation',
        'Ticket validation failed',
        'One or more fields are invalid',
        { issues: err.issues },
      );
    case 'WorkflowDefinitionNotFound':
      return problem(
        400,
        'https://aptivo.dev/errors/workflow-definition-not-found',
        'Workflow definition not found',
        `No workflow definition with id ${err.workflowDefinitionId}`,
      );
    case 'WorkflowDefinitionInvalid':
      return problem(
        400,
        'https://aptivo.dev/errors/workflow-definition-invalid',
        'Workflow definition graph invalid',
        err.reason,
      );
    case 'TicketAlreadyClosed':
      return problem(
        409,
        'https://aptivo.dev/errors/ticket-already-closed',
        'Ticket already closed',
        `Ticket ${err.id} is already closed; reopen it before mutating`,
      );
  }
}

// ---------------------------------------------------------------------------
// GET — list tickets
// ---------------------------------------------------------------------------

const ALLOWED_STATUS = new Set(['open', 'in_progress', 'escalated', 'closed']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high', 'critical']);

// Codex S17_CT_1_MULTI_REVIEW caught that ownerUserId/departmentId
// query params and the path :id were unvalidated — malformed UUIDs
// would flow into the store and surface as driver/DB errors instead
// of clean RFC 7807 400s. Validation now happens at the edge.
const UUID_RE =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function parsePositiveInt(raw: string): number | null {
  // Number() accepts decimals + scientific notation; Number.isInteger
  // rejects them. Combined with the leading-digit regex this also
  // rejects '1.5', '1e3', and trailing whitespace.
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.read')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const params: ListTicketsParams = {};
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const ownerUserId = url.searchParams.get('ownerUserId');
  const departmentId = url.searchParams.get('departmentId');
  const limitStr = url.searchParams.get('limit');
  const offsetStr = url.searchParams.get('offset');

  if (status) {
    if (!ALLOWED_STATUS.has(status)) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', `status must be one of ${[...ALLOWED_STATUS].join(', ')}`);
    }
    params.status = status as ListTicketsParams['status'];
  }
  if (priority) {
    if (!ALLOWED_PRIORITY.has(priority)) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', `priority must be one of ${[...ALLOWED_PRIORITY].join(', ')}`);
    }
    params.priority = priority as ListTicketsParams['priority'];
  }
  if (ownerUserId) {
    if (!isUuid(ownerUserId)) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', 'ownerUserId must be a UUID');
    }
    params.ownerUserId = ownerUserId;
  }
  if (departmentId) {
    if (!isUuid(departmentId)) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', 'departmentId must be a UUID');
    }
    params.departmentId = departmentId;
  }

  if (limitStr !== null) {
    const n = parsePositiveInt(limitStr);
    if (n === null || n <= 0 || n > 200) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', 'limit must be a positive integer ≤ 200');
    }
    params.limit = n;
  }
  if (offsetStr !== null) {
    const n = parsePositiveInt(offsetStr);
    if (n === null) {
      return problem(400, 'https://aptivo.dev/errors/ticket-list-invalid', 'Invalid query parameter', 'offset must be a non-negative integer');
    }
    params.offset = n;
  }

  const service = getTicketService();
  const result = await service.list(params);
  return NextResponse.json({
    data: result.rows,
    totalCount: result.totalCount,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

// ---------------------------------------------------------------------------
// POST — create ticket
// ---------------------------------------------------------------------------

async function handlePost(request: NextRequest, body: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.create')(request);
  if (forbidden) return forbidden;

  const limited = await getAdminRateLimit().check(request);
  if (limited) return limited;

  const user = await extractUser(request);
  if (!user) {
    return problem(401, 'https://aptivo.dev/errors/unauthorized', 'Unauthorized');
  }

  const service = getTicketService();
  const result = await service.create(body, { id: user.userId, type: 'user' });
  if (!result.ok) return ticketErrorToResponse(result.error);

  return NextResponse.json({ data: result.value }, { status: 201 });
}

export const POST = withBodyLimits(handlePost);
