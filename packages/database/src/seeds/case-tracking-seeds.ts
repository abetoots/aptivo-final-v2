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
import { ticketSlaConfigs } from '../schema/ticket-sla-configs.js';

export const CASE_TRACKING_PERMISSIONS = [
  // platform-admin: full CRUD + escalate
  { role: 'platform-admin', permission: 'platform/tickets.read' },
  { role: 'platform-admin', permission: 'platform/tickets.create' },
  { role: 'platform-admin', permission: 'platform/tickets.update' },
  { role: 'platform-admin', permission: 'platform/tickets.delete' },
  { role: 'platform-admin', permission: 'platform/tickets.escalate' },
  // case-manager: read/create/update + escalate (no soft-close)
  { role: 'case-manager', permission: 'platform/tickets.read' },
  { role: 'case-manager', permission: 'platform/tickets.create' },
  { role: 'case-manager', permission: 'platform/tickets.update' },
  { role: 'case-manager', permission: 'platform/tickets.escalate' },
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

// ---------------------------------------------------------------------------
// S17-CT-2: ticket SLA window defaults (one row per priority)
// ---------------------------------------------------------------------------

/**
 * Default SLA windows in minutes per ticket priority. These are
 * tuned for a "standard" team responsiveness profile and can be
 * overridden per environment via the admin SLA config UI (Phase
 * 3.5) or directly via store.upsert. The 80% warning threshold is
 * uniform across priorities — the SLO cron's
 * `ticketSlaAtRiskAlert` fires when too many open tickets cross
 * that line.
 */
export const TICKET_SLA_DEFAULTS = [
  { priority: 'critical', resolveMinutes: 4 * 60 },        // 4h
  { priority: 'high',     resolveMinutes: 24 * 60 },       // 24h
  { priority: 'medium',   resolveMinutes: 3 * 24 * 60 },   // 3d
  { priority: 'low',      resolveMinutes: 7 * 24 * 60 },   // 7d
] as const;

const DEFAULT_WARNING_THRESHOLD_PCT = '0.800';

export async function seedTicketSlaDefaults(
  db: DrizzleClient,
): Promise<{ insertedCount: number }> {
  let count = 0;
  for (const cfg of TICKET_SLA_DEFAULTS) {
    await db
      .insert(ticketSlaConfigs)
      .values({
        priority: cfg.priority,
        resolveMinutes: cfg.resolveMinutes,
        warningThresholdPct: DEFAULT_WARNING_THRESHOLD_PCT,
      })
      .onConflictDoNothing();
    count++;
  }
  return { insertedCount: count };
}

/**
 * One-shot helper for environments bringing up case tracking from
 * scratch (RBAC + SLA windows in a single call).
 */
export async function seedAllCaseTracking(db: DrizzleClient): Promise<void> {
  await seedCaseTrackingRoles(db);
  await seedTicketSlaDefaults(db);
}
