/**
 * ID2-05: session listing endpoint
 * @task ID2-05
 *
 * GET /api/auth/sessions — list active sessions for the current user.
 * in dev mode, the user id is extracted from x-user-id header.
 */

export async function GET(request: Request) {
  // dev mode: use x-user-id header
  const userId = request.headers.get('x-user-id');
  if (!userId) {
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

  // would use getSessionLimitService() from composition root in production
  // for now, return empty list
  return new Response(
    JSON.stringify({ sessions: [], userId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
