/**
 * ID2-03 / INF-04: MFA enrollment route
 * @task ID2-03
 * @task INF-04
 *
 * initiates totp enrollment for the current user.
 * uses composition root mfa client with fallback for test mode.
 */

import { extractUser } from '@/lib/security/rbac-resolver.js';
import type { SupabaseMfaClient } from '@/lib/auth/mfa-enforcement.js';

// resolve mfa client from composition root, fallback for test mode
async function getMfaClientFromRoot(): Promise<SupabaseMfaClient> {
  try {
    const { getMfaClient } = await import('@/lib/services.js');
    return getMfaClient();
  } catch (err) {
    // fallback if composition root not available (test mode)
    if (process.env.NODE_ENV === 'production') {
      console.error('mfa: composition root import failed, falling back to stub — this should not happen in production', err);
    }
    const { createMfaStubClient } = await import('@/lib/auth/mfa-enforcement.js');
    return createMfaStubClient();
  }
}

export async function GET(request: Request) {
  // verify the user is authenticated before allowing mfa enrollment
  const user = await extractUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required for MFA enrollment',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  // resolve mfa client from composition root
  const client = await getMfaClientFromRoot();
  const result = await client.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/mfa-enrollment-failed',
        title: 'MFA Enrollment Failed',
        status: 500,
        detail: result.error.cause,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify(result.value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
