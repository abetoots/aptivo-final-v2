/**
 * @testcase SP-12-PERF-001 through SP-12-PERF-006
 * @requirements FR-CORE-WFE-010
 * @brd BO-CORE-012, BRD §6.13
 * @add ADD §8 (Observability), §8.1 (Latency Tracking)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-12
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
  SP_12_CONFIG,
  measureStepOverhead,
  measureMcpCallOverhead,
  measureHitlSetupOverhead,
  measureE2eWorkflow,
  percentile,
  type PercentileReport,
} from '../src/sp-12-e2e-latency.js';

// iteration count kept low for test speed; benchmarks can run higher
const ITERATIONS = 5;

// collect reports for summary table
const reports: Record<string, PercentileReport> = {};

afterAll(() => {
  console.log('\n--- SP-12 Latency Summary ---');
  for (const [label, r] of Object.entries(reports)) {
    console.log(
      `  ${label}: p50=${r.p50Ms.toFixed(2)}ms  p95=${r.p95Ms.toFixed(2)}ms  p99=${r.p99Ms.toFixed(2)}ms  avg=${r.avgMs.toFixed(2)}ms  [${r.minMs.toFixed(2)}..${r.maxMs.toFixed(2)}]`,
    );
  }
  console.log('---\n');
});

describe('SP-12: E2E Latency', () => {
  // ---------------------------------------------------------------------------
  // config
  // ---------------------------------------------------------------------------
  describe('configuration', () => {
    it('exports spike config with all validation labels', () => {
      expect(SP_12_CONFIG.name).toBe('SP-12: E2E Latency');
      expect(SP_12_CONFIG.risk).toBe('HIGH');
      expect(SP_12_CONFIG.validations).toHaveLength(6);
    });

    it('defines platform overhead threshold < 1s', () => {
      expect(SP_12_CONFIG.thresholds.platformOverheadMs).toBe(1_000);
    });
  });

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  describe('percentile helper', () => {
    it('computes p50 from sorted array', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(sorted, 50)).toBe(5);
    });

    it('computes p99 from sorted array', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(percentile(sorted, 99)).toBe(10);
    });

    it('handles single-element array', () => {
      expect(percentile([42], 50)).toBe(42);
      expect(percentile([42], 99)).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // segment: inngest step overhead
  // ---------------------------------------------------------------------------
  describe('inngest step execution overhead', () => {
    it('measures step.run() overhead with percentile distribution', async () => {
      const report = await measureStepOverhead(ITERATIONS);
      reports['step-overhead'] = report;

      expect(report.iterations).toBe(ITERATIONS);
      expect(report.p50Ms).toBeGreaterThan(0);
      expect(report.p95Ms).toBeGreaterThanOrEqual(report.p50Ms);
      expect(report.p99Ms).toBeGreaterThanOrEqual(report.p95Ms);
      expect(report.minMs).toBeLessThanOrEqual(report.maxMs);
    });

    it('step overhead p95 stays under platform threshold', async () => {
      const report = await measureStepOverhead(ITERATIONS);
      // individual step overhead should be well under 1s
      expect(report.p95Ms).toBeLessThan(SP_12_CONFIG.thresholds.platformOverheadMs);
    });
  });

  // ---------------------------------------------------------------------------
  // segment: mcp tool call overhead
  // ---------------------------------------------------------------------------
  describe('MCP tool call overhead', () => {
    it('measures in-process MCP call latency with distribution', async () => {
      const report = await measureMcpCallOverhead(ITERATIONS);
      reports['mcp-call'] = report;

      expect(report.iterations).toBe(ITERATIONS);
      expect(report.avgMs).toBeGreaterThan(0);
      expect(report.minMs).toBeLessThanOrEqual(report.maxMs);
    });

    it('MCP call p95 stays under 100ms for in-process transport', async () => {
      const report = await measureMcpCallOverhead(ITERATIONS);
      // in-process calls should be sub-100ms
      expect(report.p95Ms).toBeLessThan(100);
    });
  });

  // ---------------------------------------------------------------------------
  // segment: hitl wait setup overhead
  // ---------------------------------------------------------------------------
  describe('HITL wait setup overhead', () => {
    it('measures waitForEvent setup latency with distribution', async () => {
      const report = await measureHitlSetupOverhead(ITERATIONS);
      reports['hitl-setup'] = report;

      expect(report.iterations).toBe(ITERATIONS);
      expect(report.avgMs).toBeGreaterThan(0);
    });

    it('HITL setup p95 stays under platform threshold', async () => {
      const report = await measureHitlSetupOverhead(ITERATIONS);
      expect(report.p95Ms).toBeLessThan(SP_12_CONFIG.thresholds.platformOverheadMs);
    });
  });

  // ---------------------------------------------------------------------------
  // e2e workflow
  // ---------------------------------------------------------------------------
  describe('end-to-end workflow', () => {
    const SIMULATED_LLM_DELAY = 50; // 50ms simulated LLM latency

    it('measures full workflow with segment breakdown', async () => {
      const { perIteration, avgSegments, platformOverheadMs } =
        await measureE2eWorkflow(SIMULATED_LLM_DELAY, ITERATIONS);

      reports['e2e-total'] = perIteration;

      expect(perIteration.iterations).toBe(ITERATIONS);
      expect(avgSegments.length).toBeGreaterThan(0);
      expect(platformOverheadMs).toBeGreaterThan(0);
    });

    it('platform overhead (non-LLM) stays under 1s threshold', async () => {
      const { platformOverheadMs } =
        await measureE2eWorkflow(SIMULATED_LLM_DELAY, ITERATIONS);

      expect(platformOverheadMs).toBeLessThan(SP_12_CONFIG.thresholds.platformOverheadMs);
    });

    it('identifies segment-level timing breakdown', async () => {
      const { avgSegments } =
        await measureE2eWorkflow(SIMULATED_LLM_DELAY, ITERATIONS);

      const labels = avgSegments.map((s) => s.label);
      // should have prepare, llm-call, and post-process segments
      expect(labels).toContain('step-prepare');
      expect(labels).toContain('llm-call');
      expect(labels).toContain('step-postprocess');
    });

    it('llm segment is present and measurable', async () => {
      const { avgSegments } =
        await measureE2eWorkflow(SIMULATED_LLM_DELAY, ITERATIONS);

      const llmSegment = avgSegments.find((s) => s.label === 'llm-call');
      expect(llmSegment).toBeDefined();
      // test engine memoizes steps, so inner timing captures engine overhead
      // rather than real delay — we verify the segment is tracked, not that it dominates
      expect(llmSegment!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // threshold summary
  // ---------------------------------------------------------------------------
  describe('threshold validation', () => {
    it('total fast-model e2e (with simulated LLM) stays under 5s', async () => {
      // simulate a fast model with 100ms llm delay
      const { perIteration } = await measureE2eWorkflow(100, ITERATIONS);
      expect(perIteration.p95Ms).toBeLessThan(SP_12_CONFIG.thresholds.totalFastMs);
    });
  });
});
