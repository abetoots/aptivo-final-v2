/**
 * ID2-03 / INF-04: MFA verification route
 * @task ID2-03
 * @task INF-04
 *
 * verifies a totp code against a previously issued challenge.
 * returns the new aal level on success.
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';
import type { SupabaseMfaClient } from '@/lib/auth/mfa-enforcement.js';

// resolve mfa client from composition root, fallback for test mode
async function getMfaClientFromRoot(): Promise<SupabaseMfaClient> {
  try {
    const { getMfaClient } = await import('@/lib/services.js');
    return getMfaClient();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('mfa: composition root import failed, falling back to stub — this should not happen in production', err);
    }
    const { createMfaStubClient } = await import('@/lib/auth/mfa-enforcement.js');
    return createMfaStubClient();
  }
}

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

  // resolve mfa client from composition root
  const client = await getMfaClientFromRoot();

  // pr-02: reject stub client in production
  if (process.env.NODE_ENV === 'production' && '_isStub' in client && client._isStub) {
    return new Response(
      JSON.stringify({ errorCode: 'mfa_unavailable', detail: 'MFA service not configured' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

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
