/**
 * S18-B2: GET /api/hr/employees
 *
 * "Employees" are candidates whose `status` has flipped to 'hired'.
 * No separate employees table exists in the schema today; the
 * candidates row is the canonical record across the candidate →
 * employee transition. The PII registry distinguishes the two
 * resource types (candidate: email/phone/ssn/dateOfBirth/address;
 * employee: email/phone/ssn/salary/bankAccount), so the audit emit
 * uses `resourceType='employee'` to score employee-PII volume
 * separately from candidate-PII volume in the anomaly aggregate.
 *
 * Source: CandidateStore.list with `status='hired'` hard-coded —
 * the route doesn't accept an arbitrary `status` query param because
 * "/employees" semantically means hired candidates only. Other
 * statuses must go through `/api/hr/candidates`.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../lib/security/rbac-resolver';
import {
  getCandidateStore,
  getPiiReadAuditMiddleware,
} from '../../../../lib/services';

export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('hr/employee.view')(request);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);

  const store = getCandidateStore();
  const records = await store.list({ status: 'hired', limit, offset });

  const user = await extractUser(request);
  if (user) {
    const audit = getPiiReadAuditMiddleware();
    audit
      .auditPiiReadBulk(user.userId, 'employee', records.length)
      .catch(() => {
        // fire-and-forget
      });
  }

  return NextResponse.json({
    employees: records,
    pagination: { limit, offset, returned: records.length },
  });
}
