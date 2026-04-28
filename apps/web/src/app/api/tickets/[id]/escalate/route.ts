/**
 * S17-CT-3: POST /api/tickets/:id/escalate — manual tier advance.
 *
 * Body shape: `{ reason: string }`. RBAC: `platform/tickets.escalate`.
 * Admin-rate-limited (writes). Emits `platform.ticket.escalated`
 * audit event (via the service layer). RFC 7807 problem+json on
 * every error path; tagged-error → status mapping below.
 *
 * Soft-closed tickets cannot be escalated (returns
 * `ticket-already-closed`). Tickets at the top of their priority
 * chain return `ticket-already-at-top-tier`. Priorities with no
 * escalation chain (today: `low`) return
 * `ticket-escalation-config-missing`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkPermissionWithBlacklist } from '../../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../../../lib/security/route-guard';
import {
  getAdminRateLimit,
  getTicketEscalationService,
} from '../../../../../lib/services';
import type { EscalationError } from '../../../../../lib/case-tracking/ticket-escalation';

const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' } as const;
const UUID_RE =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

const EscalateBodySchema = z.object({
  reason: z.string().min(1).max(500),
});

function problem(
  status: number,
  type: string,
  title: string,
  detail?: string,
  extras?: Record<string, unknown>,
) {
  return NextResponse.json(
    { type, title, status, ...(detail ? { detail } : {}), ...(extras ?? {}) },
    { status, headers: PROBLEM_HEADERS },
  );
}

function escalationErrorToResponse(err: EscalationError) {
  switch (err._tag) {
    case 'TicketNotFound':
      return problem(
        404,
        'https://aptivo.dev/errors/ticket-not-found',
        'Ticket not found',
        `No ticket with id ${err.id}`,
      );
    case 'TicketValidationError':
      return problem(
        400,
        'https://aptivo.dev/errors/ticket-validation',
        'Validation failed',
        'reason must be a non-empty string',
        { issues: err.issues },
      );
    case 'TicketAlreadyClosed':
      return problem(
        409,
        'https://aptivo.dev/errors/ticket-already-closed',
        'Ticket already closed',
        `Ticket ${err.id} is closed; reopen before escalating`,
      );
    case 'TicketAlreadyAtTopTier':
      return problem(
        409,
        'https://aptivo.dev/errors/ticket-already-at-top-tier',
        'Ticket already at top tier',
        `Ticket ${err.ticketId} is already at the highest escalation tier for its priority`,
      );
    case 'TicketChainExhausted':
      return problem(
        409,
        'https://aptivo.dev/errors/ticket-chain-exhausted',
        'Escalation chain exhausted',
        `Ticket ${err.ticketId}'s current tier is no longer in the configured chain (config drift)`,
      );
    case 'TicketEscalationConfigMissing':
      return problem(
        422,
        'https://aptivo.dev/errors/ticket-escalation-config-missing',
        'Priority has no escalation chain',
        `Tickets of priority ${err.priority} cannot be escalated — no chain is configured`,
      );
    case 'TicketEscalationStale':
      // 409 Conflict: another escalation landed between our read and
      // our write. Caller may retry by re-issuing the request.
      return problem(
        409,
        'https://aptivo.dev/errors/ticket-escalation-stale',
        'Concurrent escalation detected',
        `Ticket ${err.ticketId} was modified by another writer; re-read and retry`,
      );
    // shapes inherited from CT-1's TicketError union but not produced by escalation:
    case 'WorkflowDefinitionNotFound':
    case 'WorkflowDefinitionInvalid':
      // unreachable here; map to 500 so static-analysis is satisfied
      return problem(500, 'https://aptivo.dev/errors/internal', 'Internal error');
  }
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePost(request: NextRequest, body: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.escalate')(request);
  if (forbidden) return forbidden;

  const limited = await getAdminRateLimit().check(request);
  if (limited) return limited;

  const user = await extractUser(request);
  if (!user) return problem(401, 'https://aptivo.dev/errors/unauthorized', 'Unauthorized');

  // extract :id from URL (PATCH/POST wrapper doesn't carry route ctx)
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // route is /api/tickets/:id/escalate — id is the second-to-last segment
  const id = segments[segments.length - 2] ?? '';
  if (!UUID_RE.test(id)) {
    return problem(
      400,
      'https://aptivo.dev/errors/ticket-id-invalid',
      'Invalid ticket id',
      'id must be a UUID',
    );
  }

  const parsed = EscalateBodySchema.safeParse(body);
  if (!parsed.success) {
    return problem(
      400,
      'https://aptivo.dev/errors/ticket-validation',
      'Validation failed',
      'reason must be a non-empty string ≤ 500 characters',
      {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    );
  }

  const result = await getTicketEscalationService().manualEscalate(
    id,
    parsed.data.reason,
    { id: user.userId, type: 'user' },
  );
  if (!result.ok) return escalationErrorToResponse(result.error);
  return NextResponse.json({ data: result.value });
}

export const POST = withBodyLimits(handlePost);

// ---------------------------------------------------------------------------
// GET /api/tickets/:id/escalate — read chain status (no escalation)
// ---------------------------------------------------------------------------

export async function GET(request: Request, ctx: RouteContext) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.read')(request);
  if (forbidden) return forbidden;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return problem(
      400,
      'https://aptivo.dev/errors/ticket-id-invalid',
      'Invalid ticket id',
      'id must be a UUID',
    );
  }

  const result = await getTicketEscalationService().getChainStatus(id);
  if (!result.ok) return escalationErrorToResponse(result.error);
  return NextResponse.json({ data: result.value });
}
