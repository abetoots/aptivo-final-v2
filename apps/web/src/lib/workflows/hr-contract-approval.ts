/**
 * S7-HR-02: contract approval workflow (CONTRACT-001)
 * @task S7-HR-02
 *
 * pipeline: approval requested → LLM draft contract → compliance check →
 *           HITL approval → finalize contract → audit trail
 */

import { inngest } from '../inngest.js';
import {
  getContractStore,
  getLlmGateway,
  getHitlService,
  getHitlMultiApproverService,
  getNotificationService,
  getAuditService,
} from '../services.js';
import type { AuditEventInput } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export type ContractApprovalResult =
  | { status: 'signed'; contractId: string; candidateId: string }
  | { status: 'rejected'; contractId: string; candidateId: string; reason: string }
  | { status: 'expired'; contractId: string; candidateId: string }
  | { status: 'changes-requested'; contractId: string; candidateId: string; comment: string }
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

export const contractApprovalFn = inngest.createFunction(
  { id: 'hr-contract-approval', retries: 0 },
  { event: 'hr/contract.approval.requested' },
  async ({ event, step }): Promise<ContractApprovalResult> => {
    const { candidateId, positionId, templateSlug, terms, requestedBy } = event.data;

    // step 1: draft-contract — LLM drafts contract text from template + terms
    const draftResult = await step.run('draft-contract', async () => {
      try {
        const gateway = getLlmGateway();
        const result = await gateway.complete(
          {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a contract drafting assistant. Given a template slug and terms, produce a professional employment contract. Return the full contract text.',
              },
              {
                role: 'user',
                content: `Template: ${templateSlug}\nTerms: ${JSON.stringify(terms)}`,
              },
            ],
            domain: 'hr',
          },
          { userId: requestedBy },
        );

        if (!result.ok) {
          return { success: false as const, error: result.error._tag };
        }

        const contractText = result.value.completion.content;

        // create contract record in the store
        const contractStore = getContractStore();
        const { id: contractId } = await contractStore.create({
          candidateId,
          templateSlug,
          terms,
          version: 1,
          status: 'draft',
          complianceFlags: [],
        });

        return { success: true as const, contractId, contractText };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!draftResult.success) {
      return { status: 'error', step: 'draft-contract', error: draftResult.error };
    }

    // step 2: compliance-check — LLM reviews contract for compliance issues
    const complianceResult = await step.run('compliance-check', async () => {
      try {
        const gateway = getLlmGateway();
        const result = await gateway.complete(
          {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a compliance reviewer. Check the contract for legal compliance issues such as minimum wage, notice periods, and non-compete limits. Return a JSON object with a "flags" array of string descriptions for any issues found. If no issues, return {"flags":[]}.',
              },
              {
                role: 'user',
                content: draftResult.contractText,
              },
            ],
            domain: 'hr',
          },
          { userId: 'system' },
        );

        if (!result.ok) {
          return { success: false as const, error: result.error._tag };
        }

        // parse compliance flags from LLM output
        let complianceFlags: string[] = [];
        try {
          const parsed = JSON.parse(result.value.completion.content);
          complianceFlags = (parsed.flags as string[]) ?? [];
        } catch {
          // if LLM output isn't valid JSON, treat as no flags
          complianceFlags = [];
        }

        // update contract status to pending_review
        const contractStore = getContractStore();
        await contractStore.updateStatus(draftResult.contractId, 'pending_review');

        return { success: true as const, complianceFlags };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!complianceResult.success) {
      return { status: 'error', step: 'compliance-check', error: complianceResult.error };
    }

    // step 3: hitl-approval — try multi-approver, fall back to single-approver
    const hitlResult = await step.run('hitl-approval', async () => {
      try {
        const multiService = getHitlMultiApproverService();

        // attempt multi-approver sequential policy (HITL2-07)
        // wrapped in try/catch so policy creation throws fall back to single-approver
        if (multiService) {
          try {
            // create sequential policy: hr_reviewer then legal_reviewer
            const policy = await multiService.policyStore.create({
              name: `hr-contract-${draftResult.contractId}`,
              type: 'sequential',
              threshold: null,
              approverRoles: ['hr_reviewer', 'legal_reviewer'],
              maxRetries: 3,
              timeoutSeconds: 86400,
              escalationPolicy: null,
            });

            const approverIds = [crypto.randomUUID(), crypto.randomUUID()];

            const result = await multiService.createMultiApproverRequest({
              workflowId: crypto.randomUUID(),
              domain: 'hr',
              actionType: 'hr.contract.approval',
              summary: `Contract approval needed for ${candidateId}`,
              details: {
                contractId: draftResult.contractId,
                candidateId,
                positionId,
                complianceFlags: complianceResult.complianceFlags,
                contractText: draftResult.contractText,
              },
              approverIds,
              policyId: policy.id,
              ttlSeconds: 3600,
            });

            if (result.ok) {
              return {
                success: true as const,
                requestId: result.value.requestId,
                isMultiApprover: true as const,
                policyId: policy.id,
                approverIds,
              };
            }
            // multi-approver failed — fall through to single-approver
          } catch {
            // policy creation or multi-request threw — fall back to single-approver
          }
        }

        // fallback: single-approver hitl
        const hitlService = getHitlService();
        const result = await hitlService.createRequest({
          workflowId: crypto.randomUUID(),
          domain: 'hr',
          actionType: 'hr.contract.approval',
          summary: `Contract approval needed for ${candidateId}`,
          details: {
            contractId: draftResult.contractId,
            candidateId,
            positionId,
            complianceFlags: complianceResult.complianceFlags,
            contractText: draftResult.contractText,
          },
          approverId: crypto.randomUUID(),
          expiresInMs: 72 * 60 * 60 * 1000,
        });

        if (!result.ok) {
          return { success: false as const, error: `${result.error._tag}: ${result.error.message}` };
        }
        return { success: true as const, requestId: result.value.requestId, isMultiApprover: false as const };
      } catch (err: unknown) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!hitlResult.success) {
      return { status: 'error', step: 'hitl-approval', error: hitlResult.error };
    }

    // step 3b: emit multi-approver event if applicable
    if (hitlResult.isMultiApprover) {
      await step.run('emit-multi-approval-requested', async () => {
        await inngest.send({
          name: 'hitl/multi.approval.requested',
          data: {
            requestId: hitlResult.requestId,
            policyId: hitlResult.policyId!,
            approverIds: hitlResult.approverIds!,
            domain: 'hr',
          },
        });
      });
    }

    // step 4: wait for decision (72h timeout)
    const decision = await step.waitForEvent('wait-for-contract-decision', {
      event: 'hr/contract.decision.submitted',
      timeout: '72h',
      if: `async.data.requestId == '${hitlResult.requestId}'`,
    });

    if (decision === null) {
      // timeout — mark contract as expired
      await step.run('expire-contract', async () => {
        const contractStore = getContractStore();
        await contractStore.updateStatus(draftResult.contractId, 'expired');
      });
      return { status: 'expired', contractId: draftResult.contractId, candidateId };
    }

    const decisionData = decision.data as {
      requestId: string;
      decision: 'approved' | 'rejected' | 'request_changes';
      reviewerNotes?: string;
    };

    // handle request_changes — re-submission loop (HITL2-07)
    if (decisionData.decision === 'request_changes') {
      await step.run('emit-changes-requested', async () => {
        await inngest.send({
          name: 'hitl/changes.requested',
          data: {
            requestId: hitlResult.requestId,
            approverId: 'reviewer',
            comment: decisionData.reviewerNotes ?? 'changes requested',
            retryCount: 1,
          },
        });
      });
      return {
        status: 'changes-requested',
        contractId: draftResult.contractId,
        candidateId,
        comment: decisionData.reviewerNotes ?? 'changes requested',
      };
    }

    // step 5: finalize-contract — update status and notify candidate
    const finalStatus = decisionData.decision === 'approved' ? 'signed' : 'rejected';

    await step.run('finalize-contract', async () => {
      // db update must succeed — propagate errors
      const contractStore = getContractStore();
      await contractStore.updateStatus(draftResult.contractId, finalStatus);

      // notification is fire-and-forget — swallow errors
      try {
        const notificationService = getNotificationService();
        await notificationService.send({
          recipientId: candidateId,
          channel: 'email',
          templateSlug: finalStatus === 'signed' ? 'hr-contract-approved' : 'hr-contract-rejected',
          variables: {
            candidateId,
            contractId: draftResult.contractId,
            status: finalStatus,
          },
        });
      } catch {
        // notification failure is non-blocking
      }
    });

    // step 6: audit-trail — record contract finalization
    await step.run('audit-trail', () =>
      emitAudit({
        actor: { id: 'system', type: 'workflow' },
        action: 'hr.contract.finalized',
        resource: { type: 'contract', id: draftResult.contractId },
        domain: 'hr',
        metadata: {
          candidateId,
          positionId,
          status: finalStatus,
        },
      }),
    );

    if (finalStatus === 'rejected') {
      return {
        status: 'rejected',
        contractId: draftResult.contractId,
        candidateId,
        reason: decisionData.reviewerNotes ?? 'rejected by reviewer',
      };
    }

    // emit domain event for downstream consumers
    await step.run('emit-contract-approved', async () => {
      await inngest.send({
        name: 'hr/contract.approved',
        data: {
          contractId: draftResult.contractId,
          candidateId,
          positionId,
          domain: 'hr',
        },
      });
    });

    return {
      status: 'signed',
      contractId: draftResult.contractId,
      candidateId,
    };
  },
);
