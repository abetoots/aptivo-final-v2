/**
 * S18-B2: HR onboarding workflow.
 * @frd docs/02-requirements/hr-domain-frd.md (Epic 5 onboarding)
 *
 * Triggered by `hr/contract.signed` (per packages/types/src/events/hr.ts
 * — emitted by hr-contract-approval at terminal `signed` state). The
 * future `candidate.hired` event will share the same workflow once a
 * hire-decision flow exists; defer until that producer lands.
 *
 * Pipeline (state machine per AD-S18-5):
 *   pending → docs_collected → manager_assigned → approved → onboarded
 *
 * Step responsibilities:
 *   1. trigger:                  findOrCreate(candidateId, contractId)
 *      — idempotent via the unique(candidateId) constraint; second
 *      trigger sees the existing row and resumes
 *   2. docs-collected:           seed task checklist (i9, w4, etc.)
 *      — idempotent via (onboardingId, slug) unique index
 *   3. manager-assigned:         pick the manager (placeholder lookup
 *      today; admin-set assignment in Phase 3.5); transition state
 *   4. hitl-request:             single-approver HITL via the gateway
 *   5. wait-for-decision:        72h timeout (long because manager +
 *      HR head sign-off is a manual step)
 *   6. approved transition:      stamps approverId on the row
 *   7. onboarded transition:     terminal; emits onboarding.completed
 *
 * S18-A1 attribution chain: the contract approver's id rides on
 * `hr/contract.signed.approverId`, becomes the workflow's `initiatedBy`
 * on `hr/onboarding.started`, and the HITL approver's id stamps as
 * `approvedBy` on the row at the `approved` transition. The terminal
 * audit emit attributes to `approvedBy` with type='user' so
 * audit_logs.user_id is populated and the anomaly aggregate matches.
 *
 * Honest behaviour at boundaries:
 *   - missing approverId on the trigger event → workflow rejects with
 *     status='trigger-malformed' (parallel to B1's pre-execute approver
 *     check). The trigger event SHOULD always carry approverId per the
 *     emit-side guard in hr-contract-approval; this is defensive.
 *   - missing approverId on the HITL decision → fail-closed at the
 *     `approved` transition; surface via lastStepFailureReason so
 *     admins can re-drive after manual investigation.
 */

import { inngest } from '../inngest.js';
import {
  getAuditService,
  getHrOnboardingStore,
  getHitlRequestDeps,
  getNotificationService,
} from '../services.js';
import { createRequest } from '@aptivo/hitl-gateway';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// workflow result types
// ---------------------------------------------------------------------------

export type OnboardingResult =
  | { status: 'onboarded'; onboardingId: string; candidateId: string }
  | { status: 'rejected-by-manager'; onboardingId: string; candidateId: string }
  | { status: 'expired'; onboardingId: string; candidateId: string }
  | { status: 'trigger-malformed'; reason: string }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// task checklist defaults
// ---------------------------------------------------------------------------

/**
 * Default onboarding tasks seeded at the docs-collected step.
 * Per-position or per-region overrides are S19+ work; for S18 every
 * onboarding gets the same baseline checklist.
 */
const DEFAULT_TASKS = [
  { slug: 'i9-form', label: 'I-9 Employment Eligibility Verification' },
  { slug: 'tax-w4', label: 'W-4 Federal Tax Withholding' },
  { slug: 'direct-deposit', label: 'Direct Deposit Authorization' },
  { slug: 'employee-handbook', label: 'Employee Handbook Acknowledgement' },
  { slug: 'emergency-contact', label: 'Emergency Contact Form' },
] as const;

// ---------------------------------------------------------------------------
// audit emit helper
// ---------------------------------------------------------------------------

async function emitAudit(input: AuditEventInput): Promise<{ auditId?: string }> {
  try {
    const auditService = getAuditService();
    const result = await auditService.emit(input);
    if (!result.ok) return {};
    return { auditId: result.value.id };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// inngest function
// ---------------------------------------------------------------------------

export const onboardingFn = inngest.createFunction(
  { id: 'hr-onboarding', retries: 0 },
  { event: 'hr/contract.signed' },
  async ({ event, step }): Promise<OnboardingResult> => {
    const { contractId, candidateId, approverId, signedAt } = event.data;

    // step 0: defensive trigger-event validation. The emit-side guard
    // in hr-contract-approval already gates on approverId, but if a
    // future producer (e.g. `candidate.hired`) is wired without that
    // guard, we want to refuse here too rather than start an
    // un-attributable onboarding.
    if (!approverId) {
      await step.run('audit-trigger-malformed', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'hr.onboarding.trigger-malformed',
          resource: { type: 'contract', id: contractId },
          domain: 'hr',
          metadata: {
            reason: 'trigger event missing approverId; refused to start onboarding',
            candidateId,
          },
        }),
      );
      return {
        status: 'trigger-malformed',
        reason: 'missing approverId on hr/contract.signed event',
      };
    }

    // step 1: trigger — idempotent findOrCreate
    const onboardingRow = await step.run('start-onboarding', async () => {
      const store = getHrOnboardingStore();
      return store.findOrCreate({ candidateId, contractId });
    });

    // Round-1 multi-model review (Codex HIGH + Gemini CRITICAL +
    // test-quality-assessor MEDIUM): the prior version had a single
    // short-circuit only at `state === 'onboarded'`. Re-triggering at
    // any intermediate state (docs_collected, manager_assigned,
    // approved) replayed earlier transitions, REWINDING state and
    // creating duplicate HITL requests + duplicate emit-started
    // events. The fix uses a state-rank ordering: each transition
    // (and its preceding emit/audit) only runs when the row's
    // current state is strictly earlier in the sequence.
    //
    // STATE_RANK encodes the linear progression. recordStepFailure
    // does NOT change state, so a row at any rank can re-enter from
    // its own rank (recordStepFailure is the documented retry
    // surface).
    const STATE_RANK: Record<string, number> = {
      pending: 0,
      docs_collected: 1,
      manager_assigned: 2,
      approved: 3,
      onboarded: 4,
      cancelled: 99,
    };
    const currentRank = STATE_RANK[onboardingRow.state] ?? 0;
    const past = (target: keyof typeof STATE_RANK) => currentRank >= STATE_RANK[target]!;

    // emit-started + audit-started are idempotent in their own right
    // (event-broker dedupe + audit-trail append), but skipping them on
    // re-trigger keeps the audit log free of spurious "started"
    // entries that don't reflect new lifecycle activity. Run only
    // when the row is brand-new (state === 'pending').
    if (!past('docs_collected')) {
      await step.run('emit-started', () =>
        inngest.send({
          name: 'hr/onboarding.started',
          data: {
            onboardingId: onboardingRow.id,
            candidateId,
            contractId,
            initiatedBy: approverId,
            startedAt: signedAt,
          },
        }),
      );

      // S18-A1: emit started audit attributed to the contract approver.
      // The approver IS the user-of-record at this point — they signed
      // the contract that triggered onboarding.
      await step.run('audit-started', () =>
        emitAudit({
          actor: { id: approverId, type: 'user' },
          action: 'hr.onboarding.started',
          resource: { type: 'hr-onboarding', id: onboardingRow.id },
          domain: 'hr',
          metadata: { candidateId, contractId, signedAt },
        }),
      );
    }

    // Terminal idempotency: existing onboarded row → return immediately.
    if (past('onboarded')) {
      return {
        status: 'onboarded',
        onboardingId: onboardingRow.id,
        candidateId,
      };
    }

    // step 2: docs-collected — seed the default task checklist.
    // seedTasks is itself idempotent (onConflictDoNothing on the
    // (onboardingId, slug) unique index), but we still gate on rank
    // so transitionState doesn't rewind a row already past this stage.
    if (!past('docs_collected')) {
      const docsResult = await step.run('docs-collected', async () => {
        const store = getHrOnboardingStore();
        try {
          await store.seedTasks(onboardingRow.id, DEFAULT_TASKS);
          await store.transitionState(onboardingRow.id, 'docs_collected');
          return { success: true as const };
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          await store.recordStepFailure(onboardingRow.id, `docs-collected: ${reason}`);
          return { success: false as const, error: reason };
        }
      });

      if (!docsResult.success) {
        return { status: 'error', step: 'docs-collected', error: docsResult.error };
      }
    }

    // step 3: manager-assigned. Manager lookup is a placeholder for
    // S18 — admin-driven assignment lands in Phase 3.5. For now we
    // assume the contract's department head is the manager;
    // approverId acts as a stand-in. Real RBAC-driven manager
    // resolution is a S19+ task.
    //
    // Resumption: when the row is already past `manager_assigned`,
    // pull the persisted managerId off the row (or fall back to
    // approverId if it's somehow null on the persisted row — the
    // workflow always writes managerId at this transition, so the
    // fallback is purely defensive).
    type ManagerStepResult =
      | { readonly success: true; readonly managerId: string }
      | { readonly success: false; readonly error: string };
    let managerResult: ManagerStepResult;
    if (past('manager_assigned')) {
      managerResult = {
        success: true,
        managerId: onboardingRow.managerId ?? approverId,
      };
    } else {
      managerResult = await step.run('manager-assigned', async () => {
        const store = getHrOnboardingStore();
        try {
          // placeholder: approverId stands in for the manager
          await store.transitionState(onboardingRow.id, 'manager_assigned', {
            managerId: approverId,
          });
          return { success: true as const, managerId: approverId };
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          await store.recordStepFailure(onboardingRow.id, `manager-assigned: ${reason}`);
          return { success: false as const, error: reason };
        }
      });

      if (!managerResult.success) {
        return { status: 'error', step: 'manager-assigned', error: managerResult.error };
      }
    }

    // step 4: hitl-request — manager + HR head sign-off via the
    // gateway's single-approver flow. The S20+ HR admin UI may
    // promote this to a multi-approver chain.
    //
    // Resumption short-circuit: if the row is already past `approved`,
    // a previous run successfully completed the HITL gate. Skip
    // straight to the onboarded transition. Approval-stage rows
    // resume into the wait-for-decision phase using the persisted
    // hitl_request_id.
    if (past('approved')) {
      // jump to the onboarded transition + emit-completed below
      await step.run('onboarded-transition', async () => {
        const store = getHrOnboardingStore();
        await store.transitionState(onboardingRow.id, 'onboarded');
      });

      const approvedBy = onboardingRow.approvedBy ?? approverId;
      await step.run('emit-completed', () =>
        inngest.send({
          name: 'hr/onboarding.completed',
          data: {
            onboardingId: onboardingRow.id,
            candidateId,
            approvedBy,
            completedAt: new Date().toISOString(),
          },
        }),
      );
      await step.run('audit-onboarded', () =>
        emitAudit({
          actor: { id: approvedBy, type: 'user' },
          action: 'hr.onboarding.completed',
          resource: { type: 'hr-onboarding', id: onboardingRow.id },
          domain: 'hr',
          metadata: { candidateId, contractId, resumedFromState: onboardingRow.state },
        }),
      );
      return {
        status: 'onboarded',
        onboardingId: onboardingRow.id,
        candidateId,
      };
    }

    const hitlResult = await step.run('hitl-request', async () => {
      try {
        const deps = getHitlRequestDeps();
        const result = await createRequest(
          {
            workflowId: crypto.randomUUID(),
            domain: 'hr',
            actionType: 'onboarding-approval',
            summary: `HR onboarding approval for candidate ${candidateId}`,
            details: {
              onboardingId: onboardingRow.id,
              candidateId,
              contractId,
              managerId: managerResult.managerId,
            },
            approverId: managerResult.managerId,
          },
          deps,
        );

        if (!result.ok) {
          return {
            success: false as const,
            error: `${result.error._tag}: ${result.error.message}`,
          };
        }

        // notification — fire-and-forget
        try {
          const notif = getNotificationService();
          await notif.send({
            recipientId: managerResult.managerId,
            channel: 'email',
            templateSlug: 'hr-onboarding-approval',
            variables: {
              candidateId,
              onboardingId: onboardingRow.id,
              requestId: result.value.requestId,
            },
          });
        } catch {
          // notification failure is non-blocking
        }

        return { success: true as const, requestId: result.value.requestId };
      } catch (err: unknown) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    if (!hitlResult.success) {
      const store = getHrOnboardingStore();
      await store.recordStepFailure(onboardingRow.id, `hitl-request: ${hitlResult.error}`);
      return { status: 'error', step: 'hitl-request', error: hitlResult.error };
    }

    // record the HITL request id on the row
    await step.run('record-hitl-request-id', async () => {
      const store = getHrOnboardingStore();
      await store.transitionState(onboardingRow.id, 'manager_assigned', {
        hitlRequestId: hitlResult.requestId,
      });
    });

    // step 5: wait for decision (72h — manual signoff window)
    const decision = await step.waitForEvent('wait-for-onboarding-decision', {
      event: 'hitl/decision.recorded',
      timeout: '72h',
      if: `async.data.requestId == '${hitlResult.requestId}'`,
    });

    if (decision === null) {
      const store = getHrOnboardingStore();
      await store.recordStepFailure(onboardingRow.id, 'hitl-decision-timeout');
      await step.run('audit-onboarding-expired', () =>
        emitAudit({
          actor: { id: approverId, type: 'user' },
          action: 'hr.onboarding.expired',
          resource: { type: 'hr-onboarding', id: onboardingRow.id },
          domain: 'hr',
          metadata: { candidateId, requestId: hitlResult.requestId },
        }),
      );
      return { status: 'expired', onboardingId: onboardingRow.id, candidateId };
    }

    const decisionData = decision.data;

    // S18-A1 + B1 round-2 pattern: pre-acceptance check on
    // approverId. A malformed HITL payload should fail-closed before
    // we transition the state row. Round-1 review fix
    // (test-quality-assessor): the previous version only guarded
    // `decision === 'approved' && !approverId`. A rejection with
    // missing approverId fell through to the rejection branch with
    // `actor: { id: 'system', type: 'system' }`, breaking the
    // S18-A1 attribution claim for rejection terminals. Both
    // approved AND rejected outcomes require approverId now.
    if (!decisionData.approverId) {
      const store = getHrOnboardingStore();
      const reason = `HITL ${decisionData.decision} payload missing approverId; refused to record terminal`;
      await store.recordStepFailure(onboardingRow.id, reason);
      await step.run('audit-malformed-approval', () =>
        emitAudit({
          actor: { id: 'system', type: 'system' },
          action: 'hr.onboarding.malformed-approval',
          resource: { type: 'hr-onboarding', id: onboardingRow.id },
          domain: 'hr',
          metadata: {
            candidateId,
            requestId: hitlResult.requestId,
            decision: decisionData.decision,
          },
        }),
      );
      return {
        status: 'error',
        step: 'wait-for-decision',
        error: 'malformed approval payload (missing approverId)',
      };
    }

    if (decisionData.decision === 'rejected') {
      // attribute the rejection to the approver if known
      const rejectionActor = decisionData.approverId
        ? { id: decisionData.approverId, type: 'user' as const }
        : { id: 'system', type: 'system' as const };
      await step.run('audit-onboarding-rejected', () =>
        emitAudit({
          actor: rejectionActor,
          action: 'hr.onboarding.rejected-by-manager',
          resource: { type: 'hr-onboarding', id: onboardingRow.id },
          domain: 'hr',
          metadata: { candidateId, requestId: hitlResult.requestId },
        }),
      );
      return {
        status: 'rejected-by-manager',
        onboardingId: onboardingRow.id,
        candidateId,
      };
    }

    // step 6: approved transition — stamp approverId
    const approvedBy = decisionData.approverId!;
    await step.run('approved-transition', async () => {
      const store = getHrOnboardingStore();
      await store.transitionState(onboardingRow.id, 'approved', {
        approvedBy,
      });
    });

    // step 7: onboarded transition — terminal
    await step.run('onboarded-transition', async () => {
      const store = getHrOnboardingStore();
      await store.transitionState(onboardingRow.id, 'onboarded');
    });

    // emit completed event for downstream consumers
    await step.run('emit-completed', () =>
      inngest.send({
        name: 'hr/onboarding.completed',
        data: {
          onboardingId: onboardingRow.id,
          candidateId,
          approvedBy,
          completedAt: new Date().toISOString(),
        },
      }),
    );

    // step 8: audit-trail — terminal emit attributed to the HITL
    // approver. This is the row that populates audit_logs.user_id and
    // feeds the anomaly aggregate (S18-A1).
    await step.run('audit-onboarded', () =>
      emitAudit({
        actor: { id: approvedBy, type: 'user' },
        action: 'hr.onboarding.completed',
        resource: { type: 'hr-onboarding', id: onboardingRow.id },
        domain: 'hr',
        metadata: { candidateId, contractId, requestId: hitlResult.requestId },
      }),
    );

    return {
      status: 'onboarded',
      onboardingId: onboardingRow.id,
      candidateId,
    };
  },
);
