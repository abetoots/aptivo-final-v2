/**
 * HITL2-02: Multi-Approver Request Creation Service
 * @task HITL2-02
 *
 * creates hitl approval requests with per-approver tokens.
 * validates input against the approval policy, mints one JWT per approver,
 * persists the request and per-approver token records.
 *
 * functional core — all side effects go through injected dependencies.
 */

import { Result } from '@aptivo/types';
import type {
  CreateMultiApproverRequestInput,
  MultiApproverRequestResult,
  MultiRequestError,
  ApproverTokenResult,
  RequestTokenStore,
  HitlRequestTokenRecord,
} from './multi-request-types.js';
import type { ApprovalPolicyStore } from '../policy/policy-types.js';
import { CreateMultiApproverRequestInputSchema } from './multi-request-types.js';

// ---------------------------------------------------------------------------
// service dependencies
// ---------------------------------------------------------------------------

export interface MultiRequestServiceDeps {
  requestStore: { insert(record: unknown): Promise<{ id: string }> };
  tokenStore: RequestTokenStore;
  policyStore: ApprovalPolicyStore;
  generateToken: (payload: Record<string, unknown>) => Promise<{ token: string; hash: string; expiresAt: Date }>;
  config: { baseUrl: string };
}

// ---------------------------------------------------------------------------
// service factory
// ---------------------------------------------------------------------------

export function createMultiApproverRequestService(deps: MultiRequestServiceDeps) {
  return {
    async createMultiApproverRequest(
      input: unknown,
    ): Promise<Result<MultiApproverRequestResult, MultiRequestError>> {
      // 1. validate input
      const parsed = CreateMultiApproverRequestInputSchema.safeParse(input);
      if (!parsed.success) {
        return Result.err({ _tag: 'ValidationError', message: parsed.error.message });
      }
      const data: CreateMultiApproverRequestInput = parsed.data;

      // 2. fetch and validate policy
      const policy = await deps.policyStore.findById(data.policyId);
      if (!policy) {
        return Result.err({ _tag: 'PolicyNotFoundError', policyId: data.policyId });
      }

      // validate approver count against quorum threshold
      if (policy.type === 'quorum' && policy.threshold && data.approverIds.length < policy.threshold) {
        return Result.err({
          _tag: 'PolicyValidationError',
          message: `Quorum requires at least ${policy.threshold} approvers, got ${data.approverIds.length}`,
        });
      }

      try {
        // 3. create the request record (use first approver as primary for backward compat)
        const requestId = crypto.randomUUID();

        // generate a token for the first approver to use as the request-level token hash
        const firstToken = await deps.generateToken({
          requestId,
          approverId: data.approverIds[0],
          action: 'decide',
          ttlSeconds: data.ttlSeconds,
        });

        await deps.requestStore.insert({
          id: requestId,
          workflowId: data.workflowId,
          workflowStepId: data.workflowStepId,
          domain: data.domain,
          actionType: data.actionType,
          summary: data.summary,
          details: data.details,
          approverId: data.approverIds[0], // primary approver for backward compat
          status: 'pending',
          tokenHash: firstToken.hash,
          tokenExpiresAt: firstToken.expiresAt,
          policyId: data.policyId,
          retryCount: 0,
        });

        // 4. mint per-approver tokens
        const approvers: ApproverTokenResult[] = [];
        const tokenRecords: HitlRequestTokenRecord[] = [];

        for (const approverId of data.approverIds) {
          // first approver reuses the token we already generated
          const tokenResult = approverId === data.approverIds[0]
            ? firstToken
            : await deps.generateToken({
                requestId,
                approverId,
                action: 'decide',
                ttlSeconds: data.ttlSeconds,
              });

          approvers.push({
            approverId,
            token: tokenResult.token,
            tokenHash: tokenResult.hash,
            tokenExpiresAt: tokenResult.expiresAt,
            approveUrl: `${deps.config.baseUrl}/hitl/${requestId}/approve?token=${tokenResult.token}`,
            rejectUrl: `${deps.config.baseUrl}/hitl/${requestId}/reject?token=${tokenResult.token}`,
          });

          tokenRecords.push({
            requestId,
            approverId,
            tokenHash: tokenResult.hash,
            tokenExpiresAt: tokenResult.expiresAt,
          });
        }

        // 5. persist per-approver tokens
        await deps.tokenStore.insertTokens(tokenRecords);

        return Result.ok({
          requestId,
          policyId: data.policyId,
          approvers,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'PersistenceError',
          message: 'Failed to create multi-approver request',
          cause,
        });
      }
    },
  };
}
