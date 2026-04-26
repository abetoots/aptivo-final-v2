/**
 * S17-CT-1: case-tracking RBAC seed.
 *
 * Defines the four ticket permissions that the `/api/tickets` routes
 * gate on. Without these rows seeded, every request would 403 — the
 * routes use `checkPermissionWithBlacklist('platform/tickets.*')`
 * which queries `role_permissions` for the caller's roles. Multi-
 * model review (Codex S17_CT_1_MULTI_REVIEW) caught the original
 * version shipped without a seed.
 *
 * Three platform roles get ticket access today:
 *   - platform-admin: full CRUD
 *   - case-manager: read + create + update (no delete; soft-close
 *     belongs to admins or workflow automations)
 *   - case-viewer: read only (auditors / read-only stakeholders)
 *
 * Seeds idempotent via `onConflictDoNothing()` against the existing
 * `(role, permission)` unique constraint.
 */

import type { DrizzleClient } from '../adapters/types.js';
import { rolePermissions } from '../schema/user-roles.js';

export const CASE_TRACKING_PERMISSIONS = [
  // platform-admin: full CRUD
  { role: 'platform-admin', permission: 'platform/tickets.read' },
  { role: 'platform-admin', permission: 'platform/tickets.create' },
  { role: 'platform-admin', permission: 'platform/tickets.update' },
  { role: 'platform-admin', permission: 'platform/tickets.delete' },
  // case-manager: read/create/update (no soft-close)
  { role: 'case-manager', permission: 'platform/tickets.read' },
  { role: 'case-manager', permission: 'platform/tickets.create' },
  { role: 'case-manager', permission: 'platform/tickets.update' },
  // case-viewer: read-only
  { role: 'case-viewer', permission: 'platform/tickets.read' },
] as const;

export async function seedCaseTrackingRoles(
  db: DrizzleClient,
): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const perm of CASE_TRACKING_PERMISSIONS) {
    await db.insert(rolePermissions).values(perm).onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}
