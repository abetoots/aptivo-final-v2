/**
 * PR-02: MFA Client Resolution Logic
 * @task PR-02
 *
 * pure function that decides which mfa client to use based on env vars.
 * no side effects, no async, no heavy imports — safe to import in tests.
 */

// -- resolution result type --

export type MfaClientResolution =
  | { readonly type: 'real'; readonly url: string }
  | { readonly type: 'stub' }
  | { readonly type: 'error'; readonly message: string };

// -- resolver --

/**
 * given env vars, decide which mfa client to use:
 * - real supabase client when NEXT_PUBLIC_SUPABASE_URL is set
 * - stub in non-production when url is missing
 * - error in production when url is missing
 */
export function resolveMfaClient(env: {
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
}): MfaClientResolution {
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    return { type: 'real', url: env.NEXT_PUBLIC_SUPABASE_URL };
  }

  // production guard — refuse to start with stub in production
  if (env.NODE_ENV === 'production') {
    return {
      type: 'error',
      message: 'NEXT_PUBLIC_SUPABASE_URL is required in production — MFA stub is not allowed',
    };
  }

  return { type: 'stub' };
}
