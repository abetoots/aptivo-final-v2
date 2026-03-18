/**
 * PR-07: Admin Feature Flags API
 * @task PR-07
 *
 * returns all feature flags with source annotation.
 * requires platform/admin.view permission via rbac middleware.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../lib/security/rbac-middleware';
import { getFeatureFlagService } from '../../../../lib/services';

export async function GET(request: Request) {
  // rbac check
  const forbidden = await checkPermissionWithBlacklist('platform/admin.view')(request);
  if (forbidden) return forbidden;

  const flagService = getFeatureFlagService();
  const flagsResult = await flagService.getAllFlags();

  if (!flagsResult.ok) {
    return NextResponse.json(
      { error: 'failed to load feature flags', detail: String(flagsResult.error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ flags: flagsResult.value });
}
