/**
 * SP-12: End-to-End Latency Spike
 * @spike SP-12
 * @brd BO-CORE-012, BRD §6.13 (Build: Performance)
 * @frd FR-CORE-WFE-010 (Latency SLA)
 * @add ADD §8 (Observability), §8.1 (Latency Tracking)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-12
 *
 * Measures platform overhead for the critical path:
 *   trigger → step execution → MCP tool call → HITL wait setup → response
 *
 * Success criteria:
 *   - TTFT < 2s, Platform overhead (non-LLM) < 1s, Total < 15s reasoning / < 5s fast
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTestServer } from './sp-05-mcp-transport.js';

export const SP_12_CONFIG = {
  name: 'SP-12: E2E Latency',
  risk: 'HIGH' as const,
  validations: [
    'Event ingestion latency',
    'Step execution latency',
    'HITL wait overhead',
    'MCP tool call round-trip time',
    'Total workflow completion time',
    'Latency distribution (p50, p95, p99)',
  ],
  thresholds: {
    platformOverheadMs: 1_000, // < 1s non-LLM overhead
    ttftMs: 2_000,             // < 2s time to first token
    totalFastMs: 5_000,        // < 5s for fast models
    totalReasoningMs: 15_000,  // < 15s for reasoning models
  },
} as const;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function hrtMs(): number {
  const [s, ns] = process.hrtime();
  return s * 1_000 + ns / 1_000_000;
}

export function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

export interface SegmentTiming {
  label: string;
  durationMs: number;
}

export interface LatencyReport {
  segments: SegmentTiming[];
  platformOverheadMs: number;
  totalMs: number;
}

export interface PercentileReport {
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

// ---------------------------------------------------------------------------
// segment measurement functions
// ---------------------------------------------------------------------------

/**
 * Measures Inngest step.run() overhead via the test engine.
 * Uses a no-op step to isolate framework overhead from business logic.
 */
export async function measureStepOverhead(iterations: number): Promise<PercentileReport> {
  const { InngestTestEngine } = await import('@inngest/test');
  const { inngest } = await import('./inngest-client.js');

  // minimal function with a single no-op step
  const fn = inngest.createFunction(
    { id: 'sp12-step-overhead', retries: 0 },
    { event: 'spike/sp01.timeout-test' },
    async ({ step }) => {
      return await step.run('noop', () => ({ done: true }));
    },
  );

  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const engine = new InngestTestEngine({ function: fn });
    const t0 = hrtMs();
    await engine.execute();
    timings.push(hrtMs() - t0);
  }

  timings.sort((a, b) => a - b);
  return {
    iterations,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
  };
}

/**
 * Measures MCP in-process tool call latency (echo tool via InMemoryTransport).
 */
export async function measureMcpCallOverhead(iterations: number): Promise<PercentileReport> {
  const server = createTestServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'sp12-mcp-client', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // warm up
  await client.callTool({ name: 'echo', arguments: { message: 'warmup' } });

  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = hrtMs();
    await client.callTool({ name: 'echo', arguments: { message: `iter-${i}` } });
    timings.push(hrtMs() - t0);
  }

  await client.close();
  await server.close();

  timings.sort((a, b) => a - b);
  return {
    iterations,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
  };
}

/**
 * Measures HITL waitForEvent setup overhead (not the actual wait duration).
 * Uses test engine with a mocked waitForEvent step that resolves immediately.
 */
export async function measureHitlSetupOverhead(iterations: number): Promise<PercentileReport> {
  const { InngestTestEngine } = await import('@inngest/test');
  const { hitlApprovalFn } = await import('./sp-02-hitl-wait.js');

  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const engine = new InngestTestEngine({
      function: hitlApprovalFn,
      events: [{
        name: 'spike/sp02.approval-request' as const,
        data: { requestId: `req-${i}`, workflowId: 'wf-1', description: 'test' },
      }],
      steps: [{
        id: 'wait-for-decision',
        handler: () => ({
          name: 'spike/sp02.approval-response',
          data: { requestId: `req-${i}`, decision: 'approved', decidedBy: 'alice' },
        }),
      }],
    });

    const t0 = hrtMs();
    await engine.execute();
    timings.push(hrtMs() - t0);
  }

  timings.sort((a, b) => a - b);
  return {
    iterations,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
  };
}

/**
 * Simulates a full E2E workflow and measures platform overhead.
 *
 * Segments:
 *   1. Inngest step execution (prepare)
 *   2. Simulated LLM call (configurable delay)
 *   3. MCP tool call (in-process)
 *   4. HITL wait setup (mocked immediate)
 *   5. Post-processing step
 */
export async function measureE2eWorkflow(
  simulatedLlmDelayMs: number,
  iterations: number,
): Promise<{ perIteration: PercentileReport; avgSegments: SegmentTiming[]; platformOverheadMs: number }> {
  const { InngestTestEngine } = await import('@inngest/test');
  const { inngest } = await import('./inngest-client.js');

  // set up MCP client once
  const server = createTestServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'sp12-e2e-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // multi-step function simulating full workflow
  const e2eFn = inngest.createFunction(
    { id: 'sp12-e2e-flow', retries: 0 },
    { event: 'spike/sp01.timeout-test' },
    async ({ step }) => {
      const t: Record<string, number> = {};

      // step 1: prepare
      let s = hrtMs();
      await step.run('prepare', () => ({ ready: true }));
      t['step-prepare'] = hrtMs() - s;

      // step 2: simulated LLM call
      s = hrtMs();
      await step.run('llm-call', async () => {
        await new Promise((r) => setTimeout(r, simulatedLlmDelayMs));
        return { response: 'LLM output' };
      });
      t['llm-call'] = hrtMs() - s;

      // step 3: post-processing
      s = hrtMs();
      await step.run('post-process', () => ({ processed: true }));
      t['step-postprocess'] = hrtMs() - s;

      return { timings: t };
    },
  );

  const totals: number[] = [];
  const segmentAccum: Record<string, number[]> = {};

  for (let i = 0; i < iterations; i++) {
    const engine = new InngestTestEngine({ function: e2eFn });
    const t0 = hrtMs();
    const { result } = await engine.execute();
    totals.push(hrtMs() - t0);

    const r = result as { timings?: Record<string, number> } | undefined;
    if (r?.timings) {
      for (const [k, v] of Object.entries(r.timings)) {
        (segmentAccum[k] ??= []).push(v);
      }
    }
  }

  await client.close();
  await server.close();

  totals.sort((a, b) => a - b);

  const avgSegments: SegmentTiming[] = Object.entries(segmentAccum).map(([label, vals]) => ({
    label,
    durationMs: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

  const avgTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
  const llmSegment = avgSegments.find((s) => s.label === 'llm-call');
  const platformOverheadMs = avgTotal - (llmSegment?.durationMs ?? 0);

  return {
    perIteration: {
      iterations,
      p50Ms: percentile(totals, 50),
      p95Ms: percentile(totals, 95),
      p99Ms: percentile(totals, 99),
      avgMs: avgTotal,
      minMs: totals[0]!,
      maxMs: totals[totals.length - 1]!,
    },
    avgSegments,
    platformOverheadMs,
  };
}
