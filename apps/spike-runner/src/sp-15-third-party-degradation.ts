/**
 * SP-15: Third-Party Degradation Spike
 * @spike SP-15
 * @brd BO-CORE-015, BRD §6.16 (Build: Resilience)
 * @frd FR-CORE-RES-001 (Graceful degradation)
 * @add ADD §10 (Resilience), §10.1 (Degradation Modes)
 * @warnings S7-W23 (cascading failure), S7-W2 (MCP server trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-15
 */

// spike validation: verify system behavior when third-party services
// degrade — Inngest, Supabase, Novu, LLM providers

import { Result } from '@aptivo/types';

export const SP_15_CONFIG = {
  name: 'SP-15: Third-Party Degradation',
  risk: 'HIGH' as const,
  validations: [
    'Inngest unavailability handling',
    'Supabase connection loss behavior',
    'Novu delivery failure fallback',
    'LLM provider timeout handling',
    'MCP server crash recovery',
    'Cascading failure prevention',
  ],
} as const;

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export type DependencyStatus = 'healthy' | 'degraded' | 'unavailable';

export type DegradationPolicy = 'fail-closed' | 'fail-open' | 'fallback';

export interface DependencyConfig {
  name: string;
  policy: DegradationPolicy;
  timeoutMs: number;
  maxRetries: number;
  fallbackFn?: () => Promise<Result<unknown, Error>>;
}

// ---------------------------------------------------------------------------
// dependency monitor — tracks health of external dependencies
// ---------------------------------------------------------------------------

// threshold for transitioning from healthy → degraded
const DEGRADED_THRESHOLD = 3;
// threshold for transitioning from degraded → unavailable
const UNAVAILABLE_THRESHOLD = 5;

interface DependencyState {
  config: DependencyConfig;
  status: DependencyStatus;
  consecutiveFailures: number;
}

export class DependencyMonitor {
  private readonly dependencies = new Map<string, DependencyState>();

  /** registers a dependency for health tracking */
  register(config: DependencyConfig): void {
    this.dependencies.set(config.name, {
      config,
      status: 'healthy',
      consecutiveFailures: 0,
    });
  }

  /** records a successful interaction — resets failure counter */
  recordSuccess(name: string): void {
    const dep = this.dependencies.get(name);
    if (!dep) return;
    dep.consecutiveFailures = 0;
    dep.status = 'healthy';
  }

  /** records a failure and transitions status based on thresholds */
  recordFailure(name: string): void {
    const dep = this.dependencies.get(name);
    if (!dep) return;
    dep.consecutiveFailures += 1;

    if (dep.consecutiveFailures >= UNAVAILABLE_THRESHOLD) {
      dep.status = 'unavailable';
    } else if (dep.consecutiveFailures >= DEGRADED_THRESHOLD) {
      dep.status = 'degraded';
    }
  }

  /** returns the current status of a dependency */
  getStatus(name: string): DependencyStatus | undefined {
    return this.dependencies.get(name)?.status;
  }

  /** returns a snapshot of all dependency statuses */
  getAll(): Array<{ name: string; status: DependencyStatus }> {
    return [...this.dependencies.entries()].map(([name, state]) => ({
      name,
      status: state.status,
    }));
  }

  /** returns the full state for a named dependency (internal use by ResilientCaller) */
  getState(name: string): DependencyState | undefined {
    return this.dependencies.get(name);
  }
}

// ---------------------------------------------------------------------------
// error shape returned by ResilientCaller
// ---------------------------------------------------------------------------

export interface CallerError {
  reason: string;
  dependency: string;
}

// ---------------------------------------------------------------------------
// resilient caller — executes calls with degradation handling
// ---------------------------------------------------------------------------

export class ResilientCaller {
  constructor(private readonly monitor: DependencyMonitor) {}

  /**
   * Executes `fn` against the named dependency, respecting its degradation policy.
   *
   * - fail-closed: if dependency is unavailable, return error immediately
   * - fail-open:   if dependency is unavailable, return fallback/default value
   * - fallback:    if primary fn fails, try the fallback function
   */
  async call<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<Result<T, CallerError>> {
    const state = this.monitor.getState(name);
    if (!state) {
      return Result.err({ reason: 'unknown-dependency', dependency: name });
    }

    const { config, status } = state;

    // fail-closed: refuse to call when unavailable
    if (config.policy === 'fail-closed' && status === 'unavailable') {
      return Result.err({ reason: 'dependency-unavailable', dependency: name });
    }

    // fail-open: return cached/default when unavailable
    if (config.policy === 'fail-open' && status === 'unavailable') {
      if (config.fallbackFn) {
        const fallbackResult = await config.fallbackFn();
        if (fallbackResult.ok) {
          return Result.ok(fallbackResult.value as T);
        }
      }
      // no fallback available, return a distinguishable result
      return Result.ok(undefined as unknown as T);
    }

    // attempt the primary call with timeout
    try {
      const result = await this.withTimeout(fn, config.timeoutMs);
      this.monitor.recordSuccess(name);
      return Result.ok(result);
    } catch (primaryError) {
      this.monitor.recordFailure(name);

      // fallback policy: try fallback function on primary failure
      if (config.policy === 'fallback' && config.fallbackFn) {
        try {
          const fallbackResult = await config.fallbackFn();
          if (fallbackResult.ok) {
            return Result.ok(fallbackResult.value as T);
          }
          return Result.err({ reason: 'fallback-failed', dependency: name });
        } catch {
          return Result.err({ reason: 'fallback-failed', dependency: name });
        }
      }

      const reason =
        primaryError instanceof TimeoutSignal ? 'timeout' : 'call-failed';
      return Result.err({ reason, dependency: name });
    }
  }

  /** wraps a promise with a timeout */
  private withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutSignal(ms)), ms);
      fn()
        .then((v) => {
          clearTimeout(timer);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }
}

/** sentinel error used to distinguish timeouts from other failures */
class TimeoutSignal extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutSignal';
  }
}

// ---------------------------------------------------------------------------
// retry budget — prevents retry storms (S7-W5)
// ---------------------------------------------------------------------------

export class RetryBudget {
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private attempts = 0;

  constructor(maxRetries: number, backoffMs: number) {
    this.maxRetries = maxRetries;
    this.backoffMs = backoffMs;
  }

  /** returns true when all retry attempts have been consumed */
  isExhausted(): boolean {
    return this.attempts >= this.maxRetries;
  }

  /**
   * Retries `fn` with exponential backoff up to `maxRetries`.
   * Returns the first successful result, or an error with
   * reason 'retries-exhausted' when the budget is spent.
   */
  async attempt<T>(fn: () => Promise<T>): Promise<Result<T, CallerError>> {
    this.attempts = 0;

    while (this.attempts <= this.maxRetries) {
      try {
        const result = await fn();
        return Result.ok(result);
      } catch {
        this.attempts += 1;
        if (this.attempts > this.maxRetries) {
          return Result.err({ reason: 'retries-exhausted', dependency: 'retry-budget' });
        }
        // exponential backoff
        const delay = this.backoffMs * Math.pow(2, this.attempts - 1);
        await sleep(delay);
      }
    }

    // unreachable, but satisfies TS
    return Result.err({ reason: 'retries-exhausted', dependency: 'retry-budget' });
  }
}

/** utility sleep */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// rate limit simulator (S7-W15)
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class RateLimitSimulator {
  /** checks whether the given request count exceeds the rate limit */
  checkLimit(requestCount: number, maxPerMinute: number): RateLimitResult {
    if (requestCount <= maxPerMinute) {
      return { allowed: true };
    }
    // suggest retry after the window resets (60s from now, proportional)
    return { allowed: false, retryAfterMs: 60_000 };
  }
}

// ---------------------------------------------------------------------------
// cascade detector — detects cascading failures
// ---------------------------------------------------------------------------

// minimum number of simultaneously-failing dependencies to flag a cascade
const CASCADE_THRESHOLD = 2;
// time window in which failures must occur to be considered simultaneous
const CASCADE_WINDOW_MS = 5_000;

export class CascadeDetector {
  private readonly failures = new Map<string, number[]>();

  /** records a failure timestamp for a dependency */
  recordFailure(dependency: string): void {
    const timestamps = this.failures.get(dependency) ?? [];
    timestamps.push(Date.now());
    this.failures.set(dependency, timestamps);
  }

  /** returns true if multiple dependencies are failing simultaneously */
  isCascading(): boolean {
    return this.getFailingDependencies().length >= CASCADE_THRESHOLD;
  }

  /** returns the list of dependencies that have recent failures */
  getFailingDependencies(): string[] {
    const now = Date.now();
    const failing: string[] = [];

    for (const [name, timestamps] of this.failures) {
      const recent = timestamps.filter((t) => now - t < CASCADE_WINDOW_MS);
      if (recent.length > 0) {
        failing.push(name);
      }
    }

    return failing;
  }
}
