/**
 * HITL2-00 / INF-07: session termination endpoint with token blacklisting
 * @task HITL2-00
 *
 * DELETE /api/auth/sessions/:id — terminate a specific session.
 * uses extractUser for authentication, getSessionLimitService for termination,
 * and getTokenBlacklist to revoke the session's JWT (fire-and-forget).
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';

/** default jwt lifetime in seconds — used as blacklist ttl */
const JWT_LIFETIME_SECONDS = 900;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: sessionId } = await params;

  // try to terminate via session service
  try {
    const { getSessionLimitService } = await import('@/lib/services.js');
    const service = getSessionLimitService();
    if (service) {
      const result = await service.removeSession(user.userId, sessionId);
      if (!result.ok) {
        return new Response(
          JSON.stringify({
            type: 'https://aptivo.dev/errors/session-removal-failed',
            title: 'Session Removal Failed',
            status: 500,
            detail: result.error.cause,
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        );
      }
    } else {
      // no session service available
      return new Response(
        JSON.stringify({
          type: 'https://aptivo.dev/errors/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Session management service not configured',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Session management service not available',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  // fire-and-forget: blacklist the session token so it is rejected immediately
  try {
    const { getTokenBlacklist } = await import('@/lib/services.js');
    const blacklist = getTokenBlacklist();
    if (blacklist) {
      const expiresAt = Math.floor(Date.now() / 1000) + JWT_LIFETIME_SECONDS;
      // intentionally not awaited — fire-and-forget
      blacklist.blacklist(sessionId, expiresAt).catch(() => {
        // swallow errors: blacklist is best-effort
      });
    }
  } catch {
    // blacklist service unavailable — proceed without blocking
  }

  return new Response(
    JSON.stringify({ terminated: sessionId, userId: user.userId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
