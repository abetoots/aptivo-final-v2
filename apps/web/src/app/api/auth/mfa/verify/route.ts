/**
 * ID2-03: MFA verification route
 * @task ID2-03
 *
 * verifies a totp code against a previously issued challenge.
 * returns the new aal level on success.
 */

import { createMfaStubClient } from '@/lib/auth/mfa-enforcement.js';
import { extractUser } from '@/lib/security/rbac-resolver.js';

export async function POST(request: Request) {
  // verify the user is authenticated before allowing mfa verification
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required for MFA verification',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  let body: { factorId?: string; challengeId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'Request body must be valid JSON with factorId, challengeId, and code',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  if (!body.factorId || !body.challengeId || !body.code) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Missing Fields',
        status: 400,
        detail: 'factorId, challengeId, and code are required',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const client = createMfaStubClient();
  const result = await client.verify({
    factorId: body.factorId,
    challengeId: body.challengeId,
    code: body.code,
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/mfa-verification-failed',
        title: 'MFA Verification Failed',
        status: 401,
        detail: 'Invalid TOTP code',
        errorCode: 'mfa_invalid_code',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ aal: result.value.aal, factorId: result.value.factorId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
