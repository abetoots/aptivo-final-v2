/**
 * S18-A1: completeWorkflowRequest wrapper tests.
 *
 * The wrapper's job is twofold:
 *   1. Make actor stamping a *required* parameter so workflow callsites
 *      think about identity (the type-system gate of AD-S18-1).
 *   2. Stamp the supplied actor onto the gateway request without
 *      mutating the caller's input shape.
 *
 * Tests cover the runtime stamping behaviour. The compile-time
 * "actor parameter is required" guarantee is enforced by tsc and is
 * exercised by every callsite in the workflow tree once A1 lands the
 * 4-file rewrite — adding a runtime assertion would only test
 * TypeScript itself.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  ActorContext,
  CompletionRequest,
  GatewayResponse,
  LLMError,
} from '@aptivo/llm-gateway';
import { Result, type Result as ResultT } from '@aptivo/types';
import {
  completeWorkflowRequest,
  type CompleteCapableGateway,
  type WorkflowCompletionRequest,
} from '../../src/lib/llm/complete-workflow-request.js';

function makeOkResponse(): GatewayResponse {
  return {
    completion: {
      id: 'completion-id',
      content: 'ok',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
    costUsd: 0.0001,
    provider: 'mock',
    wasFallback: false,
    latencyMs: 12,
  };
}

function makeGatewaySpy(): {
  gateway: CompleteCapableGateway;
  calls: Array<{
    request: CompletionRequest;
    options?: { userId?: string; estimatedCostUsd?: number };
  }>;
} {
  const calls: Array<{
    request: CompletionRequest;
    options?: { userId?: string; estimatedCostUsd?: number };
  }> = [];

  const complete = vi.fn(async (request: CompletionRequest, options?: { userId?: string; estimatedCostUsd?: number }): Promise<ResultT<GatewayResponse, LLMError>> => {
    calls.push({ request, options });
    return Result.ok(makeOkResponse());
  });

  return { gateway: { complete }, calls };
}

const baseRequest: WorkflowCompletionRequest = {
  model: 'claude-3-5-sonnet',
  messages: [{ role: 'user', content: 'hello' }],
  domain: 'crypto',
};

describe('S18-A1: completeWorkflowRequest', () => {
  it('stamps the supplied actor onto the gateway request', async () => {
    const { gateway, calls } = makeGatewaySpy();
    const actor: ActorContext = {
      userId: 'user-42',
      departmentId: 'dept-eng',
      roles: ['admin'],
    };

    const result = await completeWorkflowRequest({
      gateway,
      request: baseRequest,
      actor,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.request.actor).toEqual(actor);
  });

  it('forwards actor: undefined honestly when no acting user is in scope', async () => {
    const { gateway, calls } = makeGatewaySpy();

    await completeWorkflowRequest({
      gateway,
      request: baseRequest,
      actor: undefined,
    });

    // honest semantics: undefined goes through as undefined; the gateway
    // falls back to deps.resolveActor (bound to () => undefined in
    // services.ts:678 — by design — so the call proceeds without
    // anomaly-gate scoping). No synthetic 'system' user fabricated.
    expect(calls[0]!.request.actor).toBeUndefined();
  });

  it('preserves all non-actor fields on the request', async () => {
    const { gateway, calls } = makeGatewaySpy();
    const fullRequest: WorkflowCompletionRequest = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: 'json',
      workflowId: 'wf-001',
      workflowStepId: 'step-llm-analyze',
      domain: 'crypto',
    };

    await completeWorkflowRequest({
      gateway,
      request: fullRequest,
      actor: { userId: 'user-42' },
    });

    const stamped = calls[0]!.request;
    expect(stamped.temperature).toBe(0.3);
    expect(stamped.maxTokens).toBe(1024);
    expect(stamped.responseFormat).toBe('json');
    expect(stamped.workflowId).toBe('wf-001');
    expect(stamped.workflowStepId).toBe('step-llm-analyze');
    expect(stamped.domain).toBe('crypto');
  });

  it('forwards options through to the gateway', async () => {
    const { gateway, calls } = makeGatewaySpy();

    await completeWorkflowRequest({
      gateway,
      request: baseRequest,
      actor: { userId: 'user-42' },
      options: { userId: 'rate-limit-key', estimatedCostUsd: 0.01 },
    });

    expect(calls[0]!.options).toEqual({
      userId: 'rate-limit-key',
      estimatedCostUsd: 0.01,
    });
  });

  it('does not mutate the caller-supplied request object', async () => {
    const { gateway } = makeGatewaySpy();
    const original: WorkflowCompletionRequest = { ...baseRequest };
    const beforeJson = JSON.stringify(original);

    await completeWorkflowRequest({
      gateway,
      request: original,
      actor: { userId: 'user-42' },
    });

    expect(JSON.stringify(original)).toBe(beforeJson);
    // and 'actor' is not a property of the original
    expect((original as Record<string, unknown>).actor).toBeUndefined();
  });
});
