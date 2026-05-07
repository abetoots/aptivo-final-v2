/**
 * S18-B2: requireConsent middleware (FR-HR-CM-005).
 *
 * Gates PII-access paths on the candidate having an active consent
 * record, with a self-access exemption: a candidate accessing their
 * OWN record doesn't need to grant consent to themselves.
 *
 * Today's schema has `consent_records (candidate_id, consent_type,
 * consent_date, consent_text, withdrawn_at)`. "Active consent" means a
 * row exists for `(candidateId, consentType)` AND `withdrawn_at IS NULL`.
 *
 * Self-access semantics — the platform doesn't currently link
 * `candidates.id` to a user account. The closest practical comparison
 * is email equality between the authenticated user and the candidate
 * row. This is a deliberate scope decision for S18; a candidate→user
 * mapping table can replace it with userId equality once the candidate
 * portal lands (Phase 3.5).
 *
 * Failure shape: returns RFC 7807 problem+json with
 * `type='/errors/consent-required'`. Route handlers either await the
 * `denyResponse` field and short-circuit, or use the higher-level
 * `wrapWithConsent` helper.
 */

import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface ConsentRecord {
  consentType: string;
  consentDate: Date;
  withdrawnAt: Date | null;
}

export interface ConsentCheckCandidate {
  id: string;
  email: string;
}

export interface ConsentCheckUser {
  userId: string;
  email?: string;
}

export interface RequireConsentDeps {
  /**
   * Look up consent records for a candidate. Implementations should
   * filter by `withdrawn_at IS NULL` at the query layer when possible
   * for index efficiency, but the middleware tolerates withdrawn rows
   * in the result and filters them client-side.
   */
  findActiveConsent(
    candidateId: string,
    consentType: string,
  ): Promise<ConsentRecord | null>;

  /**
   * Optional self-access predicate. Default: email equality between
   * the candidate's `email` and the user's `email`. Tests can inject
   * a userId-based check once the candidate→user mapping lands.
   */
  isSelfAccess?(candidate: ConsentCheckCandidate, user: ConsentCheckUser): boolean;
}

export type ConsentCheckResult =
  | { readonly ok: true; readonly reason: 'self-access' | 'consent-active' }
  | { readonly ok: false; readonly reason: 'consent-required' | 'consent-withdrawn' };

// ---------------------------------------------------------------------------
// default self-access predicate
// ---------------------------------------------------------------------------

function defaultIsSelfAccess(
  candidate: ConsentCheckCandidate,
  user: ConsentCheckUser,
): boolean {
  if (!user.email) return false;
  return candidate.email.toLowerCase() === user.email.toLowerCase();
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export interface RequireConsent {
  /**
   * Decide whether the user can access PII for this candidate. Pure
   * Result-shape; consumers that want an HTTP response can call
   * `denyResponse()` below.
   */
  check(
    candidate: ConsentCheckCandidate,
    user: ConsentCheckUser,
    consentType: string,
  ): Promise<ConsentCheckResult>;

  /**
   * RFC 7807 problem+json response builder for the deny path.
   */
  denyResponse(reason: 'consent-required' | 'consent-withdrawn'): Response;
}

export function createRequireConsent(deps: RequireConsentDeps): RequireConsent {
  const isSelfAccess = deps.isSelfAccess ?? defaultIsSelfAccess;

  return {
    async check(candidate, user, consentType) {
      // self-access exemption checked first — cheap, no DB hit
      if (isSelfAccess(candidate, user)) {
        return { ok: true, reason: 'self-access' };
      }

      const record = await deps.findActiveConsent(candidate.id, consentType);

      if (record === null) {
        return { ok: false, reason: 'consent-required' };
      }
      if (record.withdrawnAt !== null) {
        return { ok: false, reason: 'consent-withdrawn' };
      }
      return { ok: true, reason: 'consent-active' };
    },

    denyResponse(reason) {
      const title =
        reason === 'consent-required'
          ? 'Candidate has not granted consent for this data processing'
          : 'Candidate has withdrawn consent for this data processing';
      return NextResponse.json(
        {
          type: '/errors/consent-required',
          title,
          status: 403,
          detail: reason,
        },
        {
          status: 403,
          headers: { 'content-type': 'application/problem+json' },
        },
      );
    },
  };
}
