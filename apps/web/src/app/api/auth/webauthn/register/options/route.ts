/**
 * ID2-04: WebAuthn registration options route
 * @task ID2-04
 *
 * generates registration options for the authenticated user.
 * requires auth via x-user-id header (dev) or supabase jwt (production).
 */

import { type NextRequest } from 'next/server';
import { extractUser } from '@/lib/security/rbac-resolver.js';
import { withBodyLimits } from '@/lib/security/route-guard.js';
import { getWebAuthnService } from '@/lib/services.js';

async function handlePost(request: NextRequest, parsedBody: unknown) {
  // verify authentication
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required for WebAuthn registration',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  // friendly name is optional
  const friendlyName = (parsedBody as { friendlyName?: string } | undefined)?.friendlyName;

  const service = getWebAuthnService();
  const result = await service.generateRegistrationOptions(
    user.userId,
    user.email ?? 'unknown',
  );

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/webauthn-registration-failed',
        title: 'Registration Options Failed',
        status: 500,
        detail: result.error.message,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  // attach friendly name hint for client-side use
  return new Response(
    JSON.stringify({ ...result.value, friendlyName }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const POST = withBodyLimits(handlePost);
