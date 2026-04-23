/**
 * S17-B4: in-process counter for ML safety-inference outcomes.
 *
 * The ML injection classifier emits structured warns for each outcome
 * (`ml_classifier_timeout`, `ml_classifier_error`,
 * `ml_classifier_invalid_response`) but the platform has no log-query
 * path, so the SLO cron can't read those events to compute a rate.
 *
 * This counter is the minimum-viable metric source: a sliding-window
 * ring buffer that the classifier increments on each call and the
 * MetricService reads to compute the timeout rate. Single-process
 * only — sums across multiple `apps/web` instances are NOT correct
 * (each instance sees its own slice of traffic). For production
 * multi-instance, swap the in-memory implementation for a Redis
 * counter without changing the interface.
 */

// ---------------------------------------------------------------------------
// outcome kinds
// ---------------------------------------------------------------------------

export type SafetyInferenceOutcome = 'success' | 'timeout' | 'error';

// ---------------------------------------------------------------------------
// counter interface
// ---------------------------------------------------------------------------

export interface SafetyInferenceCounter {
  record(outcome: SafetyInferenceOutcome): void;
  /**
   * Fraction of calls in the trailing window that were timeouts.
   * Returns 0 when no calls were recorded in the window — caller
   * must distinguish "no traffic" (volumeInWindow == 0) from "no
   * timeouts" (rate == 0 with traffic) via `volumeInWindow()`.
   */
  timeoutRate(windowMs: number): number;
  /** Total recorded calls in the trailing window (any outcome). */
  volumeInWindow(windowMs: number): number;
  /** Test-only: drop all recorded events. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// in-memory implementation
// ---------------------------------------------------------------------------

interface RecordedEvent {
  readonly outcome: SafetyInferenceOutcome;
  readonly at: number;
}

export interface InMemorySafetyCounterOptions {
  /**
   * Maximum trailing window any caller will query. Events older than
   * this are pruned on every `record()` to keep memory bounded.
   * Default: 30 minutes — comfortably above the 5-minute SLO window.
   * Set higher if longer-window queries are needed.
   *
   * S17-B4 (post-review fix): a previous draft used a fixed `maxEvents`
   * count cap (10k), which evicted in-window events at >33 rps and
   * broke the rate calculation. Time-based retention is correct by
   * construction — every event inside `maxRetentionMs` is retained,
   * and `timeoutRate(windowMs <= maxRetentionMs)` always sees the
   * full window.
   */
  readonly maxRetentionMs?: number;
  /** Test-only override; defaults to `() => Date.now()`. */
  readonly now?: () => number;
}

const DEFAULT_MAX_RETENTION_MS = 30 * 60 * 1000;

export function createInMemorySafetyCounter(
  options: InMemorySafetyCounterOptions = {},
): SafetyInferenceCounter {
  const maxRetentionMs = options.maxRetentionMs ?? DEFAULT_MAX_RETENTION_MS;
  const now = options.now ?? (() => Date.now());
  const events: RecordedEvent[] = [];

  function pruneOlderThan(cutoff: number) {
    while (events.length > 0 && events[0]!.at < cutoff) {
      events.shift();
    }
  }

  return {
    record(outcome) {
      const at = now();
      events.push({ outcome, at });
      // S17-B4: prune by time, not count. Anything older than the
      // configured retention is gone; everything inside is kept.
      pruneOlderThan(at - maxRetentionMs);
    },

    timeoutRate(windowMs) {
      const cutoff = now() - windowMs;
      pruneOlderThan(cutoff);
      if (events.length === 0) return 0;
      let timeouts = 0;
      for (const e of events) {
        if (e.outcome === 'timeout') timeouts++;
      }
      return timeouts / events.length;
    },

    volumeInWindow(windowMs) {
      const cutoff = now() - windowMs;
      pruneOlderThan(cutoff);
      return events.length;
    },

    reset() {
      events.length = 0;
    },
  };
}
