/**
 * SP-10: Circuit Breaker + Inngest Retry Interaction
 * @spike SP-10
 * @frd FR-CORE-MCP-002, FR-CORE-MCP-003
 * @add ADD §5.2 (MCP Resilience)
 * @warnings S7-W2, S7-W13, S7-W23
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-10
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  /** optional filter — when provided, only errors passing this predicate count toward failures */
  shouldRecordFailure?: (error: unknown) => boolean;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
};

/**
 * Thrown when the circuit breaker is open and rejecting calls.
 * Contains `retryAfterMs` so callers (e.g. Inngest) can decide
 * whether to convert this into a NonRetriableError or schedule
 * a delayed retry. (S7-W2 fallback, S7-W23 retry budget)
 */
export class CircuitOpenError extends Error {
  /** milliseconds until the reset timeout expires */
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Circuit breaker is open. Retry after ${retryAfterMs}ms.`,
    );
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  getConfig(): Readonly<CircuitBreakerConfig> {
    return this.config;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * - **closed**: run fn; record success/failure.
   * - **open**: if resetTimeoutMs elapsed -> half-open probe; otherwise throw CircuitOpenError.
   * - **half-open**: run fn; success -> closed, failure -> open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    switch (this.state) {
      case 'closed':
        return this.executeClosed(fn);
      case 'open':
        return this.executeOpen(fn);
      case 'half-open':
        return this.executeHalfOpen(fn);
    }
  }

  /** Record a successful call — resets failures, transitions half-open to closed. */
  recordSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.halfOpenAttempts = 0;
    }
  }

  /** Record a failed call — increments failures, trips to open when threshold met. */
  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.lastFailureTime = Date.now();
    }
  }

  /** Manually reset the breaker to closed state (useful for testing). */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
  }

  // -- private helpers --

  private async executeClosed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (!this.config.shouldRecordFailure || this.config.shouldRecordFailure(err)) {
        this.recordFailure();
      }
      throw err;
    }
  }

  private async executeOpen<T>(fn: () => Promise<T>): Promise<T> {
    const elapsed = Date.now() - this.lastFailureTime;

    if (elapsed >= this.config.resetTimeoutMs) {
      // transition to half-open and attempt a probe
      this.state = 'half-open';
      this.halfOpenAttempts = 0;
      return this.executeHalfOpen(fn);
    }

    // still within reset window — reject immediately
    const retryAfterMs = this.config.resetTimeoutMs - elapsed;
    throw new CircuitOpenError(retryAfterMs);
  }

  private async executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    this.halfOpenAttempts += 1;

    // exceeded max half-open attempts — trip back to open
    if (this.halfOpenAttempts > this.config.halfOpenMaxAttempts) {
      this.state = 'open';
      this.lastFailureTime = Date.now();
      const retryAfterMs = this.config.resetTimeoutMs;
      throw new CircuitOpenError(retryAfterMs);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (!this.config.shouldRecordFailure || this.config.shouldRecordFailure(err)) {
        // half-open probe failed — trip back to open
        this.state = 'open';
        this.lastFailureTime = Date.now();
      }
      throw err;
    }
  }
}
