/**
 * S18-B2: GET /api/hr/onboarding/[id]
 *
 * Reads onboarding state + task checklist for a specific onboarding
 * row. Gated by:
 *   1. RBAC: `hr/onboarding.view` permission
 *   2. Consent enforcement (FR-HR-CM-005) via `requireConsent` —
 *      candidate must have an active `data_processing` consent record,
 *      with self-access exemption (candidate viewing their own
 *      onboarding bypasses the consent check)
 *
 * Why consent-gated even though the response doesn't carry raw PII:
 * onboarding state IS data processing in the GDPR sense (the
 * candidate's data is being processed through manager assignment,
 * approval, and document submission). Per FR-HR-CM-005, processing
 * activities require active consent; the data-vs-metadata
 * distinction is the platform's, not the regulator's.
 */

import { NextResponse } from 'next/server';
import { checkPermissionWithBlacklist } from '../../../../../lib/security/rbac-middleware';
import { extractUser } from '../../../../../lib/security/rbac-resolver';
import {
  getHrOnboardingStore,
  getCandidateStore,
  getRequireConsent,
} from '../../../../../lib/services';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const forbidden = await checkPermissionWithBlacklist('hr/onboarding.view')(request);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const store = getHrOnboardingStore();
  const onboarding = await store.findById(id);
  if (!onboarding) {
    return NextResponse.json(
      {
        type: '/errors/not-found',
        title: 'Onboarding not found',
        status: 404,
      },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // Look up the candidate to drive the consent check (need email for
  // self-access exemption + the candidate's id for the consent record
  // lookup).
  const candidateStore = getCandidateStore();
  const candidate = await candidateStore.findById(onboarding.candidateId);
  if (!candidate) {
    // Should not happen for a valid onboarding row (FK), but
    // defensive — surface as 404 since the candidate record is
    // required for consent enforcement.
    return NextResponse.json(
      {
        type: '/errors/not-found',
        title: 'Candidate not found for onboarding',
        status: 404,
      },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const user = await extractUser(request);
  if (!user) {
    // RBAC gate already passed in production mode; in dev mode the
    // permission gate uses x-user-role header and extractUser may
    // return null. Fail closed for consent-gated endpoints.
    return NextResponse.json(
      {
        type: '/errors/auth-required',
        title: 'Authenticated user required for consent enforcement',
        status: 401,
      },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const requireConsent = getRequireConsent();
  const consentResult = await requireConsent.check(
    { id: candidate.id, email: candidate.email },
    { userId: user.userId, email: user.email },
    'data_processing',
  );

  if (!consentResult.ok) {
    return requireConsent.denyResponse(consentResult.reason);
  }

  // Consent satisfied — return the onboarding state + tasks.
  const tasks = await store.findTasksByOnboarding(onboarding.id);

  return NextResponse.json({
    onboarding: {
      id: onboarding.id,
      candidateId: onboarding.candidateId,
      contractId: onboarding.contractId,
      state: onboarding.state,
      managerId: onboarding.managerId,
      hitlRequestId: onboarding.hitlRequestId,
      approvedBy: onboarding.approvedBy,
      lastStepFailedAt: onboarding.lastStepFailedAt,
      lastStepFailureReason: onboarding.lastStepFailureReason,
      createdAt: onboarding.createdAt,
      updatedAt: onboarding.updatedAt,
      onboardedAt: onboarding.onboardedAt,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      status: t.status,
      fileId: t.fileId,
    })),
    accessReason: consentResult.reason,
  });
}
