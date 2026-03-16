/**
 * ID2-01: SSO status endpoint
 * @task ID2-01
 *
 * returns the list of configured oidc providers and whether sso is enabled.
 * used by the frontend to conditionally show sso login options.
 */

import { loadProvidersFromEnv } from '@/lib/auth/oidc-provider.js';

export async function GET() {
  const providersResult = loadProvidersFromEnv();

  if (!providersResult.ok) {
    return new Response(
      JSON.stringify({
        configured: false,
        error: providersResult.error.message,
        providers: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const providers = providersResult.value;
  return new Response(
    JSON.stringify({
      configured: providers.length > 0,
      providers: providers.map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        domains: p.domains,
      })),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
