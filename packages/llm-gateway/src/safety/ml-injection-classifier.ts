/**
 * LLM3-02: ML injection classifier with rule-based fallback
 *
 * Wraps an ML model (via `ModelClient`) around the existing rule-based
 * `InjectionClassifier`. On ML success with a valid Zod shape within the
 * timeout, returns the ML verdict. On timeout, HTTP error, or Zod parse
 * failure, falls back to the rule-based verdict and emits a structured
 * warning via the injected logger. Gated behind `isEnabled()` — when the
 * feature flag is off, the model client is never called.
 *
 * Plan deviation (documented in S16_LLM3_03_MULTI_REVIEW follow-up):
 * the plan called this a "drop-in replacement for InjectionClassifier",
 * but the synchronous `InjectionClassifier.classify(): Result<...>`
 * contract is incompatible with HTTP-based inference. This module
 * introduces `AsyncInjectionClassifier` which returns `Promise<Result<...>>`
 * and ships an `asAsyncInjectionClassifier` adapter that wraps the sync
 * rule-based classifier as async. The gateway is updated to await.
 */

import { Result } from '@aptivo/types';
import { z } from 'zod';
import type { Domain, InjectionVerdict } from './safety-types.js';
import type { InjectionClassifier } from './injection-classifier.js';
import type { SafetyInferenceCounter } from './safety-inference-counter.js';

// ---------------------------------------------------------------------------
// async classifier — adapter-friendly shape
// ---------------------------------------------------------------------------

export interface AsyncInjectionClassifier {
  classify(prompt: string, domain: Domain): Promise<Result<InjectionVerdict, never>>;
}

/** wraps a synchronous rule-based classifier so it shares the async contract */
export function asAsyncInjectionClassifier(sync: InjectionClassifier): AsyncInjectionClassifier {
  return {
    async classify(prompt, domain) {
      return sync.classify(prompt, domain);
    },
  };
}

// ---------------------------------------------------------------------------
// model client contract
// ---------------------------------------------------------------------------

export const ModelVerdictSchema = z.object({
  verdict: z.enum(['allow', 'challenge', 'block']),
  confidence: z.number().min(0).max(1),
  category: z.string().optional(),
});

export type ModelVerdict = z.infer<typeof ModelVerdictSchema>;

export interface ModelClient {
  /** issues a prediction; throws on transport/HTTP errors */
  predict(prompt: string): Promise<ModelVerdict>;
}

// ---------------------------------------------------------------------------
// logger contract (minimal — packages must not import app-level loggers)
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// usage sink — the ML classifier records safety_inference spend
// ---------------------------------------------------------------------------

export interface SafetyInferenceRecord {
  // `string` rather than the safety `Domain` union so the record is
  // interchangeable with the usage-logger contract (which imports Domain
  // from providers/types — a stricter union). Structural match at the sink.
  domain: string;
  provider: string;
  model: string;
  costUsd: number;
  latencyMs: number;
}

export interface UsageSink {
  logSafetyInference(record: SafetyInferenceRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export interface MlClassifierDeps {
  modelClient: ModelClient;
  /** rule-based classifier used when ML is disabled / times out / errors */
  ruleBasedFallback: AsyncInjectionClassifier;
  /** feature-flag gate bound at composition time */
  isEnabled: () => boolean;
  /** injected logger — packages must not import app-level loggers directly */
  logger: Logger;
  /** override the predict timeout; default 500 ms */
  timeoutMs?: number;
  /** optional sink for recording safety-inference spend */
  usageSink?: UsageSink;
  /** provider identifier stamped on usage records; default 'replicate' */
  provider?: string;
  /** model identifier stamped on usage records; default 'unknown' */
  model?: string;
  /** flat per-call cost in USD; defaults to 0 until a pricing contract lands */
  costPerCallUsd?: number;
  /**
   * S17-B4: optional outcome counter feeding the SLO timeout-rate
   * evaluator. When provided, every classify() call records exactly
   * one outcome (`success` | `timeout` | `error`). The counter is
   * read by `MetricService.getMlClassifierTimeoutRate` to compute the
   * burn-rate signal. When unset, no counter wiring (used by tests
   * that don't care about the metric path).
   */
  metrics?: SafetyInferenceCounter;
}

const DEFAULT_TIMEOUT_MS = 500;

export function createMlInjectionClassifier(deps: MlClassifierDeps): AsyncInjectionClassifier {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const provider = deps.provider ?? 'replicate';
  const model = deps.model ?? 'unknown';
  const costPerCallUsd = deps.costPerCallUsd ?? 0;

  return {
    async classify(prompt, domain) {
      if (!deps.isEnabled()) {
        return deps.ruleBasedFallback.classify(prompt, domain);
      }

      const start = Date.now();
      try {
        const raw = await withTimeout(deps.modelClient.predict(prompt), timeoutMs);
        const parsed = ModelVerdictSchema.safeParse(raw);
        if (!parsed.success) {
          deps.logger.warn('ml_classifier_invalid_response', {
            cause: parsed.error.message,
            domain,
          });
          // S17-B4: invalid-response is an upstream contract break,
          // not a transport timeout. Counted as 'error' so the
          // timeout-rate metric stays focused on actual latency
          // regressions.
          deps.metrics?.record('error');
          return deps.ruleBasedFallback.classify(prompt, domain);
        }
        const latencyMs = Date.now() - start;
        // fire-and-forget usage logging so ML latency tracking doesn't
        // leak into the classifier's Result path. Failures here must
        // not flip a valid verdict into a fallback.
        if (deps.usageSink) {
          deps.usageSink
            .logSafetyInference({ domain, provider, model, costUsd: costPerCallUsd, latencyMs })
            .catch((cause) => deps.logger.warn('ml_classifier_usage_log_failed', { cause: stringify(cause) }));
        }
        const verdict: InjectionVerdict = {
          verdict: parsed.data.verdict,
          score: parsed.data.confidence,
          matchedPatterns: [`ml:${parsed.data.category ?? 'unknown'}`],
          domain,
        };
        deps.metrics?.record('success');
        return Result.ok(verdict);
      } catch (err) {
        if (isTimeout(err)) {
          deps.logger.warn('ml_classifier_timeout', { timeoutMs, domain });
          deps.metrics?.record('timeout');
        } else {
          deps.logger.warn('ml_classifier_error', { cause: stringify(err), domain });
          deps.metrics?.record('error');
        }
        return deps.ruleBasedFallback.classify(prompt, domain);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`timeout after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function isTimeout(err: unknown): boolean {
  return err instanceof TimeoutError;
}

function stringify(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
