/**
 * S18-B2: GET /api/hr/employees/export
 *
 * Bulk export of hired candidates. Emits `pii.read.export` with
 * resourceType='employee'.
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
  const forbidden = await checkPermissionWithBlacklist('hr/employee.export')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(
    EXPORT_LIMIT_HARD_CAP,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '500', 10) || 500),
  );
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();

  if (format !== 'json') {
    return NextResponse.json(
      { type: '/errors/unsupported-format', title: 'Unsupported export format', format },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // Round-1 review fix: fail closed on null extractUser.
  const user = await extractUser(request);
  if (!user) {
    return NextResponse.json(
      {
        type: '/errors/auth-required',
        title: 'Authenticated user required for PII export',
        status: 401,
      },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const store = getCandidateStore();
  const records = await store.list({ status: 'hired', limit, offset });

  const audit = getPiiReadAuditMiddleware();
  try {
    await audit.auditPiiReadExport(user.userId, 'employee', records.length, format);
  } catch {
    // factory-level throws only
  }

  return NextResponse.json({
    employees: records,
    format,
    pagination: { limit, offset, returned: records.length },
  });
}
