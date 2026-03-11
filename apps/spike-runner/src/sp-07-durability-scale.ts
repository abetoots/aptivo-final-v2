/**
 * SP-07: Durability & Scale Spike
 * @spike SP-07
 * @brd BO-CORE-007, BRD §6.8 (Build: Performance)
 * @frd FR-CORE-WFE-008 (Concurrent workflows)
 * @add ADD §3.4 (Scaling), §3.5 (Backpressure)
 * @warnings S5-W6 (Inngest free tier limits), S5-W8 (10K sleeping workflows), S5-W12 (throughput limits)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-07
 */

// spike validation: load test Inngest under concurrent workflow load,
// measure throughput, latency, and identify saturation points

import { Result } from '@aptivo/types';
import type { Result as ResultType } from '@aptivo/types';

export const SP_07_CONFIG = {
  name: 'SP-07: Durability & Scale',
  risk: 'HIGH' as const,
  validations: [
    'Concurrent workflow execution (10, 50, 100)',
    'Step throughput under load',
    'Queue depth monitoring',
    'Backpressure detection',
    'Memory usage under sustained load',
    'Recovery after saturation',
  ],
} as const;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** high-resolution timestamp in milliseconds */
function hrtMs(): number {
  const [s, ns] = process.hrtime();
  return s * 1_000 + ns / 1_000_000;
}

// ---------------------------------------------------------------------------
// ConcurrencyTracker — tracks concurrent workflow counts
// ---------------------------------------------------------------------------

/**
 * Tracks active and completed workflows to measure peak concurrency.
 * Used to validate S5-W8 (sleeping workflow limits).
 */
export class ConcurrencyTracker {
  private readonly active = new Set<string>();
  private peak = 0;
  private completed = 0;

  /** mark a workflow as started */
  start(workflowId: string): void {
    this.active.add(workflowId);
    if (this.active.size > this.peak) {
      this.peak = this.active.size;
    }
  }

  /** mark a workflow as completed */
  complete(workflowId: string): void {
    if (this.active.delete(workflowId)) {
      this.completed++;
    }
  }

  /** returns the count of currently active workflows */
  getActive(): number {
    return this.active.size;
  }

  /** returns the peak concurrent count observed */
  getPeakConcurrent(): number {
    return this.peak;
  }

  /** returns the total count of completed workflows */
  getCompleted(): number {
    return this.completed;
  }
}

// ---------------------------------------------------------------------------
// ThroughputMeter — measures step throughput
// ---------------------------------------------------------------------------

interface StepRecord {
  stepId: string;
  durationMs: number;
  recordedAt: number;
}

/**
 * Measures step execution throughput (steps/second) and average durations.
 * Used to validate S5-W12 (throughput limits).
 */
export class ThroughputMeter {
  private readonly steps: StepRecord[] = [];

  /** record a step execution with its duration */
  recordStep(stepId: string, durationMs: number): void {
    this.steps.push({ stepId, durationMs, recordedAt: hrtMs() });
  }

  /** calculates throughput in steps per second */
  getStepsPerSecond(): number {
    if (this.steps.length < 2) return this.steps.length;
    const first = this.steps[0]!.recordedAt;
    const last = this.steps[this.steps.length - 1]!.recordedAt;
    const elapsedSec = (last - first) / 1_000;
    if (elapsedSec <= 0) return this.steps.length;
    return this.steps.length / elapsedSec;
  }

  /** returns total number of steps recorded */
  getTotalSteps(): number {
    return this.steps.length;
  }

  /** returns average step duration in milliseconds */
  getAvgDurationMs(): number {
    if (this.steps.length === 0) return 0;
    const total = this.steps.reduce((acc, s) => acc + s.durationMs, 0);
    return total / this.steps.length;
  }
}

// ---------------------------------------------------------------------------
// BackpressureSimulator — simulates queue pressure
// ---------------------------------------------------------------------------

/**
 * Simulates a bounded queue to test backpressure detection.
 * Returns Result.err when at capacity (S5-W6 free tier limits).
 */
export class BackpressureSimulator<T> {
  private readonly queue: T[] = [];
  private readonly maxCapacity: number;

  constructor(capacity: number) {
    this.maxCapacity = capacity;
  }

  /** enqueue an item; returns Result.err if at capacity */
  enqueue(item: T): ResultType<void, string> {
    if (this.queue.length >= this.maxCapacity) {
      return Result.err(`Queue at capacity (${this.maxCapacity})`);
    }
    this.queue.push(item);
    return Result.ok(undefined);
  }

  /** dequeue the next item; returns Result.err if empty */
  dequeue(): ResultType<T, string> {
    const item = this.queue.shift();
    if (item === undefined) {
      return Result.err('Queue is empty');
    }
    return Result.ok(item);
  }

  /** returns current queue depth */
  getDepth(): number {
    return this.queue.length;
  }

  /** returns the maximum capacity */
  getCapacity(): number {
    return this.maxCapacity;
  }

  /** returns true when the queue is at capacity */
  isAtCapacity(): boolean {
    return this.queue.length >= this.maxCapacity;
  }
}

// ---------------------------------------------------------------------------
// concurrent execution measurement
// ---------------------------------------------------------------------------

export interface ConcurrentExecutionResult {
  totalMs: number;
  completedCount: number;
  peakConcurrent: number;
  avgPerWorkflowMs: number;
}

/**
 * Runs `count` InngestTestEngine executions concurrently via Promise.all.
 * Returns timing and concurrency stats.
 */
export async function measureConcurrentExecution(
  count: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inngest function type is complex
  fn: any,
): Promise<ConcurrentExecutionResult> {
  const { InngestTestEngine } = await import('@inngest/test');

  const tracker = new ConcurrencyTracker();
  const t0 = hrtMs();

  const tasks = Array.from({ length: count }, async (_, i) => {
    const id = `wf-${i}`;
    tracker.start(id);
    const engine = new InngestTestEngine({ function: fn });
    await engine.execute();
    tracker.complete(id);
  });

  await Promise.all(tasks);
  const totalMs = hrtMs() - t0;

  return {
    totalMs,
    completedCount: tracker.getCompleted(),
    peakConcurrent: tracker.getPeakConcurrent(),
    avgPerWorkflowMs: totalMs / count,
  };
}

// ---------------------------------------------------------------------------
// memory measurement
// ---------------------------------------------------------------------------

export interface MemoryReport {
  iterations: number;
  heapBefore: number;
  heapAfter: number;
  heapDeltaBytes: number;
  heapDeltaMb: number;
}

/**
 * Runs iterations of workflow execution and measures memory delta
 * using process.memoryUsage().heapUsed.
 */
export async function measureMemoryUnderLoad(
  iterations: number,
  fn: any,
): Promise<MemoryReport> {
  const { InngestTestEngine } = await import('@inngest/test');

  // force gc if available, take baseline
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const engine = new InngestTestEngine({ function: fn });
    await engine.execute();
  }

  if (global.gc) global.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaBytes = heapAfter - heapBefore;

  return {
    iterations,
    heapBefore,
    heapAfter,
    heapDeltaBytes,
    heapDeltaMb: heapDeltaBytes / (1024 * 1024),
  };
}

// -- export all spike functions for inngest serve --
export const sp07Functions = [] as const;
