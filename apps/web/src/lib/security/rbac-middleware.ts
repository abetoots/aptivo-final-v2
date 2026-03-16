/**
 * P1.5-05: DB-backed RBAC permission check middleware
 * @task P1.5-05
 *
 * returns a middleware function that checks if the request has the required
 * permission. returns 401/403 ProblemDetails response on failure, null on success.
 *
 * in production: extract user from supabase JWT -> look up role permissions from DB
 * in dev mode: check x-user-role header -> look up role permissions from DB,
 *   falling back to stub behavior (accept any non-empty/non-anonymous role)
 *   when the DB is unavailable.
 */

import { extractUser, resolvePermissions, resolvePermissionsForRole, resolvePermissionsWithFederation } from './rbac-resolver.js';
import { createMfaEnforcement } from '../auth/mfa-enforcement.js';

// -- types --

export interface RbacCheckResult {
  /** null = permitted, Response = forbidden/unauthorized */
  (request: Request): Promise<Response | null>;
}

// -- per-request permission cache --
// weakmap keyed on Request ensures cache is GC'd when request is done
const permissionCache = new WeakMap<Request, Set<string>>();

// -- helpers --

function unauthorizedResponse(permission: string): Response {
  return new Response(
    JSON.stringify({
      type: 'https://aptivo.dev/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: `Authentication required for permission: ${permission}`,
    }),
    {
      status: 401,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function forbiddenResponse(permission: string): Response {
  return new Response(
    JSON.stringify({
      type: 'https://aptivo.dev/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: `Missing permission: ${permission}`,
    }),
    {
      status: 403,
      headers: { 'content-type': 'application/json' },
    },
  );
}

// -- lazy db import --

async function tryGetDb() {
  try {
    const { getDb } = await import('../db.js');
    return getDb();
  } catch {
    return null;
  }
}

// -- factory --

export function checkPermission(permission: string): RbacCheckResult {
  return async (request: Request): Promise<Response | null> => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // production: extract user from supabase JWT
      const user = await extractUser(request);
      if (!user) return unauthorizedResponse(permission);

      // check cache first
      let perms = permissionCache.get(request);
      if (!perms) {
        const db = await tryGetDb();
        if (!db) return forbiddenResponse(permission);
        perms = await resolvePermissions(user.userId, db);
        permissionCache.set(request, perms);
      }

      return perms.has(permission) ? null : forbiddenResponse(permission);
    }

    // dev/test mode: use x-user-role header for backward compatibility
    const role = request.headers.get('x-user-role');

    if (!role || role === 'anonymous') {
      return forbiddenResponse(permission);
    }

    // check cache first
    let perms = permissionCache.get(request);
    if (perms) {
      return perms.has(permission) ? null : forbiddenResponse(permission);
    }

    // try DB-backed role->permission lookup
    const db = await tryGetDb();
    if (db) {
      try {
        // check if we have a user id for user-based lookup
        const userId = request.headers.get('x-user-id');
        if (userId) {
          perms = await resolvePermissions(userId, db);
        } else {
          // fallback: resolve permissions by role name
          perms = await resolvePermissionsForRole(role, db);
        }
        permissionCache.set(request, perms);

        // if the role has any permissions in the DB, enforce them
        if (perms.size > 0) {
          return perms.has(permission) ? null : forbiddenResponse(permission);
        }
      } catch {
        // db query failed — fall through to stub behavior
      }
    }

    // stub fallback: accept any non-empty, non-anonymous role
    // preserves backward compatibility with existing tests
    return null;
  };
}

// -- blacklist-aware variant (ID2-06) --

/**
 * same as checkPermission but runs an optional blacklist check after
 * user extraction and before permission resolution. the blacklistCheck
 * callback receives the request and the jti claim (if available).
 */
// lazy mfa enforcement instance
const mfaEnforcement = createMfaEnforcement();

export function checkPermissionWithBlacklist(
  permission: string,
  blacklistCheck?: (request: Request, jti: string | undefined) => Promise<Response | null>,
): RbacCheckResult {
  return async (request: Request): Promise<Response | null> => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // production: extract user from supabase JWT
      const user = await extractUser(request);
      if (!user) return unauthorizedResponse(permission);

      // run blacklist check after user extraction, before mfa/permission resolution
      if (blacklistCheck) {
        const jti = request.headers.get('x-token-jti') ?? undefined;
        const blocked = await blacklistCheck(request, jti);
        if (blocked) return blocked;
      }

      // run mfa check — returns 403 if sensitive operation without aal2
      const mfaDenied = mfaEnforcement.requireMfa(permission, user.aal);
      if (mfaDenied) return mfaDenied;

      // check cache first
      let perms = permissionCache.get(request);
      if (!perms) {
        const db = await tryGetDb();
        if (!db) return forbiddenResponse(permission);
        // use federated resolution when idp-mapped roles are present
        if (user.federatedRoles && user.federatedRoles.length > 0) {
          perms = await resolvePermissionsWithFederation(user.userId, user.federatedRoles, db);
        } else {
          perms = await resolvePermissions(user.userId, db);
        }
        permissionCache.set(request, perms);
      }

      return perms.has(permission) ? null : forbiddenResponse(permission);
    }

    // dev/test mode: use x-user-role header for backward compatibility
    const role = request.headers.get('x-user-role');

    if (!role || role === 'anonymous') {
      return forbiddenResponse(permission);
    }

    // run blacklist check in dev mode too
    if (blacklistCheck) {
      const jti = request.headers.get('x-token-jti') ?? undefined;
      const blocked = await blacklistCheck(request, jti);
      if (blocked) return blocked;
    }

    // run mfa check in dev mode — uses x-user-aal header
    const devAal = request.headers.get('x-user-aal') ?? undefined;
    const mfaDenied = mfaEnforcement.requireMfa(permission, devAal);
    if (mfaDenied) return mfaDenied;

    // check cache first
    let perms = permissionCache.get(request);
    if (perms) {
      return perms.has(permission) ? null : forbiddenResponse(permission);
    }

    // try DB-backed role->permission lookup
    const db = await tryGetDb();
    if (db) {
      try {
        // check if we have a user id for user-based lookup
        const userId = request.headers.get('x-user-id');
        if (userId) {
          perms = await resolvePermissions(userId, db);
        } else {
          // fallback: resolve permissions by role name
          perms = await resolvePermissionsForRole(role, db);
        }
        permissionCache.set(request, perms);

        // if the role has any permissions in the DB, enforce them
        if (perms.size > 0) {
          return perms.has(permission) ? null : forbiddenResponse(permission);
        }
      } catch {
        // db query failed — fall through to stub behavior
      }
    }

    // stub fallback: accept any non-empty, non-anonymous role
    // preserves backward compatibility with existing tests
    return null;
  };
}
