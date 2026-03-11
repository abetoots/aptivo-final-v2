/**
 * HITL-05: Create Request Service
 * @task HITL-05
 * @frd FR-CORE-HITL-001
 *
 * Creates HITL approval requests, mints tokens, persists request state.
 * Functional core — all side effects go through injected dependencies.
 */

import { Result } from '@aptivo/types';
import { generateHitlToken } from '../tokens/jwt-manager.js';
import { CreateRequestInputSchema } from './request-types.js';
import type {
  CreateRequestInput,
  CreateRequestResult,
  HitlRequestRecord,
  RequestError,
} from './request-types.js';

// ---------------------------------------------------------------------------
// store interface
// ---------------------------------------------------------------------------

export interface RequestStore {
  insert(record: HitlRequestRecord): Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// service config
// ---------------------------------------------------------------------------

export interface RequestServiceConfig {
  /** base URL for approval action links (e.g. https://app.aptivo.com) */
  baseUrl: string;
  /** JWT signing secret (>= 32 chars) */
  signingSecret: string;
  /** JWT audience claim */
  audience: string;
  /** JWT issuer claim */
  issuer: string;
}

// ---------------------------------------------------------------------------
// service dependencies
// ---------------------------------------------------------------------------

export interface RequestServiceDeps {
  store: RequestStore;
  config: RequestServiceConfig;
}

// ---------------------------------------------------------------------------
// create request
// ---------------------------------------------------------------------------

export async function createRequest(
  input: unknown,
  deps: RequestServiceDeps,
): Promise<Result<CreateRequestResult, RequestError>> {
  // validate input
  const parsed = CreateRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return Result.err({
      _tag: 'ValidationError',
      message: 'Invalid request input',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const data: CreateRequestInput = parsed.data;

  // generate request ID first so it can be bound into the token
  const requestId = crypto.randomUUID();

  // generate decision token (authorizes both approve and reject)
  const approveToken = await generateHitlToken(
    {
      requestId,
      action: 'decide',
      channel: 'web',
      audience: deps.config.audience,
      issuer: deps.config.issuer,
      ttlSeconds: data.ttlSeconds,
    },
    deps.config.signingSecret,
  );
  if (!approveToken.ok) {
    return Result.err({
      _tag: 'TokenGenerationError',
      message: approveToken.error.message,
    });
  }

  // build record
  const now = new Date();
  const record: HitlRequestRecord = {
    id: requestId,
    workflowId: data.workflowId,
    workflowStepId: data.workflowStepId,
    domain: data.domain,
    actionType: data.actionType,
    summary: data.summary,
    details: data.details,
    approverId: data.approverId,
    status: 'pending',
    tokenHash: approveToken.value.tokenHash,
    tokenExpiresAt: approveToken.value.expiresAt,
    createdAt: now,
  };

  // persist
  try {
    const { id } = await deps.store.insert(record);

    const tokenParam = encodeURIComponent(approveToken.value.token);
    const approveUrl = `${deps.config.baseUrl}/hitl/${id}?action=approve&token=${tokenParam}`;
    const rejectUrl = `${deps.config.baseUrl}/hitl/${id}?action=reject&token=${tokenParam}`;

    return Result.ok({
      requestId: id,
      tokenHash: approveToken.value.tokenHash,
      token: approveToken.value.token,
      tokenExpiresAt: approveToken.value.expiresAt,
      approveUrl,
      rejectUrl,
    });
  } catch (err: unknown) {
    // handle unique constraint violation on tokenHash
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return Result.err({
        _tag: 'DuplicateTokenError',
        message: 'Token hash collision — retry with new token',
      });
    }
    return Result.err({
      _tag: 'PersistenceError',
      message: 'Failed to create HITL request',
      cause: err,
    });
  }
}
