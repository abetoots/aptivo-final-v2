/**
 * ID2-01: SSO discovery endpoint
 * @task ID2-01
 *
 * resolves the oidc provider config for a given email domain.
 * the client uses this to initiate the correct sso redirect via supabase.
 */

import { createClaimMapper, loadProvidersFromEnv } from '@/lib/auth/oidc-provider.js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get('domain');

  if (!domain) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/validation',
        title: 'Missing domain parameter',
        status: 400,
        detail: 'The "domain" query parameter is required for SSO login',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const providersResult = loadProvidersFromEnv();
  if (!providersResult.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/internal',
        title: 'SSO Configuration Error',
        status: 500,
        detail: providersResult.error.message,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const mapper = createClaimMapper({ providers: providersResult.value });
  const providerResult = mapper.findProviderByDomain(domain);

  if (!providerResult.ok) {
    return new Response(
      JSON.stringify({
        type: 'https://aptivo.dev/errors/not-found',
        title: 'SSO Provider Not Found',
        status: 404,
        detail: `No SSO provider configured for domain: ${domain}`,
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  }

  const provider = providerResult.value;

  // return the sso configuration (client handles the actual redirect via supabase)
  return new Response(
    JSON.stringify({
      providerId: provider.providerId,
      issuerUrl: provider.issuerUrl,
      clientId: provider.clientId,
      displayName: provider.displayName,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
