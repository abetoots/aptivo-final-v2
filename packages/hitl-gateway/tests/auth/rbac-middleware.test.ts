/**
 * @testcase ID-02-RBAC-001 through ID-02-RBAC-011
 * @task ID-02
 * @frd FR-CORE-ID-002
 *
 * Tests the RBAC middleware:
 * - requireRole: rejects/allows based on user role
 * - requirePermission: walks role → permission mapping
 * - Domain-scoped roles
 * - Default-deny (no roles = denied)
 * - Cache: second call within TTL doesn't hit store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RbacService } from '../../src/auth/rbac-middleware.js';
import type { RbacStore, RoleRecord, RolePermissionRecord } from '../../src/auth/rbac-types.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ADMIN_ID = 'admin-001';

function mockStore(overrides?: Partial<RbacStore>): RbacStore {
  return {
    getUserRoles: vi.fn(async () => []),
    getRolePermissions: vi.fn(async () => []),
    ...overrides,
  };
}

function rolesFor(roles: Array<{ role: string; domain?: string | null }>): RoleRecord[] {
  return roles.map((r) => ({
    userId: USER_ID,
    role: r.role,
    domain: r.domain ?? null,
  }));
}

function permsFor(entries: Array<{ role: string; permission: string }>): RolePermissionRecord[] {
  return entries.map((e) => ({
    role: e.role,
    permission: e.permission,
  }));
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('ID-02: RBAC Middleware', () => {
  // -----------------------------------------------------------------------
  // requireRole
  // -----------------------------------------------------------------------

  describe('requireRole', () => {
    it('rejects user without the required role (default-deny)', async () => {
      const store = mockStore();
      const rbac = new RbacService(store);

      const result = await rbac.requireRole(USER_ID, 'admin');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('does not have role');
        expect(result.reason).toContain('admin');
      }
    });

    it('allows user with the required role', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => rolesFor([{ role: 'admin' }])),
      });
      const rbac = new RbacService(store);

      const result = await rbac.requireRole(USER_ID, 'admin');

      expect(result.allowed).toBe(true);
    });

    it('checks domain-scoped roles', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async (userId, domain) => {
          if (domain === 'crypto') return rolesFor([{ role: 'trader', domain: 'crypto' }]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      // user has trader in crypto domain
      const allowed = await rbac.requireRole(USER_ID, 'trader', 'crypto');
      expect(allowed.allowed).toBe(true);

      // user does NOT have trader in hr domain
      rbac.clearCache();
      const denied = await rbac.requireRole(USER_ID, 'trader', 'hr');
      expect(denied.allowed).toBe(false);
    });

    it('platform-wide role satisfies domain check', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async (_userId, domain) => {
          // platform-wide admin role (domain=null)
          if (domain === null) return rolesFor([{ role: 'admin', domain: null }]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      // admin role is platform-wide, should pass domain check
      const result = await rbac.requireRole(USER_ID, 'admin', 'crypto');
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // requirePermission
  // -----------------------------------------------------------------------

  describe('requirePermission', () => {
    it('rejects user with no roles (default-deny)', async () => {
      const store = mockStore();
      const rbac = new RbacService(store);

      const result = await rbac.requirePermission(USER_ID, 'hitl:approve');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('no active roles');
      }
    });

    it('allows user whose role has the required permission', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => rolesFor([{ role: 'user' }])),
        getRolePermissions: vi.fn(async (role) => {
          if (role === 'user') return permsFor([
            { role: 'user', permission: 'hitl:approve' },
            { role: 'user', permission: 'llm:query' },
          ]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      const result = await rbac.requirePermission(USER_ID, 'hitl:approve');

      expect(result.allowed).toBe(true);
    });

    it('rejects user whose role lacks the required permission', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => rolesFor([{ role: 'viewer' }])),
        getRolePermissions: vi.fn(async (role) => {
          if (role === 'viewer') return permsFor([
            { role: 'viewer', permission: 'dashboard:read' },
          ]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      const result = await rbac.requirePermission(USER_ID, 'hitl:approve');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('lacks permission');
      }
    });

    it('checks permissions across multiple roles', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => rolesFor([
          { role: 'viewer' },
          { role: 'user' },
        ])),
        getRolePermissions: vi.fn(async (role) => {
          if (role === 'viewer') return permsFor([{ role: 'viewer', permission: 'dashboard:read' }]);
          if (role === 'user') return permsFor([{ role: 'user', permission: 'hitl:approve' }]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      const result = await rbac.requirePermission(USER_ID, 'hitl:approve');

      expect(result.allowed).toBe(true);
    });

    it('domain-scoped permission check includes platform-wide roles', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async (_userId, domain) => {
          if (domain === null) return rolesFor([{ role: 'admin', domain: null }]);
          return [];
        }),
        getRolePermissions: vi.fn(async (role) => {
          if (role === 'admin') return permsFor([
            { role: 'admin', permission: 'hitl:approve' },
            { role: 'admin', permission: 'admin:users' },
          ]);
          return [];
        }),
      });
      const rbac = new RbacService(store);

      // platform-wide admin should have permission even in domain context
      const result = await rbac.requirePermission(USER_ID, 'hitl:approve', 'crypto');

      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // cache behavior
  // -----------------------------------------------------------------------

  describe('cache', () => {
    it('second call within TTL does not hit store', async () => {
      const getUserRoles = vi.fn(async () => rolesFor([{ role: 'admin' }]));
      const store = mockStore({ getUserRoles });
      const rbac = new RbacService(store, { cacheTtlMs: 60_000 });

      // first call — hits store
      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledOnce();

      // second call — served from cache
      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledOnce(); // still 1 call
    });

    it('call after TTL expires hits store again', async () => {
      const getUserRoles = vi.fn(async () => rolesFor([{ role: 'admin' }]));
      const store = mockStore({ getUserRoles });
      const rbac = new RbacService(store, { cacheTtlMs: 1 }); // 1ms TTL

      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledOnce();

      // wait for TTL to expire
      await new Promise((r) => setTimeout(r, 10));

      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledTimes(2);
    });

    it('denies access when getUserRoles throws (fail-closed)', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => { throw new Error('DB connection lost'); }),
      });
      const rbac = new RbacService(store);

      const roleResult = await rbac.requireRole(USER_ID, 'admin');
      expect(roleResult.allowed).toBe(false);

      const permResult = await rbac.requirePermission(USER_ID, 'hitl:approve');
      expect(permResult.allowed).toBe(false);
    });

    it('denies access when getRolePermissions throws (fail-closed)', async () => {
      const store = mockStore({
        getUserRoles: vi.fn(async () => rolesFor([{ role: 'admin' }])),
        getRolePermissions: vi.fn(async () => { throw new Error('DB timeout'); }),
      });
      const rbac = new RbacService(store);

      // user has role, but permission lookup fails → denied
      const result = await rbac.requirePermission(USER_ID, 'hitl:approve');
      expect(result.allowed).toBe(false);
    });

    it('clearCache forces fresh store queries', async () => {
      const getUserRoles = vi.fn(async () => rolesFor([{ role: 'admin' }]));
      const store = mockStore({ getUserRoles });
      const rbac = new RbacService(store, { cacheTtlMs: 60_000 });

      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledOnce();

      rbac.clearCache();

      await rbac.requireRole(USER_ID, 'admin');
      expect(getUserRoles).toHaveBeenCalledTimes(2);
    });
  });
});
