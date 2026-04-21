/**
 * LLM3-04: Gateway-pipeline integration for the anomaly gate.
 *
 * Covers the AnomalyBlocked variant, the resolveActor callback, and the
 * skip-when-no-actor behaviour. Mirrors the LLM3-02 integration-test
 * pattern so regressions around step ordering get caught.
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createLlmGateway } from '../../src/gateway/llm-gateway.js';
import type { GatewayDeps } from '../../src/gateway/llm-gateway.js';
import { BudgetService } from '../../src/budget/budget-service.js';
import { UsageLogger } from '../../src/usage/usage-logger.js';
import type { AnomalyGate } from '../../src/safety/anomaly-gate.js';
import type { AsyncInjectionClassifier } from '../../src/safety/ml-injection-classifier.js';
import type { InjectionVerdict, Domain } from '../../src/safety/safety-types.js';
import {
  makeRequest,
  createMockProvider,
  createMockBudgetStore,
  createMockUsageStore,
} from '../fixtures/index.js';

function baseDeps(overrides?: Partial<GatewayDeps>): GatewayDeps {
  return {
    providers: new Map([['openai', createMockProvider('openai')]]),
    budgetService: new BudgetService(createMockBudgetStore()),
    usageLogger: new UsageLogger(createMockUsageStore()),
    modelToProvider: { 'gpt-4o-mini': 'openai' },
    ...overrides,
  };
}

function gateReturning(decision: Awaited<ReturnType<AnomalyGate['evaluate']>>): AnomalyGate {
  return { evaluate: vi.fn(async () => decision) };
}

describe('LLM3-04: gateway + AnomalyGate', () => {
  it('returns AnomalyBlocked when the gate decides block', async () => {
    const gateway = createLlmGateway(baseDeps({
      anomalyGate: gateReturning({ action: 'block', reason: 'z=6.0' }),
      resolveActor: () => 'user:1',
    }));
    const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AnomalyBlocked');
    if (result.error._tag !== 'AnomalyBlocked') return;
    expect(result.error.reason).toBe('z=6.0');
  });

  it('returns AnomalyBlocked with cooldownMs when the gate decides throttle', async () => {
    const gateway = createLlmGateway(baseDeps({
      anomalyGate: gateReturning({ action: 'throttle', cooldownMs: 60_000, reason: 'z=4.2' }),
      resolveActor: () => 'user:1',
    }));
    const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('AnomalyBlocked');
    if (result.error._tag !== 'AnomalyBlocked') return;
    expect(result.error.cooldownMs).toBe(60_000);
  });

  it('passes through to provider when gate decides pass', async () => {
    const deps = baseDeps({
      anomalyGate: gateReturning({ action: 'pass' }),
      resolveActor: () => 'user:1',
    });
    const gateway = createLlmGateway(deps);
    const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deps.providers.get('openai')!.complete).toHaveBeenCalledOnce();
  });

  it('skips the gate entirely when resolveActor returns undefined (no actor → no check)', async () => {
    const gateSpy = gateReturning({ action: 'block', reason: 'should not fire' });
    const gateway = createLlmGateway(baseDeps({
      anomalyGate: gateSpy,
      resolveActor: () => undefined,
    }));
    const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
    expect(result.ok).toBe(true);
    expect(gateSpy.evaluate).not.toHaveBeenCalled();
  });

  it('forwards (actor, domain) to gate.evaluate', async () => {
    const gateSpy = gateReturning({ action: 'pass' });
    const gateway = createLlmGateway(baseDeps({
      anomalyGate: gateSpy,
      resolveActor: () => 'user:42',
    }));
    await gateway.complete(makeRequest({ model: 'gpt-4o-mini', domain: 'crypto' }));
    expect(gateSpy.evaluate).toHaveBeenCalledWith('user:42', 'crypto');
  });
});

// ---------------------------------------------------------------------------
// step-ordering integration: injection runs BEFORE anomaly
// ---------------------------------------------------------------------------

describe('LLM3-04: pipeline ordering — injection before anomaly', () => {
  function asyncBlocker(): AsyncInjectionClassifier {
    return {
      async classify(_prompt: string, domain: Domain) {
        const verdict: InjectionVerdict = {
          verdict: 'block',
          score: 0.95,
          matchedPatterns: ['ml:instruction_override'],
          domain,
        };
        return Result.ok(verdict);
      },
    };
  }

  it('injection blocks first when both injection and anomaly would fire', async () => {
    const anomalyGate = gateReturning({ action: 'block', reason: 'should not reach here' });
    const gateway = createLlmGateway(baseDeps({
      injectionClassifier: asyncBlocker(),
      anomalyGate,
      resolveActor: () => 'user:1',
    }));
    const result = await gateway.complete(makeRequest({ model: 'gpt-4o-mini' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('PromptInjectionBlocked');
    // anomaly gate must not have been called — injection short-circuits first
    expect(anomalyGate.evaluate).not.toHaveBeenCalled();
  });
});
