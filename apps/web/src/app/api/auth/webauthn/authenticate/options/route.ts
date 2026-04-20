/**
 * ID2-04: WebAuthn authentication options route
 * @task ID2-04
 *
 * generates authentication options for the authenticated user.
 * requires auth via x-user-id header (dev) or supabase jwt (production).
 */

import { type NextRequest } from 'next/server';
import { extractUser } from '@/lib/security/rbac-resolver.js';
import { withBodyLimits } from '@/lib/security/route-guard.js';
import { getWebAuthnService } from '@/lib/services.js';

async function handlePost(request: NextRequest, _parsedBody: unknown) {
  // verify authentication
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required for WebAuthn authentication',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const service = getWebAuthnService();
  const result = await service.generateAuthenticationOptions(user.userId);

  if (!result.ok) {
    const status = result.error._tag === 'WebAuthnNotAvailable' ? 404 : 500;
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/webauthn-authentication-failed',
        title: 'Authentication Options Failed',
        status,
        detail: result.error._tag === 'WebAuthnNotAvailable'
          ? result.error.reason
          : result.error.message,
      }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify(result.value),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const POST = withBodyLimits(handlePost);
