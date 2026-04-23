/**
 * LLM-08: Usage Logger Tests
 * @task LLM-08
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UsageLogger } from '../../src/usage/usage-logger.js';
import { createMockUsageStore, makeRequest, makeResponse } from '../fixtures/index.js';
import type { UsageStore } from '../../src/usage/usage-logger.js';

describe('UsageLogger', () => {
  let store: UsageStore & { inserted: unknown[] };
  let logger: UsageLogger;

  beforeEach(() => {
    store = createMockUsageStore();
    logger = new UsageLogger(store);
  });

  it('logs usage with correct fields', async () => {
    const request = makeRequest({ workflowId: 'wf-1', workflowStepId: 'step-1' });
    const response = makeResponse();

    await logger.logUsage(request, response, 'openai', 150);

    expect(store.insert).toHaveBeenCalledOnce();
    const record = store.inserted[0] as Record<string, unknown>;
    expect(record).toMatchObject({
      workflowId: 'wf-1',
      workflowStepId: 'step-1',
      domain: 'core',
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      requestType: 'completion',
      latencyMs: 150,
      wasFallback: false,
    });
    expect(record['costUsd']).toBeGreaterThan(0);
  });

  it('marks fallback correctly', async () => {
    await logger.logUsage(
      makeRequest(),
      makeResponse(),
      'anthropic',
      200,
      { wasFallback: true, primaryProvider: 'openai' },
    );

    const record = store.inserted[0] as Record<string, unknown>;
    expect(record['wasFallback']).toBe(true);
    expect(record['primaryProvider']).toBe('openai');
  });

  it('handles missing optional fields', async () => {
    await logger.logUsage(makeRequest(), makeResponse(), 'openai', 100);

    const record = store.inserted[0] as Record<string, unknown>;
    expect(record['workflowId']).toBeUndefined();
    expect(record['primaryProvider']).toBeUndefined();
    expect(record['wasFallback']).toBe(false);
  });

  it('calculates cost including infrastructure overhead', async () => {
    await logger.logUsage(makeRequest(), makeResponse(), 'openai', 100);

    const record = store.inserted[0] as Record<string, unknown>;
    const costUsd = record['costUsd'] as number;
    // should include 5% infra overhead
    // gpt-4o-mini: (10/1M * 0.15 + 20/1M * 0.60) * 1.05
    const expectedLlm = (10 / 1_000_000) * 0.15 + (20 / 1_000_000) * 0.60;
    const expected = expectedLlm * 1.05;
    expect(costUsd).toBeCloseTo(expected, 10);
  });

  // S17-B1: department attribution
  it('persists departmentId from opts when provided', async () => {
    await logger.logUsage(
      makeRequest(),
      makeResponse(),
      'openai',
      100,
      { departmentId: 'dept-eng' },
    );

    const record = store.inserted[0] as Record<string, unknown>;
    expect(record['departmentId']).toBe('dept-eng');
  });

  it('persists departmentId from request.actor when opts.departmentId is unset', async () => {
    const request = makeRequest({
      actor: { userId: 'user-1', departmentId: 'dept-fin' },
    });
    await logger.logUsage(request, makeResponse(), 'openai', 100);

    const record = store.inserted[0] as Record<string, unknown>;
    expect(record['departmentId']).toBe('dept-fin');
  });

  it('leaves departmentId undefined when neither opts nor request.actor carry it', async () => {
    await logger.logUsage(makeRequest(), makeResponse(), 'openai', 100);

    const record = store.inserted[0] as Record<string, unknown>;
    expect(record['departmentId']).toBeUndefined();
  });
});
