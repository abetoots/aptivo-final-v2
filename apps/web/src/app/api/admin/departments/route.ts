/**
 * FA3-01: GET (list) + POST (create) department endpoints.
 *
 * RBAC: requires `platform/admin.department.edit`. Writes emit an
 * audit event `platform.admin.department.created` and are rate-limited
 * via the admin rate-limiter (FA3-01 addition).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../../lib/security/route-guard';
import {
  getAuditService,
  getDepartmentBudgetService,
  getAdminRateLimit,
} from '../../../../lib/services';

const CreateDepartmentBody = z.object({
  name: z.string().min(1).max(120),
  ownerUserId: z.string().uuid(),
});

// GET — list all departments
export async function GET(request: Request) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.department.edit')(request);
  if (forbidden) return forbidden;

  const service = getDepartmentBudgetService();
  const departments = await service.listDepartments();
  return NextResponse.json({ data: departments, count: departments.length });
}

// POST — create a department
async function handlePost(request: NextRequest, body: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.department.edit')(request);
  if (forbidden) return forbidden;

  const limited = await getAdminRateLimit().check(request);
  if (limited) return limited;

  const user = await extractUser(request);
  if (!user) {
    return NextResponse.json(
      { type: 'https://aptivo.dev/errors/unauthorized', title: 'Unauthorized', status: 401 },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const parsed = CreateDepartmentBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        type: 'https://aptivo.dev/errors/validation',
        title: 'Validation Error',
        status: 400,
        detail: parsed.error.message,
      },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const service = getDepartmentBudgetService();
  const result = await service.createDepartment(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      {
        type: 'https://aptivo.dev/errors/department-create-failed',
        title: 'Could not create department',
        status: 400,
        error: result.error,
      },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // fire-and-forget audit event — write failures must not block the reply
  getAuditService().emit({
    actor: { id: user.userId, type: 'user' },
    action: 'platform.admin.department.created',
    resource: { type: 'department', id: result.value.id },
    metadata: { name: result.value.name, ownerUserId: result.value.ownerUserId },
  }).catch(() => { /* audit write failure is logged by the service */ });

  return NextResponse.json({ data: result.value }, { status: 201 });
}

export const POST = withBodyLimits(handlePost);
