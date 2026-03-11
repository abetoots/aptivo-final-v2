/**
 * @testcase SP-07-PERF-001 through SP-07-PERF-018
 * @requirements FR-CORE-WFE-008
 * @warnings S5-W6, S5-W8, S5-W12
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-07
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { inngest } from '../src/inngest-client.js';
import {
  SP_07_CONFIG,
  ConcurrencyTracker,
  ThroughputMeter,
  BackpressureSimulator,
  measureConcurrentExecution,
  measureMemoryUnderLoad,
} from '../src/sp-07-durability-scale.js';

// ---------------------------------------------------------------------------
// helper: create a minimal inngest function for testing
// ---------------------------------------------------------------------------

const createTestFn = (id: string, stepCount = 1) =>
  inngest.createFunction(
    { id, retries: 0 },
    { event: 'spike/sp01.timeout-test' },
    async ({ step }) => {
      const results: Record<string, boolean> = {};
      for (let i = 0; i < stepCount; i++) {
        const r = await step.run(`step-${i}`, () => ({ done: true }));
        results[`step-${i}`] = r.done;
      }
      return { completed: true, steps: stepCount, results };
    },
  );

// fresh engine per test to avoid mock handler cache contamination
const engineFor = (fn: any) => new InngestTestEngine({ function: fn });

// ---------------------------------------------------------------------------
// SP-07-PERF-001: spike configuration
// ---------------------------------------------------------------------------

describe('SP-07: Durability & Scale', () => {
  it('has correct spike configuration', () => {
    expect(SP_07_CONFIG.name).toBe('SP-07: Durability & Scale');
    expect(SP_07_CONFIG.risk).toBe('HIGH');
    expect(SP_07_CONFIG.validations).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-002 through 005: ConcurrencyTracker
  // -------------------------------------------------------------------------

  describe('ConcurrencyTracker', () => {
    let tracker: ConcurrencyTracker;

    beforeEach(() => {
      tracker = new ConcurrencyTracker();
    });

    it('starts with zero active and zero completed', () => {
      expect(tracker.getActive()).toBe(0);
      expect(tracker.getCompleted()).toBe(0);
      expect(tracker.getPeakConcurrent()).toBe(0);
    });

    it('tracks active workflows after start()', () => {
      tracker.start('wf-1');
      tracker.start('wf-2');
      expect(tracker.getActive()).toBe(2);
    });

    it('decrements active and increments completed on complete()', () => {
      tracker.start('wf-1');
      tracker.start('wf-2');
      tracker.complete('wf-1');
      expect(tracker.getActive()).toBe(1);
      expect(tracker.getCompleted()).toBe(1);
    });

    it('records peak concurrent count correctly', () => {
      // simulate overlapping workflows
      tracker.start('wf-1');
      tracker.start('wf-2');
      tracker.start('wf-3'); // peak = 3
      tracker.complete('wf-1');
      tracker.complete('wf-2');
      tracker.start('wf-4'); // active = 2, peak stays at 3
      expect(tracker.getPeakConcurrent()).toBe(3);
      expect(tracker.getActive()).toBe(2);
      expect(tracker.getCompleted()).toBe(2);
    });

    it('ignores complete() for unknown workflow ids', () => {
      tracker.start('wf-1');
      tracker.complete('wf-unknown');
      expect(tracker.getActive()).toBe(1);
      expect(tracker.getCompleted()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-006 through 009: ThroughputMeter
  // -------------------------------------------------------------------------

  describe('ThroughputMeter', () => {
    let meter: ThroughputMeter;

    beforeEach(() => {
      meter = new ThroughputMeter();
    });

    it('starts with zero total steps and zero avg duration', () => {
      expect(meter.getTotalSteps()).toBe(0);
      expect(meter.getAvgDurationMs()).toBe(0);
    });

    it('records steps and calculates total count', () => {
      meter.recordStep('step-a', 10);
      meter.recordStep('step-b', 20);
      meter.recordStep('step-c', 30);
      expect(meter.getTotalSteps()).toBe(3);
    });

    it('calculates average duration correctly', () => {
      meter.recordStep('step-a', 10);
      meter.recordStep('step-b', 20);
      meter.recordStep('step-c', 30);
      expect(meter.getAvgDurationMs()).toBe(20);
    });

    it('calculates steps per second as a positive number', () => {
      // record steps with small intervals between them
      for (let i = 0; i < 10; i++) {
        meter.recordStep(`step-${i}`, 1);
      }
      const sps = meter.getStepsPerSecond();
      expect(sps).toBeGreaterThan(0);
    });

    it('handles single step gracefully', () => {
      meter.recordStep('only-one', 5);
      expect(meter.getStepsPerSecond()).toBe(1);
      expect(meter.getAvgDurationMs()).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-010 through 013: BackpressureSimulator
  // -------------------------------------------------------------------------

  describe('BackpressureSimulator', () => {
    it('enqueues items within capacity', () => {
      const queue = new BackpressureSimulator<string>(3);
      const r1 = queue.enqueue('a');
      const r2 = queue.enqueue('b');
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(queue.getDepth()).toBe(2);
    });

    it('returns error when at capacity', () => {
      const queue = new BackpressureSimulator<string>(2);
      queue.enqueue('a');
      queue.enqueue('b');
      const overflow = queue.enqueue('c');
      expect(overflow.ok).toBe(false);
      if (!overflow.ok) {
        expect(overflow.error).toContain('capacity');
      }
      expect(queue.isAtCapacity()).toBe(true);
    });

    it('dequeues items in FIFO order', () => {
      const queue = new BackpressureSimulator<string>(5);
      queue.enqueue('first');
      queue.enqueue('second');
      const d1 = queue.dequeue();
      const d2 = queue.dequeue();
      expect(d1.ok).toBe(true);
      if (d1.ok) expect(d1.value).toBe('first');
      expect(d2.ok).toBe(true);
      if (d2.ok) expect(d2.value).toBe('second');
    });

    it('returns error when dequeuing empty queue', () => {
      const queue = new BackpressureSimulator<number>(5);
      const result = queue.dequeue();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('empty');
      }
    });

    it('reports capacity and depth accurately', () => {
      const queue = new BackpressureSimulator<number>(10);
      expect(queue.getCapacity()).toBe(10);
      expect(queue.getDepth()).toBe(0);
      expect(queue.isAtCapacity()).toBe(false);

      for (let i = 0; i < 10; i++) queue.enqueue(i);
      expect(queue.getDepth()).toBe(10);
      expect(queue.isAtCapacity()).toBe(true);
    });

    it('accepts new items after dequeue frees space', () => {
      const queue = new BackpressureSimulator<string>(2);
      queue.enqueue('a');
      queue.enqueue('b');
      expect(queue.isAtCapacity()).toBe(true);

      queue.dequeue();
      expect(queue.isAtCapacity()).toBe(false);
      const r = queue.enqueue('c');
      expect(r.ok).toBe(true);
      expect(queue.getDepth()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-014 through 015: concurrent execution measurement
  // -------------------------------------------------------------------------

  describe('concurrent execution measurement', () => {
    it('completes 5 concurrent workflows successfully', async () => {
      const fn = createTestFn('sp07-concurrent-5');
      const result = await measureConcurrentExecution(5, fn);

      expect(result.completedCount).toBe(5);
      expect(result.peakConcurrent).toBeGreaterThanOrEqual(1);
      expect(result.totalMs).toBeGreaterThan(0);
      expect(result.avgPerWorkflowMs).toBeGreaterThan(0);
    });

    it('completes 10 concurrent workflows and tracks peak', async () => {
      const fn = createTestFn('sp07-concurrent-10');
      const result = await measureConcurrentExecution(10, fn);

      expect(result.completedCount).toBe(10);
      expect(result.peakConcurrent).toBeGreaterThanOrEqual(1);
      // average per workflow should be reasonable (under 5s)
      expect(result.avgPerWorkflowMs).toBeLessThan(5_000);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-016: memory stability
  // -------------------------------------------------------------------------

  describe('memory usage under load', () => {
    it('shows no significant memory leak over iterations', async () => {
      const fn = createTestFn('sp07-memory-test');
      const report = await measureMemoryUnderLoad(20, fn);

      expect(report.iterations).toBe(20);
      expect(report.heapBefore).toBeGreaterThan(0);
      expect(report.heapAfter).toBeGreaterThan(0);
      // allow up to 50MB growth — gc behavior is non-deterministic,
      // but sustained growth beyond this suggests a leak
      expect(report.heapDeltaMb).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-017: step throughput under concurrent load
  // -------------------------------------------------------------------------

  describe('step throughput under concurrent load', () => {
    it('measures throughput across concurrent multi-step workflows', async () => {
      const fn = createTestFn('sp07-throughput', 3);
      const meter = new ThroughputMeter();
      const count = 5;

      const tasks = Array.from({ length: count }, async (_, i) => {
        const engine = engineFor(fn);
        const t0 = performance.now();
        await engine.execute();
        const durationMs = performance.now() - t0;
        // record 3 steps per workflow
        for (let s = 0; s < 3; s++) {
          meter.recordStep(`wf-${i}-step-${s}`, durationMs / 3);
        }
      });

      await Promise.all(tasks);

      expect(meter.getTotalSteps()).toBe(15); // 5 workflows * 3 steps
      expect(meter.getAvgDurationMs()).toBeGreaterThan(0);
      expect(meter.getStepsPerSecond()).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // SP-07-PERF-018: recovery after saturation
  // -------------------------------------------------------------------------

  describe('recovery after saturation', () => {
    it('queue recovers and processes after hitting capacity', () => {
      const queue = new BackpressureSimulator<string>(3);

      // fill to capacity
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      expect(queue.isAtCapacity()).toBe(true);

      // attempt overflow — should fail
      const overflow = queue.enqueue('d');
      expect(overflow.ok).toBe(false);

      // drain queue — simulates recovery
      const items: string[] = [];
      while (queue.getDepth() > 0) {
        const r = queue.dequeue();
        if (r.ok) items.push(r.value);
      }
      expect(items).toEqual(['a', 'b', 'c']);
      expect(queue.isAtCapacity()).toBe(false);

      // re-enqueue after recovery — should succeed
      const r = queue.enqueue('e');
      expect(r.ok).toBe(true);
      expect(queue.getDepth()).toBe(1);
    });
  });
});
