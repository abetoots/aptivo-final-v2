/**
 * HITL2-05: Resubmit Service — Request Changes Re-submission
 * @task HITL2-05
 *
 * allows a request in 'changes_requested' status to be re-submitted
 * with an incremented retry count and a fresh approval token.
 * enforced by the policy's maxRetries limit (default 3).
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type ResubmitError =
  | { readonly _tag: 'ResubmitNotAllowed'; readonly message: string }
  | { readonly _tag: 'MaxRetriesExceeded'; readonly requestId: string; readonly maxRetries: number; readonly currentRetries: number }
  | { readonly _tag: 'RequestNotFound'; readonly requestId: string }
  | { readonly _tag: 'PersistenceError'; readonly message: string; readonly cause: unknown };

// ---------------------------------------------------------------------------
// result type
// ---------------------------------------------------------------------------

export interface ResubmitResult {
  requestId: string;
  retryCount: number;
  newToken: string;
  newTokenHash: string;
  newTokenExpiresAt: Date;
}

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface ResubmitStoreDeps {
  getRequest(requestId: string): Promise<{
    id: string;
    status: string;
    retryCount: number;
    policyId: string | null;
  } | null>;
  updateRequestForResubmit(
    requestId: string,
    retryCount: number,
    tokenHash: string,
    tokenExpiresAt: Date,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// service dependencies
// ---------------------------------------------------------------------------

export interface ResubmitServiceDeps {
  store: ResubmitStoreDeps;
  policyStore: { findById(id: string): Promise<{ maxRetries: number } | null> };
  generateToken: (payload: Record<string, unknown>) => Promise<{
    token: string;
    hash: string;
    expiresAt: Date;
  }>;
}

// ---------------------------------------------------------------------------
// service factory
// ---------------------------------------------------------------------------

export function createResubmitService(deps: ResubmitServiceDeps) {
  return {
    async resubmitRequest(
      requestId: string,
      _updatedDetails?: Record<string, unknown>,
    ): Promise<Result<ResubmitResult, ResubmitError>> {
      try {
        // 1. fetch request
        const request = await deps.store.getRequest(requestId);
        if (!request) {
          return Result.err({ _tag: 'RequestNotFound', requestId });
        }

        // 2. check status is changes_requested
        if (request.status !== 'changes_requested') {
          return Result.err({
            _tag: 'ResubmitNotAllowed',
            message: `Request status is '${request.status}', must be 'changes_requested' to resubmit`,
          });
        }

        // 3. check retry limit
        const maxRetries = request.policyId
          ? (await deps.policyStore.findById(request.policyId))?.maxRetries ?? 3
          : 3;

        if (request.retryCount >= maxRetries) {
          return Result.err({
            _tag: 'MaxRetriesExceeded',
            requestId,
            maxRetries,
            currentRetries: request.retryCount,
          });
        }

        // 4. generate new token
        const tokenResult = await deps.generateToken({ requestId, action: 'decide' });

        // 5. update request: increment retryCount, reset status to pending, new token
        const newRetryCount = request.retryCount + 1;
        await deps.store.updateRequestForResubmit(
          requestId,
          newRetryCount,
          tokenResult.hash,
          tokenResult.expiresAt,
        );

        return Result.ok({
          requestId,
          retryCount: newRetryCount,
          newToken: tokenResult.token,
          newTokenHash: tokenResult.hash,
          newTokenExpiresAt: tokenResult.expiresAt,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'PersistenceError',
          message: `Failed to resubmit request ${requestId}`,
          cause,
        });
      }
    },
  };
}
