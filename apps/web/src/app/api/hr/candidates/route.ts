/**
 * S18-B2: GET /api/hr/candidates
 *
 * Paginated list of candidates. Calls `auditPiiReadBulk` directly
 * after computing the response (NOT via the `withPiiReadAudit` HOF
 * which emits the wrong `pii.read` action — Codex round-1 review of
 * the plan caught this; the HOF stays available for non-bulk
 * endpoints).
 *
 * Why direct emit: the HOF's `auditPiiRead` is for single-record reads
 * (intersects accessed fields with the PII registry). List endpoints
 * are inherently bulk — every row carries every PII field — so the
 * `auditPiiReadBulk` action is the right grain. The anomaly gate's
 * aggregate query scopes by `audit_logs.user_id` AND
 * `resource_type IN (...)` AND `action IN ('pii.read.bulk',
 * 'pii.read.export')`; emitting `pii.read` from list endpoints would
 * fall outside that filter and the gate would stay inert on bulk-HR
 * traffic.
 *
 * S18-A1 attribution chain: the route handler extracts the
 * authenticated user, then calls auditPiiReadBulk(userId, ...) — the
 * services.ts wiring (post round-1 fix) emits with `actor.type='user'`
 * so audit_logs.user_id populates and the anomaly aggregate matches.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../lib/security/rbac-resolver';
import {
  getCandidateStore,
  getPiiReadAuditMiddleware,
} from '../../../../lib/services';

export async function GET(request: Request) {
  // RBAC: require hr/candidate.view permission
  const forbidden = await checkPermissionWithBlacklist('hr/candidate.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const status = url.searchParams.get('status') ?? undefined;

  const store = getCandidateStore();
  const records = await store.list({ status, limit, offset });

  // S18-B2 PII audit emit — load-bearing for the anomaly-gate-matches-
  // HR claim. Fire-and-forget: a failed audit emit must not block the
  // response (the audit-service path itself handles its own retries
  // via the DLQ).
  const user = await extractUser(request);
  if (user) {
    const audit = getPiiReadAuditMiddleware();
    audit
      .auditPiiReadBulk(user.userId, 'candidate', records.length)
      .catch(() => {
        // swallow — audit emit failures don't block the response
      });
  }

  return NextResponse.json({
    candidates: records,
    pagination: { limit, offset, returned: records.length },
  });
}
