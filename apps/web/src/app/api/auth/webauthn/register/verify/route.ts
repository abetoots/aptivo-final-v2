/**
 * ID2-04: WebAuthn registration verification route
 * @task ID2-04
 *
 * verifies a webauthn registration response and stores the credential.
 * requires auth via x-user-id header (dev) or supabase jwt (production).
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';
import { getWebAuthnService } from '@/lib/services.js';

export async function POST(request: Request) {
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

  // parse request body
  let body: {
    credentialId?: string;
    publicKey?: string;
    counter?: number;
    transports?: string;
    friendlyName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'Request body must be valid JSON',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  if (!body.credentialId || !body.publicKey || body.counter === undefined) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Missing Fields',
        status: 400,
        detail: 'credentialId, publicKey, and counter are required',
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
  const result = await service.verifyRegistration(
    user.userId,
    body.credentialId,
    body.publicKey,
    body.counter,
    body.transports,
    body.friendlyName,
  );

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/webauthn-registration-failed',
        title: 'Registration Verification Failed',
        status: 500,
        detail: result.error.message,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify(result.value),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
