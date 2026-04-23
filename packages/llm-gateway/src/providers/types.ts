/**
 * LLM-03: Provider Abstraction
 * @task LLM-03
 * @spec docs/04-specs/platform-core/llm-gateway.md §2.1
 * @brd BO-CORE-003
 */

import type { Result } from '@aptivo/types';
import type { InjectionVerdict } from '../safety/safety-types.js';

// ---------------------------------------------------------------------------
// domain types
// ---------------------------------------------------------------------------

export type Domain = 'crypto' | 'hr' | 'core';

export type FinishReason = 'stop' | 'length' | 'tool_calls';

export interface TokenCount {
  prompt: number;
  completion: number;
}

// ---------------------------------------------------------------------------
// message types
// ---------------------------------------------------------------------------

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  imageUrl?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ---------------------------------------------------------------------------
// request / response
// ---------------------------------------------------------------------------

/**
 * S17-B1: actor context resolved from the request's authentication
 * principal. Carries the user identity used for anomaly-gate scoping
 * and the department used for usage attribution. Optional because not
 * every gateway caller is request-scoped (e.g. background workflow
 * steps may run as the platform service account).
 *
 * Populated either by the caller (e.g. requireLlmContext middleware
 * in apps/web) or, as a fallback, by `GatewayDeps.resolveActor`.
 */
export interface ActorContext {
  readonly userId: string;
  readonly departmentId?: string;
  readonly roles?: readonly string[];
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  responseFormat?: 'text' | 'json';
  // context for tracking
  workflowId?: string;
  workflowStepId?: string;
  domain: Domain;
  /**
   * S17-B1: actor stamped by the caller. When unset the gateway falls
   * back to `GatewayDeps.resolveActor`. Field is optional so existing
   * callers (background workflows, tests) compile unchanged.
   */
  actor?: ActorContext;
}

export interface CompletionResponse {
  id: string;
  content: string;
  finishReason: FinishReason;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ToolCall[];
}

export interface StreamChunk {
  content: string;
  finishReason?: FinishReason;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type LLMError =
  | { _tag: 'ProviderNotFound'; providerId: string }
  | { _tag: 'ModelNotSupported'; model: string; provider: string }
  | { _tag: 'RateLimit'; retryAfter?: number }
  | { _tag: 'ServiceUnavailable'; provider: string }
  | { _tag: 'Timeout'; provider: string }
  | { _tag: 'ContentFilter'; reason: string }
  | { _tag: 'InvalidRequest'; message: string }
  | { _tag: 'DailyBudgetExceeded'; dailyUsed: number; dailyLimit: number }
  | { _tag: 'MonthlyBudgetExceeded'; monthlyUsed: number; monthlyLimit: number }
  | { _tag: 'RateLimitExceeded'; userId: string; limit: number }
  | { _tag: 'OutputValidationFailed'; zodErrors: string }
  | { _tag: 'NetworkError'; cause: unknown }
  | { _tag: 'PromptInjectionBlocked'; verdict: InjectionVerdict }
  | { readonly _tag: 'ContentBlocked'; readonly stage: 'pre_request' | 'post_response'; readonly reason: string; readonly category: string }
  /**
   * LLM3-04: the anomaly gate detected abnormal access patterns and the
   * decision exceeded the block threshold. `cooldownMs` is present for
   * throttle-vs-block symmetry but is only set on throttle; callers that
   * see `AnomalyBlocked` should not retry automatically.
   */
  | { readonly _tag: 'AnomalyBlocked'; readonly reason?: string; readonly cooldownMs?: number };

// ---------------------------------------------------------------------------
// provider interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
  id: string;
  name: string;
  supportsStreaming: boolean;

  complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>>;
  stream(request: CompletionRequest): AsyncGenerator<StreamChunk, void, unknown>;
  estimateCost(model: string, tokens: TokenCount): number;
  isAvailable(): Promise<boolean>;
}

/** checks if an error is retryable for fallback purposes */
export function isRetryableError(error: LLMError): boolean {
  return (
    error._tag === 'RateLimit' ||
    error._tag === 'ServiceUnavailable' ||
    error._tag === 'Timeout' ||
    error._tag === 'NetworkError'
  );
}
