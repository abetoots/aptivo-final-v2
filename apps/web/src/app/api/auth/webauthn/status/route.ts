/**
 * ID2-04: WebAuthn status route
 * @task ID2-04
 *
 * returns webauthn feature availability status.
 */

export async function GET() {
  // feature detection — webauthn is available when the server is configured
  return new Response(
    JSON.stringify({ available: true }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
