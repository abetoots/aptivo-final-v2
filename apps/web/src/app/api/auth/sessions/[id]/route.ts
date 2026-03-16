/**
 * INF-07: session termination endpoint (wired to real service)
 * @task INF-07
 *
 * DELETE /api/auth/sessions/:id — terminate a specific session.
 * uses extractUser for authentication and getSessionLimitService for termination.
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';

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

  return new Response(
    JSON.stringify({ terminated: sessionId, userId: user.userId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
