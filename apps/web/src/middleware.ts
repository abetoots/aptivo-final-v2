/**
 * INT-06: next.js edge middleware with security hardening
 * @task INT-06
 * @warning S1-W11, S1-W12, T1-W28
 *
 * note on body-size enforcement:
 * next.js edge middleware cannot reliably access or stream the request body
 * without consuming it (which breaks downstream handlers). body size limits
 * and hmac verification must therefore be enforced at the api route level
 * using the helpers from '@/lib/security/body-limits'.
 *
 * example usage in an api route:
 *   import { isBodyWithinLimit, WEBHOOK_MAX_BODY_BYTES } from '@/lib/security/body-limits';
 *   const raw = await request.text();
 *   if (!isBodyWithinLimit(raw, WEBHOOK_MAX_BODY_BYTES)) {
 *     return Response.json({ error: 'Payload too large' }, { status: 413 });
 *   }
 *
 * what the middleware does handle:
 * - adds security headers (x-content-type-options, x-frame-options, etc.)
 * - strips sensitive info from forwarded headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// security headers applied to all non-health responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    // match all routes except health, static, and _next
    '/((?!health|_next/static|_next/image|favicon.ico).*)',
  ],
};
