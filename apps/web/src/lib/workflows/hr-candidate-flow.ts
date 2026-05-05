/**
 * S6-HR-01: candidate application workflow
 * @task S6-HR-01
 * @frd docs/02-requirements/hr-domain-frd.md §3.1, §4.1
 *
 * pipeline: application received → LLM resume parse → duplicate check →
 *           record creation → consent check → recruiter notification → audit trail
 */

import { inngest } from '../inngest.js';
import {
  getLlmGateway,
  getAuditService,
  getNotificationService,
  getCandidateStore,
  getApplicationStore,
} from '../services.js';
import type { AuditEventInput } from '@aptivo/audit';
// S18-A1: workflow LLM callsites stamp actor through the wrapper. Note:
// `hr/application.received` is an external trigger (resume submission
// webhook, recruiter portal) — no acting user, so the resume-parse step
// honestly passes `actor: undefined`.
import { completeWorkflowRequest } from '../llm/complete-workflow-request.js';

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export type CandidateFlowResult =
  | { status: 'created'; candidateId: string; applicationId: string; isNew: boolean }
  | { status: 'error'; step: string; error: string };

// ---------------------------------------------------------------------------
// helper: emit audit event (fire-and-forget, never blocks)
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

export const candidateFlowFn = inngest.createFunction(
  { id: 'hr-candidate-application', retries: 0 },
  { event: 'hr/application.received' },
  async ({ event, step }): Promise<CandidateFlowResult> => {
    const { resumeText, source, positionId, candidateEmail } = event.data;

    // step 1: parse-resume — LLM extracts candidate info from resume text
    const parseResult = await step.run('parse-resume', async () => {
      try {
        const gateway = getLlmGateway();
        // S18-A1: external trigger; no initiating user. `actor.type='system'`
        // on the audit emit side is honest. Until S18-B2 lands the HR
        // onboarding workflow + employee-portal endpoints (which will
        // carry `requestedBy`), this step has no user to attribute to.
        const result = await completeWorkflowRequest({
          gateway,
          request: {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'Extract candidate information from the resume. Return JSON with fields: name, email, phone (optional), skills (array of strings). Only return valid JSON.',
              },
              {
                role: 'user',
                content: resumeText,
              },
            ],
            domain: 'hr',
          },
          actor: undefined,
          options: { userId: 'system' },
        });

        if (!result.ok) {
          return { success: false as const, error: result.error._tag };
        }

        // parse the LLM output as JSON
        try {
          const parsed = JSON.parse(result.value.completion.content);
          return {
            success: true as const,
            name: (parsed.name as string) ?? 'Unknown',
            email: ((parsed.email as string) ?? candidateEmail ?? '').toLowerCase(),
            phone: parsed.phone as string | undefined,
            skills: (parsed.skills as string[]) ?? [],
          };
        } catch {
          // if LLM output isn't valid JSON, use fallback
          return {
            success: true as const,
            name: 'Unknown',
            email: candidateEmail?.toLowerCase() ?? '',
            phone: undefined,
            skills: [],
          };
        }
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!parseResult.success) {
      return { status: 'error', step: 'parse-resume', error: parseResult.error };
    }

    // step 2: check-duplicate — look for existing candidate by email
    const duplicateCheck = await step.run('check-duplicate', async () => {
      try {
        if (!parseResult.email) {
          return { isDuplicate: false as const, existingId: undefined };
        }
        const candidateStore = getCandidateStore();
        const existing = await candidateStore.findByEmail(parseResult.email);
        if (existing) {
          return { isDuplicate: true as const, existingId: existing.id };
        }
        return { isDuplicate: false as const, existingId: undefined };
      } catch {
        // treat lookup failure as non-duplicate
        return { isDuplicate: false as const, existingId: undefined };
      }
    });

    // step 3: create-candidate — create or reuse candidate, then create application
    const recordResult = await step.run('create-candidate', async () => {
      try {
        const candidateStore = getCandidateStore();
        const applicationStore = getApplicationStore();

        let candidateId: string;
        let isNew: boolean;

        if (duplicateCheck.isDuplicate && duplicateCheck.existingId) {
          // reuse existing candidate
          candidateId = duplicateCheck.existingId;
          isNew = false;
        } else {
          // create new candidate
          const { id } = await candidateStore.create({
            name: parseResult.name,
            email: parseResult.email,
            phone: parseResult.phone,
            skills: parseResult.skills,
            consentStatus: 'pending',
          });
          candidateId = id;
          isNew = true;
        }

        // create application linked to candidate
        const { id: applicationId } = await applicationStore.create({
          candidateId,
          positionId: positionId ?? undefined,
          source,
          currentStage: 'received',
        });

        return { success: true as const, candidateId, applicationId, isNew };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!recordResult.success) {
      return { status: 'error', step: 'create-candidate', error: recordResult.error };
    }

    // step 4: consent-check — if new candidate, check/request consent
    await step.run('consent-check', async () => {
      if (!recordResult.isNew) return { skipped: true };

      try {
        const candidateStore = getCandidateStore();
        const candidate = await candidateStore.findById(recordResult.candidateId);
        if (!candidate || candidate.consentStatus === 'granted') {
          return { consentOk: true };
        }

        // send consent request notification
        const notifService = getNotificationService();
        await notifService.send({
          recipientId: recordResult.candidateId,
          channel: 'email',
          templateSlug: 'hr-consent-request',
          variables: {
            candidateName: parseResult.name,
          },
        });

        return { consentRequested: true };
      } catch {
        return { consentError: true };
      }
    });

    // step 5: notify-recruiter — send notification about new application
    await step.run('notify-recruiter', async () => {
      try {
        const notifService = getNotificationService();
        await notifService.send({
          recipientId: 'recruiter-pool',
          channel: 'email',
          templateSlug: 'hr-new-application',
          variables: {
            candidateName: parseResult.name,
            source,
            position: positionId ?? 'unspecified',
          },
        });
        return { notified: true };
      } catch {
        // notification failure is non-blocking
        return { notified: false };
      }
    });

    // step 6: audit-trail — record application intake
    await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: 'system', type: 'workflow' },
        action: 'hr.application.received',
        resource: { type: 'application', id: recordResult.applicationId },
        domain: 'hr',
        metadata: {
          candidateId: recordResult.candidateId,
          isNewCandidate: recordResult.isNew,
          source,
          positionId,
        },
      }),
    );

    return {
      status: 'created',
      candidateId: recordResult.candidateId,
      applicationId: recordResult.applicationId,
      isNew: recordResult.isNew,
    };
  },
);
