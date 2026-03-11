/**
 * HITL-06: Decision Service — Approve/Reject
 * @task HITL-06
 * @frd FR-CORE-HITL-003
 *
 * Records approval decisions with:
 * - Token verification (signature, expiry, replay, audience)
 * - First-writer-wins via DB unique constraint on requestId
 * - Idempotency: same approver + same decision = 200
 * - Atomic: decision insert + request status update in single transaction
 * - Event emission for Inngest workflow resumption (HITL-07)
 */

import { Result } from '@aptivo/types';
import { verifyHitlToken } from '../tokens/jwt-manager.js';
import type { ReplayStore } from '../replay/replay-store.js';
import { RecordDecisionInputSchema } from './decision-types.js';
import type {
  RecordDecisionInput,
  RecordDecisionResult,
  HitlDecisionRecord,
  RequestSnapshot,
  ExistingDecision,
  DecisionError,
} from './decision-types.js';

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface DecisionStore {
  /** fetches the request by ID (returns null if not found) */
  getRequest(requestId: string): Promise<RequestSnapshot | null>;

  /** fetches existing decision for a request (returns null if none) */
  getDecisionByRequestId(requestId: string): Promise<ExistingDecision | null>;

  /**
   * Atomically inserts decision and updates request status.
   * Throws on unique constraint violation (first-writer-wins).
   */
  insertDecisionAndUpdateRequest(
    decision: HitlDecisionRecord,
    newStatus: 'approved' | 'rejected',
  ): Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// event emitter interface (for Inngest integration — HITL-07)
// ---------------------------------------------------------------------------

export interface DecisionEventEmitter {
  emit(event: {
    name: string;
    data: {
      requestId: string;
      decision: 'approved' | 'rejected';
      approverId: string;
      decidedAt: string;
    };
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// service config
// ---------------------------------------------------------------------------

export interface DecisionServiceConfig {
  /** JWT signing secret(s) for token verification. Array for key rotation. */
  signingSecrets: string | string[];
  /** JWT audience claim */
  audience: string;
  /** JWT issuer claim */
  issuer: string;
}

// ---------------------------------------------------------------------------
// service dependencies
// ---------------------------------------------------------------------------

export interface DecisionServiceDeps {
  store: DecisionStore;
  config: DecisionServiceConfig;
  replayStore?: ReplayStore;
  eventEmitter?: DecisionEventEmitter;
}

// ---------------------------------------------------------------------------
// record decision
// ---------------------------------------------------------------------------

export async function recordDecision(
  input: unknown,
  deps: DecisionServiceDeps,
): Promise<Result<RecordDecisionResult, DecisionError>> {
  // validate input
  const parsed = RecordDecisionInputSchema.safeParse(input);
  if (!parsed.success) {
    return Result.err({
      _tag: 'ValidationError',
      message: 'Invalid decision input',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const data: RecordDecisionInput = parsed.data;

  // verify token
  const tokenResult = await verifyHitlToken(
    data.token,
    deps.config.signingSecrets,
    { audience: deps.config.audience, issuer: deps.config.issuer },
    deps.replayStore,
  );
  if (!tokenResult.ok) {
    return Result.err({
      _tag: 'TokenVerificationError',
      reason: tokenResult.error.reason,
      message: tokenResult.error.message,
    });
  }

  // verify token was issued for this specific request
  if (tokenResult.value.requestId !== data.requestId) {
    return Result.err({
      _tag: 'TokenVerificationError',
      reason: 'invalid-binding',
      message: 'Token was not issued for this request',
    });
  }

  // verify token action permits the submitted decision
  // 'decide' tokens allow any decision; specific tokens ('approve'/'reject') are restricted
  const tokenAction = tokenResult.value.action;
  if (tokenAction !== 'decide') {
    const expectedAction = data.decision === 'approved' ? 'approve' : 'reject';
    if (tokenAction !== expectedAction) {
      return Result.err({
        _tag: 'TokenVerificationError',
        reason: 'invalid-action',
        message: `Token action '${tokenAction}' does not match decision '${data.decision}'`,
      });
    }
  }

  // fetch request
  const request = await deps.store.getRequest(data.requestId);
  if (!request) {
    return Result.err({
      _tag: 'RequestNotFoundError',
      requestId: data.requestId,
    });
  }

  // check if expired
  if (request.tokenExpiresAt < new Date()) {
    return Result.err({
      _tag: 'RequestExpiredError',
      requestId: data.requestId,
    });
  }

  // check if already resolved — but allow idempotent re-submission
  if (request.status !== 'pending') {
    // idempotency check: same decision already recorded?
    const existing = await deps.store.getDecisionByRequestId(data.requestId);
    if (
      existing &&
      existing.approverId === request.approverId &&
      existing.decision === data.decision
    ) {
      // idempotent — return the existing decision
      return Result.ok({
        decisionId: existing.id,
        requestId: data.requestId,
        decision: existing.decision,
        decidedAt: existing.decidedAt,
      });
    }
    return Result.err({
      _tag: 'RequestAlreadyResolvedError',
      requestId: data.requestId,
      existingStatus: request.status,
    });
  }

  // build decision record
  const now = new Date();
  const record: HitlDecisionRecord = {
    id: crypto.randomUUID(),
    requestId: data.requestId,
    approverId: request.approverId,
    decision: data.decision,
    comment: data.comment,
    channel: data.channel,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    decidedAt: now,
  };

  // atomic insert + status update
  try {
    const { id } = await deps.store.insertDecisionAndUpdateRequest(
      record,
      data.decision,
    );

    const result: RecordDecisionResult = {
      decisionId: id,
      requestId: data.requestId,
      decision: data.decision,
      decidedAt: now,
    };

    // emit event for Inngest (fire-and-forget)
    if (deps.eventEmitter) {
      deps.eventEmitter.emit({
        name: 'hitl/decision.recorded',
        data: {
          requestId: data.requestId,
          decision: data.decision,
          approverId: request.approverId,
          decidedAt: now.toISOString(),
        },
      }).catch(() => {
        // fire-and-forget — log in production, swallow in tests
      });
    }

    return Result.ok(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return Result.err({
        _tag: 'ConflictError',
        requestId: data.requestId,
        message: 'Decision already recorded for this request (first-writer-wins)',
      });
    }
    return Result.err({
      _tag: 'PersistenceError',
      message: 'Failed to record decision',
      cause: err,
    });
  }
}
