/**
 * S18-B2: GET /api/hr/contracts/export
 *
 * Bulk export endpoint — same shape as /api/hr/candidates/export
 * (slice 4a) but for contracts. Emits `pii.read.export` with
 * resourceType='contract'.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../../lib/security/rbac-resolver';
import {
  getContractStore,
  getPiiReadAuditMiddleware,
} from '../../../../../lib/services';

const EXPORT_LIMIT_HARD_CAP = 1000;

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('hr/contract.export')(request);
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

  const store = getContractStore();
  const records = await store.list({ status, limit, offset });

  const user = await extractUser(request);
  if (user) {
    const audit = getPiiReadAuditMiddleware();
    audit
      .auditPiiReadExport(user.userId, 'contract', records.length, format)
      .catch(() => {
        // fire-and-forget
      });
  }

  return NextResponse.json({
    contracts: records,
    format,
    pagination: { limit, offset, returned: records.length },
  });
}
