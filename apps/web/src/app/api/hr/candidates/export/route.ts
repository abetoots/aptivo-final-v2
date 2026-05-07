/**
 * S18-B2: GET /api/hr/candidates/export
 *
 * Bulk export endpoint — same source as `/api/hr/candidates` but
 * larger default limit (1000), explicit format parameter, and emits
 * `pii.read.export` instead of `pii.read.bulk`. The two action
 * variants are scored separately by the anomaly gate (export volume
 * is a stronger compliance signal than list volume).
 *
 * `format` parameter: `'json'` is the only supported value today;
 * `'csv'` lands when the export pipeline gets a converter (S19+
 * compliance work).
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../../lib/security/rbac-resolver';
import {
  getCandidateStore,
  getPiiReadAuditMiddleware,
} from '../../../../../lib/services';

const EXPORT_LIMIT_HARD_CAP = 1000;

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('hr/candidate.export')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(
    EXPORT_LIMIT_HARD_CAP,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '500', 10) || 500),
  );
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const status = url.searchParams.get('status') ?? undefined;
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

  if (format !== 'json') {
    return NextResponse.json(
      { type: '/errors/unsupported-format', title: 'Unsupported export format', format },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const store = getCandidateStore();
  const records = await store.list({ status, limit, offset });

  const user = await extractUser(request);
  if (user) {
    const audit = getPiiReadAuditMiddleware();
    audit
      .auditPiiReadExport(user.userId, 'candidate', records.length, format)
      .catch(() => {
        // fire-and-forget; audit-service handles its own retries via DLQ
      });
  }

  return NextResponse.json({
    candidates: records,
    format,
    pagination: { limit, offset, returned: records.length },
  });
}
