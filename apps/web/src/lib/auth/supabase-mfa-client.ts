/**
 * PR-01: Supabase Pro OIDC SSO + MFA Config — Real MFA Client
 * @task PR-01
 *
 * wraps supabase auth mfa methods behind the aptivo result pattern.
 * replaces the stub client in production when NEXT_PUBLIC_SUPABASE_URL is set.
 */

import { Result } from '@aptivo/types';

// -- result types --

export interface MfaEnrollResult {
  factorId: string;
  totpUri: string;
  qrCode: string;
}

export interface MfaChallengeResult {
  challengeId: string;
}

export interface MfaVerifyResult {
  aal: 'aal1' | 'aal2';
}

// -- error type --

export type MfaClientError =
  | { readonly _tag: 'EnrollError'; readonly cause: unknown }
  | { readonly _tag: 'ChallengeError'; readonly cause: unknown }
  | { readonly _tag: 'VerifyError'; readonly cause: unknown }
  | { readonly _tag: 'ListError'; readonly cause: unknown };

// -- supabase auth client interface (structural typing) --

export interface SupabaseAuthClient {
  mfa: {
    enroll: (params: {
      factorType: 'totp';
      friendlyName?: string;
    }) => Promise<{
      data: { id: string; totp: { uri: string; qr_code: string } } | null;
      error: { message: string } | null;
    }>;
    challenge: (params: {
      factorId: string;
    }) => Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>;
    verify: (params: {
      factorId: string;
      challengeId: string;
      code: string;
    }) => Promise<{
      data: { session: { aal: string } } | null;
      error: { message: string } | null;
    }>;
    listFactors: () => Promise<{
      data: {
        all: Array<{
          id: string;
          type: string;
          friendly_name?: string;
          status: string;
        }>;
      } | null;
      error: { message: string } | null;
    }>;
  };
}

// -- factory --

export function createSupabaseMfaClient(supabaseAuth: SupabaseAuthClient) {
  return {
    async enroll(params: {
      factorType: 'totp';
      friendlyName?: string;
    }): Promise<Result<MfaEnrollResult, MfaClientError>> {
      const { data, error } = await supabaseAuth.mfa.enroll(params);
      if (error || !data) {
        return Result.err({ _tag: 'EnrollError', cause: error ?? new Error('no data') });
      }
      return Result.ok({
        factorId: data.id,
        totpUri: data.totp.uri,
        qrCode: data.totp.qr_code,
      });
    },

    async challenge(factorId: string): Promise<Result<MfaChallengeResult, MfaClientError>> {
      const { data, error } = await supabaseAuth.mfa.challenge({ factorId });
      if (error || !data) {
        return Result.err({ _tag: 'ChallengeError', cause: error ?? new Error('no data') });
      }
      return Result.ok({ challengeId: data.id });
    },

    async verify(params: {
      factorId: string;
      challengeId: string;
      code: string;
    }): Promise<Result<MfaVerifyResult, MfaClientError>> {
      const { data, error } = await supabaseAuth.mfa.verify(params);
      if (error || !data) {
        return Result.err({ _tag: 'VerifyError', cause: error ?? new Error('no data') });
      }
      return Result.ok({ aal: data.session.aal as 'aal1' | 'aal2' });
    },

    async listFactors(): Promise<
      Result<
        Array<{ id: string; type: string; friendlyName?: string; status: string }>,
        MfaClientError
      >
    > {
      const { data, error } = await supabaseAuth.mfa.listFactors();
      if (error || !data) {
        return Result.err({ _tag: 'ListError', cause: error ?? new Error('no data') });
      }
      return Result.ok(
        data.all.map((f) => ({
          id: f.id,
          type: f.type,
          friendlyName: f.friendly_name,
          status: f.status,
        })),
      );
    },

    // marker for stub detection — production client is never a stub
    _isStub: false as const,
  };
}
