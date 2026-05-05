/**
 * S18-A1: typed wrapper that makes actor stamping a compile-time
 * obligation for workflow callsites.
 *
 * Why this exists: `CompletionRequest.actor` is optional, by design — HTTP
 * callers, tests, and background jobs without an authenticated principal
 * all share one shape. That optionality leaked silently into workflow
 * code in S16/S17: 3 of 5 LLM callsites passed `userId: 'system'` and the
 * anomaly gate's aggregate query (`WHERE user_id = $actor`) returned zero
 * rows in production. AD-S18-1 closes that with two locks:
 *
 *   1. (this file) workflow callsites import `completeWorkflowRequest`,
 *      which takes `ActorContext | undefined` as a *required* parameter.
 *      Passing `undefined` is explicit and reviewable; forgetting the
 *      parameter is a compile error.
 *
 *   2. (CI gate) `scripts/lint-workflow-gateway-calls.sh` greps the
 *      workflow tree for naked `gateway.complete(` and fails the build
 *      on a hit. This catches drift if a contributor copies a non-
 *      workflow callsite into the workflow tree.
 *
 * Both locks are needed: the type-system gate prevents accidental
 * omissions in new code; the CI gate catches paste-from-elsewhere drift
 * that would compile cleanly.
 *
 * Honest semantics: when `actor` is `undefined` (external trigger, no
 * acting user yet), the wrapper does NOT fabricate a synthetic user — it
 * forwards `actor: undefined` to the gateway, the gateway falls back to
 * `GatewayDeps.resolveActor` (which is bound to `() => undefined` in
 * services.ts:678 by design), and the call proceeds without anomaly-gate
 * scoping. That is the right behaviour: there is no user to attribute
 * to, so attribution must be honest.
 */

import type {
  ActorContext,
  CompletionRequest,
  GatewayResponse,
  LLMError,
} from '@aptivo/llm-gateway';
import type { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// gateway-shape interface — narrow enough for tests, broad enough to accept
// the real `LlmGateway` returned by `createLlmGateway`
// ---------------------------------------------------------------------------

export interface CompleteCapableGateway {
  complete(
    request: CompletionRequest,
    options?: { userId?: string; estimatedCostUsd?: number },
  ): Promise<Result<GatewayResponse, LLMError>>;
}

// ---------------------------------------------------------------------------
// wrapper input — request *without* `actor`; the wrapper stamps it
// ---------------------------------------------------------------------------

/**
 * The gateway request shape minus `actor`. Workflow code constructs
 * this; the wrapper attaches the resolved actor before forwarding.
 *
 * Defining this as `Omit<CompletionRequest, 'actor'>` (rather than
 * accepting the full request) prevents callers from passing a
 * pre-stamped actor that disagrees with the wrapper's `actor`
 * parameter — single source of truth for who's acting.
 */
export type WorkflowCompletionRequest = Omit<CompletionRequest, 'actor'>;

export interface CompleteWorkflowRequestArgs {
  readonly gateway: CompleteCapableGateway;
  readonly request: WorkflowCompletionRequest;
  /**
   * Required parameter — the type system enforces that workflow
   * callsites think about actor identity. Pass `undefined` only when
   * there is genuinely no acting user (external trigger before any
   * HITL hand-off) and document the reason inline.
   */
  readonly actor: ActorContext | undefined;
  readonly options?: { userId?: string; estimatedCostUsd?: number };
}

// ---------------------------------------------------------------------------
// wrapper
// ---------------------------------------------------------------------------

export function completeWorkflowRequest(
  args: CompleteWorkflowRequestArgs,
): Promise<Result<GatewayResponse, LLMError>> {
  const stamped: CompletionRequest = {
    ...args.request,
    actor: args.actor,
  };
  return args.gateway.complete(stamped, args.options);
}
