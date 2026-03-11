/**
 * ID-02: RBAC Middleware Types
 * @task ID-02
 * @frd FR-CORE-ID-002
 *
 * Injectable store interfaces and configuration for RBAC middleware.
 */

// ---------------------------------------------------------------------------
// role store interface (injectable — DB-decoupled)
// ---------------------------------------------------------------------------

export interface RoleRecord {
  userId: string;
  role: string;
  domain: string | null;
}

export interface RolePermissionRecord {
  role: string;
  permission: string;
}

/**
 * Store interface for RBAC queries.
 * Consumers inject a Drizzle-backed implementation; tests inject mocks.
 */
export interface RbacStore {
  /** returns active (non-revoked) roles for a user, optionally filtered by domain */
  getUserRoles(userId: string, domain?: string | null): Promise<RoleRecord[]>;

  /** returns permissions granted to a specific role */
  getRolePermissions(role: string): Promise<RolePermissionRecord[]>;
}

// ---------------------------------------------------------------------------
// rbac configuration
// ---------------------------------------------------------------------------

export interface RbacConfig {
  /** cache TTL in milliseconds (default 60_000 = 60s) */
  cacheTtlMs?: number;
}

export const DEFAULT_RBAC_CONFIG: Required<RbacConfig> = {
  cacheTtlMs: 60_000,
};

// ---------------------------------------------------------------------------
// authorization result
// ---------------------------------------------------------------------------

export type AuthzResult =
  | { allowed: true }
  | { allowed: false; reason: string };
