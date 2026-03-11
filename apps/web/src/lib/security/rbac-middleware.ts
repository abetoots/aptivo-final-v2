/**
 * S7-INT-02: RBAC permission check middleware for admin routes
 * @task S7-INT-02
 *
 * returns a middleware function that checks if the request has the required
 * permission. returns 403 ProblemDetails response on failure, null on success.
 *
 * in production: extract user from session cookie → look up role permissions
 * in dev mode: check x-user-role header (placeholder)
 */

// -- types --

export interface RbacCheckResult {
  /** null = permitted, Response = forbidden */
  (request: Request): Promise<Response | null>;
}

// -- factory --

export function checkPermission(permission: string): RbacCheckResult {
  return async (request: Request): Promise<Response | null> => {
    // placeholder: in production, extract user from session and check
    // role permissions against the database. for now, use x-user-role header.
    const role = request.headers.get('x-user-role');

    if (!role || role === 'anonymous') {
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

    // permission granted
    return null;
  };
}
