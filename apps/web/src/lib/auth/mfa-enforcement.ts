/**
 * ID2-03: Admin MFA Enrollment & Enforcement
 * @task ID2-03
 *
 * provides mfa enforcement middleware and helpers for operations
 * requiring elevated authenticator assurance levels (aal2).
 * includes a stub mfa client for dev/test environments.
 */

import { Result } from '@aptivo/types';

// -- types --

export type MfaError =
  | { readonly _tag: 'MfaRequired'; readonly challengeUrl: string }
  | { readonly _tag: 'MfaEnrollmentRequired'; readonly enrollUrl: string }
  | { readonly _tag: 'MfaServiceError'; readonly operation: string; readonly cause: unknown };

// sensitive operations that require aal2
export const SENSITIVE_OPERATIONS = [
  'platform/admin.view',
  'platform/admin.manage',
  'platform/roles.assign',
  'platform/audit.export',
  'platform/webhook.rotate',
] as const;

export type SensitiveOperation = (typeof SENSITIVE_OPERATIONS)[number];

export interface MfaEnforcementDeps {
  /** base URL for MFA challenge endpoint */
  challengeBaseUrl?: string; // default: '/api/auth/mfa/challenge'
  /** operations requiring aal2 */
  sensitiveOperations?: readonly string[];
}

/**
 * creates a middleware that checks if a request has sufficient
 * authenticator assurance level for the requested operation.
 * returns 403 with mfa_required error and challenge URL if aal is insufficient.
 */
export function createMfaEnforcement(deps: MfaEnforcementDeps = {}) {
  const challengeBaseUrl = deps.challengeBaseUrl ?? '/api/auth/mfa/challenge';
  const sensitiveOps = new Set(deps.sensitiveOperations ?? SENSITIVE_OPERATIONS);

  return {
    /**
     * check if the given operation requires mfa and if the user's aal is sufficient.
     * returns null if permitted, Response if mfa step-up is required.
     */
    requireMfa(permission: string, aal: string | undefined): Response | null {
      // only enforce on sensitive operations
      if (!sensitiveOps.has(permission)) return null;

      // aal2 = mfa completed, anything else requires step-up
      if (aal === 'aal2') return null;

      return new Response(
        JSON.stringify({
          type: 'https://aptivo.dev/errors/mfa-required',
          title: 'MFA Required',
          status: 403,
          detail: `Multi-factor authentication required for: ${permission}`,
          errorCode: 'mfa_required',
          mfaChallengeUrl: challengeBaseUrl,
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    },

    /** check if a permission is in the sensitive operations list */
    isSensitiveOperation(permission: string): boolean {
      return sensitiveOps.has(permission);
    },
  };
}

// -- mfa enrollment types (for API routes) --

export interface MfaEnrollResult {
  factorId: string;
  totpUri: string;
  qrCode: string;
}

export interface MfaVerifyResult {
  aal: string;
  factorId: string;
}

export interface MfaChallengeResult {
  challengeId: string;
  factorId: string;
}

// -- supabase mfa client interface --

export interface SupabaseMfaClient {
  enroll(params: {
    factorType: 'totp';
    friendlyName?: string;
  }): Promise<Result<MfaEnrollResult, MfaError>>;
  challenge(params: {
    factorId: string;
  }): Promise<Result<MfaChallengeResult, MfaError>>;
  verify(params: {
    factorId: string;
    challengeId: string;
    code: string;
  }): Promise<Result<MfaVerifyResult, MfaError>>;
  listFactors(): Promise<
    Result<{ totp: Array<{ id: string; friendlyName?: string; status: string }> }, MfaError>
  >;
}

/**
 * creates a stub mfa client for dev/test when supabase is not available.
 */
export function createMfaStubClient(): SupabaseMfaClient {
  return {
    async enroll(_params) {
      return Result.ok({
        factorId: 'stub-factor-id',
        totpUri: 'otpauth://totp/Aptivo:dev@test.com?secret=STUBTOTPSECRET&issuer=Aptivo',
        qrCode: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      });
    },
    async challenge(_params) {
      return Result.ok({ challengeId: 'stub-challenge-id', factorId: 'stub-factor-id' });
    },
    async verify(_params) {
      return Result.ok({ aal: 'aal2', factorId: 'stub-factor-id' });
    },
    async listFactors() {
      return Result.ok({ totp: [] });
    },
  };
}
