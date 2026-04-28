/**
 * S17-CT-4: GET /api/tickets/reports — case-tracking reporting.
 *
 * Returns three sub-reports keyed by ticket priority over a
 * caller-chosen window (default 30 days). The window must fall in
 * [1, 365] — values outside that range get rejected with a 400
 * problem+json (NOT silently clamped, so callers can detect they
 * sent something wrong).
 *
 *   - openByPriority — current board snapshot (not windowed)
 *   - resolution     — average minutes from createdAt → closedAt
 *   - slaCompliance  — % closed inside priority's resolveMinutes
 *
 * RBAC: `platform/tickets.read`. Read-only — no audit emission, no
 * rate-limit (admin reads are cheap aggregations and the cost-side
 * limiting at the gateway tier is sufficient).
 *
 * RFC 7807 problem+json on input-validation errors. Service-layer
 * exceptions bubble to Next's default 500 handler — we don't try to
 * mask infrastructure failures behind 200 envelopes.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getTicketReportService } from '../../../../lib/services';

const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' } as const;
const DEFAULT_RANGE_DAYS = 30;
const MIN_RANGE_DAYS = 1;
const MAX_RANGE_DAYS = 365;

function problem(
  status: number,
  type: string,
  title: string,
  detail?: string,
) {
  return NextResponse.json(
    { type, title, status, ...(detail ? { detail } : {}) },
    { status, headers: PROBLEM_HEADERS },
  );
}

/**
 * Parse `?range=Nd` or `?range=N` (Nd is the convention used by the
 * LLM-usage endpoint). Returns the integer day count or null on
 * malformed input.
 */
function parseRange(raw: string | null): number | null {
  if (raw === null) return DEFAULT_RANGE_DAYS;
  const trimmed = raw.trim();
  if (!/^\d+d?$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/tickets.read')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const rangeRaw = url.searchParams.get('range');
  const days = parseRange(rangeRaw);
  if (days === null) {
    return problem(
      400,
      'https://aptivo.dev/errors/ticket-report-invalid-range',
      'Invalid range',
      'range must be a positive integer (days), optionally suffixed with "d" (e.g., "30" or "30d")',
    );
  }
  if (days < MIN_RANGE_DAYS || days > MAX_RANGE_DAYS) {
    return problem(
      400,
      'https://aptivo.dev/errors/ticket-report-invalid-range',
      'Invalid range',
      `range must be between ${MIN_RANGE_DAYS} and ${MAX_RANGE_DAYS} days`,
    );
  }

  const report = await getTicketReportService().getReport({ windowDays: days });
  return NextResponse.json({ data: report });
}
