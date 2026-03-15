/**
 * P1.5-05: DB-backed RBAC resolver
 * @task P1.5-05
 *
 * extracts user identity from request (supabase JWT in production,
 * x-user-id header in dev) and resolves permissions from DB via
 * the user_roles + role_permissions tables.
 */

import { eq, and, isNull } from 'drizzle-orm';
import { userRoles, rolePermissions } from '@aptivo/database';
import type { DrizzleClient } from '@aptivo/database/adapters';

// -- types --

export interface ExtractedUser {
  userId: string;
  email: string;
}

// -- user extraction --

/**
 * extracts user identity from the request.
 * - production: attempts supabase JWT extraction via @supabase/ssr
 * - dev/test: falls back to x-user-id header
 */
export async function extractUser(request: Request): Promise<ExtractedUser | null> {
  // in production, try supabase JWT extraction
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      // dynamic import — @supabase/ssr may not be installed
      const { createServerClient } = await import('@supabase/ssr');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            // extract cookies from the request cookie header
            const cookieHeader = request.headers.get('cookie') ?? '';
            return cookieHeader.split(';').map((c) => {
              const [name, ...rest] = c.trim().split('=');
              return { name: name ?? '', value: rest.join('=') };
            });
          },
          setAll() {
            // read-only context — no-op
          },
        },
      });

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;

      return { userId: user.id, email: user.email ?? '' };
    } catch {
      // @supabase/ssr not installed or other error — fall through to dev mode
      return null;
    }
  }

  // dev/test mode: use x-user-id header
  const userId = request.headers.get('x-user-id');
  if (!userId) return null;

  return { userId, email: 'dev@test.com' };
}

// -- permission resolution --

/**
 * resolves all active permissions for a given user by joining
 * user_roles (where revokedAt IS NULL) with role_permissions.
 */
export async function resolvePermissions(
  userId: string,
  db: DrizzleClient,
): Promise<Set<string>> {
  const rows = await db
    .select({ permission: rolePermissions.permission })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.role, rolePermissions.role))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

  return new Set(rows.map((r: { permission: string }) => r.permission));
}

/**
 * resolves all permissions for a given role name (used for dev-mode
 * x-user-role header fallback where we have a role but no userId).
 */
export async function resolvePermissionsForRole(
  role: string,
  db: DrizzleClient,
): Promise<Set<string>> {
  const rows = await db
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role));

  return new Set(rows.map((r: { permission: string }) => r.permission));
}
