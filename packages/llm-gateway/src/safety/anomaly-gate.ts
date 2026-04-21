/**
 * LLM3-04: Active anomaly blocking — decision gate
 *
 * Sits between the `@aptivo/audit` anomaly detector (detection-only) and
 * the LLM gateway pipeline. Produces actionable pass / throttle / block
 * decisions from a z-score, fails open on cold start or infra fault, and
 * is gated by a feature flag.
 *
 * Fail-open is deliberate: a locked gateway on day one (before baseline
 * accumulates) is worse than a delayed block on day three. The trade-off
 * is documented in the sprint plan AD and the S16 delivery review.
 */

import type { Result } from '@aptivo/types';
import type { AccessPattern, AnomalyResult, AnomalyError } from '@aptivo/audit';

// ---------------------------------------------------------------------------
// decision + thresholds
// ---------------------------------------------------------------------------

export interface GateDecision {
  readonly action: 'pass' | 'throttle' | 'block';
  readonly cooldownMs?: number;
  readonly reason?: string;
}

export interface GateThresholds {
  /** inclusive lower bound for the throttle action (0–1); default 0.7 */
  readonly throttleAt?: number;
  /** inclusive lower bound for the block action (0–1); default 0.9 */
  readonly blockAt?: number;
  /** cooldown emitted with a throttle decision; default 60s */
  readonly throttleCooldownMs?: number;
}

const DEFAULTS = {
  throttleAt: 0.7,
  blockAt: 0.9,
  throttleCooldownMs: 60_000,
} as const;

// ---------------------------------------------------------------------------
// injected logger — the gate emits structured warnings when failing open on
// infra fault so ops can detect systemic detector errors
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface AnomalyGateDeps {
  detector: {
    evaluate(pattern: AccessPattern): Promise<Result<AnomalyResult, AnomalyError>>;
  };
  /**
   * Resolves a recent access-pattern aggregate for (actor, resourceType).
   * Implemented by the composition root against the audit store; the gate
   * itself is oblivious to the data source.
   */
  getAccessPattern: (actor: string, resourceType: string) => Promise<AccessPattern>;
  isEnabled: () => boolean;
  logger: Logger;
  thresholds?: GateThresholds;
}

// ---------------------------------------------------------------------------
// public interface
// ---------------------------------------------------------------------------

export interface AnomalyGate {
  evaluate(actor: string, resourceType: string): Promise<GateDecision>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createAnomalyGate(deps: AnomalyGateDeps): AnomalyGate {
  const throttleAt = deps.thresholds?.throttleAt ?? DEFAULTS.throttleAt;
  const blockAt = deps.thresholds?.blockAt ?? DEFAULTS.blockAt;
  const throttleCooldownMs = deps.thresholds?.throttleCooldownMs ?? DEFAULTS.throttleCooldownMs;

  return {
    async evaluate(actor, resourceType) {
      // flag off → short-circuit; never query audit store or detector
      if (!deps.isEnabled()) {
        return { action: 'pass' };
      }

      try {
        const pattern = await deps.getAccessPattern(actor, resourceType);
        const evaluation = await deps.detector.evaluate(pattern);

        // detector error → fail open + log
        if (!evaluation.ok) {
          deps.logger.warn('anomaly_gate_error', {
            actor,
            resourceType,
            cause: stringify(evaluation.error.cause),
          });
          return { action: 'pass' };
        }

        const result = evaluation.value;

        // cold-start → fail open (baseline not yet accumulated)
        if (!result.isAnomaly && result.reason === 'insufficient baseline data') {
          return { action: 'pass' };
        }

        // detector rejected the anomaly → pass regardless of score
        if (!result.isAnomaly) {
          return { action: 'pass' };
        }

        // anomaly confirmed — map score to action
        if (result.score >= blockAt) {
          return { action: 'block', reason: result.reason };
        }
        if (result.score >= throttleAt) {
          return { action: 'throttle', cooldownMs: throttleCooldownMs, reason: result.reason };
        }
        return { action: 'pass' };
      } catch (cause) {
        // fetching the pattern failed — fail open, same as detector error
        deps.logger.warn('anomaly_gate_error', {
          actor,
          resourceType,
          cause: stringify(cause),
        });
        return { action: 'pass' };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function stringify(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
