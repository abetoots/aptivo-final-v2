/**
 * FA3-01: GET (read) + PUT (update) department budget endpoints.
 *
 * RBAC: requires `platform/admin.budget.edit` for writes, view permission
 * for reads (reuse `department.edit` for simplicity since only admins
 * access this surface today). Writes audit event
 * `platform.admin.budget.updated` + admin rate-limit.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkPermissionWithBlacklist } from '../../../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../../../lib/security/rbac-resolver';
import { withBodyLimits } from '../../../../../../lib/security/route-guard';
import {
  getAuditService,
  getDepartmentBudgetService,
  getAdminRateLimit,
} from '../../../../../../lib/services';

const BudgetBody = z.object({
  monthlyLimitUsd: z.number().positive(),
  warningThreshold: z.number().gt(0).lte(1).default(0.9),
  blockOnExceed: z.boolean().default(true),
  notifyOnWarning: z.boolean().default(true),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET — current budget + recent spend snapshot
export async function GET(request: Request, context: RouteParams) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.department.edit')(request);
  if (forbidden) return forbidden;
  const { id } = await context.params;

  const service = getDepartmentBudgetService();
  const budget = await service.getBudget(id);
  if (!budget.ok) {
    // distinguish "department doesn't exist" from "department exists
    // but has no budget set yet" — both are 404 but callers render
    // very different UIs.
    const detail = budget.error._tag === 'DepartmentNotFound'
      ? `department ${id} not found`
      : `department ${id} has no budget config yet`;
    const errorType = budget.error._tag === 'DepartmentNotFound'
      ? 'https://aptivo.dev/errors/department-not-found'
      : 'https://aptivo.dev/errors/budget-not-configured';
    return NextResponse.json(
      {
        type: errorType,
        title: 'Not Found',
        status: 404,
        detail,
      },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // spend for the current calendar month
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const report = await service.getSpendReport(id, { from, to: now });
  if (!report.ok) {
    return NextResponse.json({ data: { budget: budget.value, spend: null } });
  }

  return NextResponse.json({
    data: {
      budget: budget.value,
      spend: report.value,
    },
  });
}

// PUT — set / update the budget
async function handlePut(request: NextRequest, body: unknown, context?: unknown) {
  const forbidden = await checkPermissionWithBlacklist('platform/admin.budget.edit')(request);
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

  const { id } = await (context as RouteParams).params;

  const parsed = BudgetBody.safeParse(body);
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
  const result = await service.setBudget(id, parsed.data);
  if (!result.ok) {
    if (result.error._tag === 'DepartmentNotFound') {
      return NextResponse.json(
        {
          type: 'https://aptivo.dev/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: `department ${id}`,
        },
        { status: 404, headers: { 'content-type': 'application/problem+json' } },
      );
    }
    return NextResponse.json(
      {
        type: 'https://aptivo.dev/errors/budget-update-failed',
        title: 'Could not update budget',
        status: 400,
        error: result.error,
      },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  getAuditService().emit({
    actor: { id: user.userId, type: 'user' },
    action: 'platform.admin.budget.updated',
    resource: { type: 'department-budget', id },
    metadata: { ...parsed.data },
  }).catch(() => { /* audit write failure is logged by the service */ });

  return NextResponse.json({ data: { departmentId: id, budget: parsed.data } });
}

export const PUT = withBodyLimits(handlePut);
