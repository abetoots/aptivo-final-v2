/**
 * S18-B2: GET /api/hr/contracts
 *
 * Paginated list of HR contracts. Same pattern as /api/hr/candidates
 * (slice 4a) — see that file's docstring for the rationale on
 * direct `auditPiiReadBulk` emit vs the `withPiiReadAudit` HOF.
 *
 * The contracts table carries salary/benefits/personalTerms PII —
 * tighter access control than candidates: only the recruiter role
 * has bulk-list permission (see hr-seeds.ts hr/contract.view).
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../lib/security/rbac-resolver';
import {
  getContractStore,
  getPiiReadAuditMiddleware,
} from '../../../../lib/services';

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('hr/contract.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const status = url.searchParams.get('status') ?? undefined;

  // Round-1 review fix: fail closed on null extractUser.
  const user = await extractUser(request);
  if (!user) {
    return NextResponse.json(
      {
        type: '/errors/auth-required',
        title: 'Authenticated user required for PII read',
        status: 401,
      },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const store = getContractStore();
  const records = await store.list({ status, limit, offset });

  const audit = getPiiReadAuditMiddleware();
  try {
    await audit.auditPiiReadBulk(user.userId, 'contract', records.length);
  } catch {
    // factory-level throws only
  }

  return NextResponse.json({
    contracts: records,
    pagination: { limit, offset, returned: records.length },
  });
}
