/**
 * ID-02: RBAC Middleware
 * @task ID-02
 * @frd FR-CORE-ID-002
 * @guidelines §2.2 (Zero Trust — default-deny)
 *
 * Role-checking middleware factories with:
 * - Default-deny enforcement
 * - Domain-scoped role checks
 * - In-memory cache with configurable TTL
 * - Injectable store (DB-decoupled)
 */

import type {
  RbacStore,
  RbacConfig,
  AuthzResult,
} from './rbac-types.js';
import { DEFAULT_RBAC_CONFIG } from './rbac-types.js';

// ---------------------------------------------------------------------------
// cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class RbacCache {
  private roles = new Map<string, CacheEntry<string[]>>();
  private permissions = new Map<string, CacheEntry<string[]>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  private cacheKey(userId: string, domain?: string | null): string {
    return `${userId}:${domain ?? '*'}`;
  }

  getRoles(userId: string, domain?: string | null): string[] | null {
    const entry = this.roles.get(this.cacheKey(userId, domain));
    if (!entry || Date.now() > entry.expiresAt) {
      return null;
    }
    return entry.value;
  }

  setRoles(userId: string, domain: string | null | undefined, roles: string[]): void {
    this.roles.set(this.cacheKey(userId, domain), {
      value: roles,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  getPermissions(role: string): string[] | null {
    const entry = this.permissions.get(role);
    if (!entry || Date.now() > entry.expiresAt) {
      return null;
    }
    return entry.value;
  }

  setPermissions(role: string, permissions: string[]): void {
    this.permissions.set(role, {
      value: permissions,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.roles.clear();
    this.permissions.clear();
  }
}

// ---------------------------------------------------------------------------
// rbac service
// ---------------------------------------------------------------------------

export class RbacService {
  private readonly store: RbacStore;
  private readonly cache: RbacCache;

  constructor(store: RbacStore, config?: RbacConfig) {
    const cfg = { ...DEFAULT_RBAC_CONFIG, ...config };
    this.store = store;
    this.cache = new RbacCache(cfg.cacheTtlMs);
  }

  /**
   * Checks if a user has a specific role.
   * Supports domain-scoped roles (domain=null checks platform-wide roles).
   */
  async requireRole(
    userId: string,
    role: string,
    domain?: string | null,
  ): Promise<AuthzResult> {
    const roles = await this.getUserRoles(userId, domain);

    if (roles.includes(role)) {
      return { allowed: true };
    }

    // also check platform-wide roles if domain-specific check was made
    if (domain) {
      const platformRoles = await this.getUserRoles(userId, null);
      if (platformRoles.includes(role)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: domain
        ? `User ${userId} does not have role '${role}' in domain '${domain}'`
        : `User ${userId} does not have role '${role}'`,
    };
  }

  /**
   * Checks if a user has a specific permission via their roles.
   * Walks: user → roles → role_permissions → check permission string.
   */
  async requirePermission(
    userId: string,
    permission: string,
    domain?: string | null,
  ): Promise<AuthzResult> {
    // get user's active roles (domain-scoped + platform-wide)
    const domainRoles = await this.getUserRoles(userId, domain);
    const platformRoles = domain ? await this.getUserRoles(userId, null) : [];
    const allRoles = [...new Set([...domainRoles, ...platformRoles])];

    if (allRoles.length === 0) {
      return {
        allowed: false,
        reason: `User ${userId} has no active roles`,
      };
    }

    // check each role for the required permission
    for (const role of allRoles) {
      const permissions = await this.getRolePermissions(role);
      if (permissions.includes(permission)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `User ${userId} lacks permission '${permission}'`,
    };
  }

  /** clears the internal cache (for testing) */
  clearCache(): void {
    this.cache.clear();
  }

  // -----------------------------------------------------------------------
  // private helpers
  // -----------------------------------------------------------------------

  private async getUserRoles(userId: string, domain?: string | null): Promise<string[]> {
    const cached = this.cache.getRoles(userId, domain);
    if (cached !== null) {
      return cached;
    }

    try {
      const records = await this.store.getUserRoles(userId, domain);
      const roles = records.map((r) => r.role);
      this.cache.setRoles(userId, domain, roles);
      return roles;
    } catch {
      // fail-closed: store unavailable → no roles (§2.2 zero trust)
      return [];
    }
  }

  private async getRolePermissions(role: string): Promise<string[]> {
    const cached = this.cache.getPermissions(role);
    if (cached !== null) {
      return cached;
    }

    try {
      const records = await this.store.getRolePermissions(role);
      const permissions = records.map((r) => r.permission);
      this.cache.setPermissions(role, permissions);
      return permissions;
    } catch {
      // fail-closed: store unavailable → no permissions (§2.2 zero trust)
      return [];
    }
  }
}
