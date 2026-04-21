/**
 * WFE3-02: WebSocket JWT verification.
 *
 * Generic HS256 verifier used by the ws-server to validate auth frames.
 * Deliberately a parallel implementation to HITL's jwt-manager (which is
 * tightly coupled to HITL-specific claims like channel, action, jti
 * replay). Extracting a truly shared module that serves both sides
 * requires a refactor of HITL's call sites and is tracked as S17 work.
 *
 * Returns only what the ws protocol needs: userId (sub), roles, and the
 * expiry timestamp (used to schedule a mid-session expiry close per spec).
 */

import { Result } from '@aptivo/types';
import { jwtVerify, errors as joseErrors } from 'jose';

export interface WsAuthClaims {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly expMs: number;
}

export type WsAuthError =
  | { readonly _tag: 'Expired' }
  | { readonly _tag: 'InvalidSignature' }
  | { readonly _tag: 'InvalidClaim'; readonly detail: string }
  | { readonly _tag: 'Malformed'; readonly detail: string };

export interface VerifyWsTokenOptions {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  /** allowed algorithms; defaults to HS256 only */
  readonly algorithms?: readonly string[];
}

export async function verifyWsToken(
  token: string,
  opts: VerifyWsTokenOptions,
): Promise<Result<WsAuthClaims, WsAuthError>> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(opts.secret), {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: [...(opts.algorithms ?? ['HS256'])],
    });

    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      return Result.err({ _tag: 'Malformed', detail: 'sub claim missing or not a string' });
    }

    const rawRoles = (payload as { roles?: unknown }).roles;
    const roles = Array.isArray(rawRoles) ? rawRoles.filter((r): r is string => typeof r === 'string') : [];

    const exp = payload.exp;
    if (typeof exp !== 'number') {
      return Result.err({ _tag: 'Malformed', detail: 'exp claim missing or not a number' });
    }

    return Result.ok({ userId: sub, roles, expMs: exp * 1000 });
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return Result.err({ _tag: 'Expired' });
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      return Result.err({ _tag: 'InvalidClaim', detail: err.message });
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return Result.err({ _tag: 'InvalidSignature' });
    }
    return Result.err({ _tag: 'Malformed', detail: err instanceof Error ? err.message : String(err) });
  }
}
