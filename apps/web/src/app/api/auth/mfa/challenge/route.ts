/**
 * ID2-03: MFA challenge route
 * @task ID2-03
 *
 * initiates a totp challenge for a given factor.
 * the returned challenge id is used with the verify endpoint.
 */

import { createMfaStubClient } from '@/lib/auth/mfa-enforcement.js';
import { extractUser } from '@/lib/security/rbac-resolver.js';

export async function POST(request: Request) {
  // verify the user is authenticated before allowing mfa challenge
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required for MFA challenge',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: { factorId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'Request body must be valid JSON with factorId',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  if (!body.factorId) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Missing Fields',
        status: 400,
        detail: 'factorId is required',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const client = createMfaStubClient();
  const result = await client.challenge({ factorId: body.factorId });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/mfa-challenge-failed',
        title: 'MFA Challenge Failed',
        status: 500,
        detail: 'Failed to initiate MFA challenge',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify(result.value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
