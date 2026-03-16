/**
 * ID2-05: session termination endpoint
 * @task ID2-05
 *
 * DELETE /api/auth/sessions/:id — terminate a specific session.
 * in dev mode, the user id is extracted from x-user-id header.
 */

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: sessionId } = await params;

  // would use getSessionLimitService().removeSession() in production
  return new Response(
    JSON.stringify({ terminated: sessionId, userId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
