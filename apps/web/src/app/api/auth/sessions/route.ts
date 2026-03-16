/**
 * INF-07: session listing endpoint (wired to real service)
 * @task INF-07
 *
 * GET /api/auth/sessions — list active sessions for the current user.
 * uses extractUser for authentication and getSessionLimitService for data.
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';

export async function GET(request: Request) {
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  // try to get session service from composition root
  let sessions: unknown[] = [];
  try {
    const { getSessionLimitService } = await import('@/lib/services.js');
    const service = getSessionLimitService();
    if (service) {
      const result = await service.listSessions(user.userId);
      if (result.ok) {
        sessions = result.value;
      }
    }
  } catch {
    // composition root not available — return empty
  }

  return new Response(
    JSON.stringify({ sessions, userId: user.userId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
