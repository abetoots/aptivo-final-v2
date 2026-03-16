/**
 * ID2-03: MFA enrollment route
 * @task ID2-03
 *
 * initiates totp enrollment for the current user.
 * in production, would use supabase mfa api.
 */

import { createMfaStubClient } from '@/lib/auth/mfa-enforcement.js';
import { extractUser } from '@/lib/security/rbac-resolver.js';

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

  // in production, would use supabase mfa api
  const client = createMfaStubClient();
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
