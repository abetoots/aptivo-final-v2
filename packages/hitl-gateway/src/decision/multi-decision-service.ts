/**
 * HITL2-03: Multi-Approver Decision Service
 * @task HITL2-03
 *
 * records individual approver decisions and evaluates quorum status
 * against the associated approval policy. supports:
 * - per-approver token verification via request token store
 * - duplicate decision detection (idempotency)
 * - optimistic lock on request status (first-finalizer-wins)
 * - event emission only on aggregate state change
 * - legacy single-approver fallback when no policyId
 */

import { Result } from '@aptivo/types';
import type { MultiDecisionResult, MultiDecisionError } from './multi-decision-types.js';
import type { ApprovalPolicyStore } from '../policy/policy-types.js';
import type { RequestTokenStore } from '../request/multi-request-types.js';
import { RecordMultiApproverDecisionInputSchema } from './multi-decision-types.js';
import { createQuorumEngine } from '../policy/quorum-engine.js';
import type { DecisionRecord } from '../policy/quorum-engine.js';

// ---------------------------------------------------------------------------
// store interface for multi-decision persistence
// ---------------------------------------------------------------------------

export interface MultiDecisionStoreDeps {
  // fetch request record (id, status, policyId, approverId)
  getRequest(requestId: string): Promise<{ id: string; status: string; policyId: string | null; approverId: string } | null>;
  // get all decisions for a request
  getDecisionsByRequestId(requestId: string): Promise<DecisionRecord[]>;
  // get decision for specific approver (idempotency check)
  getDecisionByRequestAndApprover(requestId: string, approverId: string): Promise<{ id: string; decision: string } | null>;
  // insert decision record
  insertDecision(decision: {
    requestId: string;
    approverId: string;
    decision: string;
    comment?: string;
    channel: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ id: string }>;
  // optimistic lock: update request status only if still pending
  updateRequestStatusIfPending(requestId: string, newStatus: string): Promise<{ affected: number }>;
}

// ---------------------------------------------------------------------------
// service dependencies
// ---------------------------------------------------------------------------

export interface MultiDecisionServiceDeps {
  store: MultiDecisionStoreDeps;
  tokenStore: RequestTokenStore;
  policyStore: ApprovalPolicyStore;
  verifyToken: (token: string, expectedHash: string) => Promise<boolean>;
  emitEvent?: (event: { name: string; data: Record<string, unknown> }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// service factory
// ---------------------------------------------------------------------------

export function createMultiDecisionService(deps: MultiDecisionServiceDeps) {
  const quorumEngine = createQuorumEngine();

  return {
    async recordMultiApproverDecision(
      input: unknown,
    ): Promise<Result<MultiDecisionResult, MultiDecisionError>> {
      // 1. validate input
      const parsed = RecordMultiApproverDecisionInputSchema.safeParse(input);
      if (!parsed.success) {
        return Result.err({ _tag: 'ValidationError', message: parsed.error.message });
      }
      const data = parsed.data;

      // 2. fetch request
      const request = await deps.store.getRequest(data.requestId);
      if (!request) {
        return Result.err({ _tag: 'RequestNotFoundError', requestId: data.requestId });
      }

      // 3. check if already finalized
      if (request.status !== 'pending') {
        return Result.err({
          _tag: 'RequestAlreadyFinalizedError',
          requestId: data.requestId,
          status: request.status,
        });
      }

      // 4. verify per-approver token
      const tokenRecord = await deps.tokenStore.findByRequestAndApprover(data.requestId, data.approverId);
      if (!tokenRecord) {
        return Result.err({
          _tag: 'TokenVerificationError',
          message: `No token found for approver ${data.approverId}`,
        });
      }
      const tokenValid = await deps.verifyToken(data.token, tokenRecord.tokenHash);
      if (!tokenValid) {
        return Result.err({ _tag: 'TokenVerificationError', message: 'Invalid token' });
      }

      // 5. idempotency: check if this approver already decided
      const existing = await deps.store.getDecisionByRequestAndApprover(data.requestId, data.approverId);
      if (existing) {
        return Result.err({
          _tag: 'DuplicateDecisionError',
          approverId: data.approverId,
          requestId: data.requestId,
        });
      }

      // 6. insert individual decision
      const { id: decisionId } = await deps.store.insertDecision({
        requestId: data.requestId,
        approverId: data.approverId,
        decision: data.decision,
        comment: data.comment,
        channel: data.channel,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });

      // 7. fetch policy and evaluate quorum
      let aggregate: 'pending' | 'approved' | 'rejected' = 'pending';
      let isFinalized = false;

      if (request.policyId) {
        const policy = await deps.policyStore.findById(request.policyId);
        if (!policy) {
          return Result.err({ _tag: 'PolicyNotFoundError', policyId: request.policyId });
        }

        // get all decisions including the one we just inserted
        const allDecisions = await deps.store.getDecisionsByRequestId(data.requestId);
        const quorumResult = quorumEngine.evaluate(allDecisions, policy);

        if (quorumResult.ok && quorumResult.value.isFinalized) {
          // 8. optimistic lock: update request status
          const { affected } = await deps.store.updateRequestStatusIfPending(
            data.requestId,
            quorumResult.value.aggregate,
          );

          if (affected > 0) {
            aggregate = quorumResult.value.aggregate;
            isFinalized = true;

            // 9. emit event only on aggregate state change
            if (deps.emitEvent) {
              await deps.emitEvent({
                name: 'hitl/decision.recorded',
                data: {
                  requestId: data.requestId,
                  decision: aggregate,
                  approverId: data.approverId,
                  decidedAt: new Date().toISOString(),
                },
              }).catch(() => {}); // fire-and-forget
            }
          }
          // if affected === 0, another approver finalized first — re-read actual state
          if (affected === 0) {
            const updated = await deps.store.getRequest(data.requestId);
            if (updated && updated.status !== 'pending') {
              aggregate = updated.status as 'approved' | 'rejected';
              isFinalized = true;
            }
          }
        } else if (quorumResult.ok) {
          aggregate = quorumResult.value.aggregate;
        }
      } else {
        // no policy = single-approver legacy behavior
        // auto-finalize on first decision
        const { affected } = await deps.store.updateRequestStatusIfPending(
          data.requestId,
          data.decision,
        );
        if (affected > 0) {
          aggregate = data.decision;
          isFinalized = true;
          if (deps.emitEvent) {
            await deps.emitEvent({
              name: 'hitl/decision.recorded',
              data: {
                requestId: data.requestId,
                decision: data.decision,
                approverId: data.approverId,
                decidedAt: new Date().toISOString(),
              },
            }).catch(() => {});
          }
        }
      }

      return Result.ok({
        decisionId,
        requestId: data.requestId,
        approverId: data.approverId,
        decision: data.decision,
        aggregate,
        isFinalized,
      });
    },
  };
}
