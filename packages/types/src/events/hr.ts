/**
 * S18-B2: HR Inngest event schemas (Epic 5 HR onboarding).
 *
 * Three events ship now:
 *   - `hr/contract.signed` — emitted by `hr-contract-approval` workflow
 *     at terminal `signed` state. Triggers the onboarding workflow.
 *   - `hr/onboarding.started` — emitted by the onboarding workflow's
 *     trigger step after the `pending` row exists.
 *   - `hr/onboarding.completed` — emitted at the `onboarded` terminal
 *     so downstream listeners (admin dashboards, reporting) can react.
 *
 * `candidate.hired` is intentionally NOT defined here. The plan's
 * S18-B2 task referenced it as a possible trigger, but no upstream
 * workflow currently flips a candidate to `hired` status. Defining a
 * type for an unproduced event would be wishful — added when a
 * hire-decision workflow surfaces in a future HR sprint.
 *
 * Shapes use `zod/v3` for the same reason as `events/ticket.ts`:
 * Inngest's EventSchemas type bridge requires v3 even though the rest
 * of the repo uses v4 for application-layer Zod. apps/web's inngest.ts
 * registers these via `EventSchemas.fromRecord<...>()`.
 */

import { z } from 'zod/v3';

// ---------------------------------------------------------------------------
// hr/contract.signed — terminal emit from hr-contract-approval
// ---------------------------------------------------------------------------

export const HrContractSignedDataSchema = z.object({
  contractId: z.string().uuid(),
  candidateId: z.string().uuid(),
  /** approver who signed off on the contract; carries S18-A1 audit
   *  attribution forward into the onboarding flow */
  approverId: z.string().uuid(),
  /** ISO timestamp of the signed terminal */
  signedAt: z.string().datetime({ offset: true }),
});

export type HrContractSignedData = z.infer<typeof HrContractSignedDataSchema>;

// ---------------------------------------------------------------------------
// hr/onboarding.started — emitted at onboarding workflow's trigger step
// ---------------------------------------------------------------------------

export const HrOnboardingStartedDataSchema = z.object({
  onboardingId: z.string().uuid(),
  candidateId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  /** the user who initiated the onboarding flow (the contract approver
   *  on the `hr.contract.signed` path; future: hire-decision approver) */
  initiatedBy: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
});

export type HrOnboardingStartedData = z.infer<typeof HrOnboardingStartedDataSchema>;

// ---------------------------------------------------------------------------
// hr/onboarding.completed — emitted at terminal 'onboarded' state
// ---------------------------------------------------------------------------

export const HrOnboardingCompletedDataSchema = z.object({
  onboardingId: z.string().uuid(),
  candidateId: z.string().uuid(),
  /** approver who closed out the manager-assigned → approved HITL gate */
  approvedBy: z.string().uuid(),
  completedAt: z.string().datetime({ offset: true }),
});

export type HrOnboardingCompletedData = z.infer<typeof HrOnboardingCompletedDataSchema>;

// ---------------------------------------------------------------------------
// event-name constants (use these at every emit site)
// ---------------------------------------------------------------------------

export const HR_CONTRACT_SIGNED_EVENT = 'hr/contract.signed' as const;
export const HR_ONBOARDING_STARTED_EVENT = 'hr/onboarding.started' as const;
export const HR_ONBOARDING_COMPLETED_EVENT = 'hr/onboarding.completed' as const;

// ---------------------------------------------------------------------------
// Inngest event-record shape — referenced from apps/web/src/lib/inngest.ts
// via EventSchemas.fromRecord<...>(). Adding an event here:
//   1. Define data schema above
//   2. Add to this record type
//   3. Add a const for the event name
//   4. Reference the const at every emit site
// ---------------------------------------------------------------------------

export type HrOnboardingEvents = {
  [HR_CONTRACT_SIGNED_EVENT]: { data: HrContractSignedData };
  [HR_ONBOARDING_STARTED_EVENT]: { data: HrOnboardingStartedData };
  [HR_ONBOARDING_COMPLETED_EVENT]: { data: HrOnboardingCompletedData };
};
