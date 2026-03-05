import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function middleware(_request: NextRequest) {
  // TODO: Implement Supabase Auth middleware (SP-03)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except health, static, and _next
    '/((?!health|_next/static|_next/image|favicon.ico).*)',
  ],
};
