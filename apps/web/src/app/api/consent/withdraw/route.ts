/**
 * FEAT-04: Consent withdrawal endpoint
 * @task FEAT-04
 *
 * POST /api/consent/withdraw — withdraws user consent for a given category.
 * requires authentication via extractUser.
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';

export async function POST(request: Request) {
  // authenticate
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
      }),
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid JSON body',
      }),
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // load consent service from composition root
  try {
    const { getConsentService } = await import('@/lib/services.js');
    const service = getConsentService();
    // enforce ownership: use authenticated user's id, not body-supplied userId
    const safeInput = { ...(body as Record<string, unknown>), userId: user.userId };
    const result = await service.withdrawConsent(safeInput);

    if (!result.ok) {
      const status = result.error._tag === 'ValidationError' ? 400 : 500;
      return new Response(
        JSON.stringify({
          type: `https://aptivo.dev/errors/${result.error._tag === 'ValidationError' ? 'validation-error' : 'internal-error'}`,
          title: result.error._tag === 'ValidationError' ? 'Validation Error' : 'Internal Error',
          status,
          detail: result.error._tag === 'ValidationError' ? result.error.message : 'Consent withdrawal failed',
        }),
        { status, headers: { 'content-type': 'application/problem+json' } },
      );
    }

    return new Response(
      JSON.stringify({ data: result.value }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/internal-error',
        title: 'Internal Error',
        status: 500,
        detail: 'Service unavailable',
      }),
      { status: 500, headers: { 'content-type': 'application/problem+json' } },
    );
  }
}
