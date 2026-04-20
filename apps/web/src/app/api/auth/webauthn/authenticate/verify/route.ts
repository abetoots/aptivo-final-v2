/**
 * ID2-04: WebAuthn authentication verification route
 * @task ID2-04
 *
 * verifies a webauthn authentication response and updates the counter.
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
        detail: 'Authentication required for WebAuthn authentication',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const body = (parsedBody ?? {}) as { credentialId?: string; counter?: number };

  if (!body.credentialId || body.counter === undefined) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Missing Fields',
        status: 400,
        detail: 'credentialId and counter are required',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  // validate counter is a non-negative integer
  if (typeof body.counter !== 'number' || !Number.isInteger(body.counter) || body.counter < 0) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Invalid Counter',
        status: 400,
        detail: 'counter must be a non-negative integer',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const service = getWebAuthnService();
  // pass userId for ownership verification
  const result = await service.verifyAuthentication(body.credentialId, body.counter, user.userId);

  if (!result.ok) {
    const status = result.error._tag === 'WebAuthnCredentialNotFound' ? 404 : 401;
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/webauthn-authentication-failed',
        title: 'Authentication Verification Failed',
        status,
        detail: result.error._tag === 'WebAuthnCredentialNotFound'
          ? `Credential not found: ${result.error.credentialId}`
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
