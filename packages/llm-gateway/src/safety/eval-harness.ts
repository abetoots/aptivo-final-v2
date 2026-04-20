/**
 * LLM3-03: Injection classifier eval harness
 *
 * measures injection-classifier accuracy against a labelled corpus.
 * Emits precision, recall, F1, confusion matrix, and a per-category
 * breakdown. Persistence to disk is a separate function so `runEval`
 * remains pure and fast to test.
 *
 * Classifier verdicts map to a binary ground truth:
 *   - `block` and `challenge`  → positive  (flagged as attack)
 *   - `allow`                  → negative  (considered benign)
 *
 * `challenge` is treated as positive because the eval measures safety
 * detection rate, not final action policy. A sample that legitimately
 * earns a challenge for a malicious actor is correctly detected.
 */

import { Result } from '@aptivo/types';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Domain } from './safety-types.js';
import type { InjectionClassifier } from './injection-classifier.js';

// ---------------------------------------------------------------------------
// corpus types
// ---------------------------------------------------------------------------

export type EvalCategory =
  | 'instruction_override'
  | 'role_play'
  | 'system_extraction'
  | 'context_manipulation'
  | 'benign';

export interface EvalSample {
  readonly id: string;
  readonly prompt: string;
  readonly expectedVerdict: 'allow' | 'block';
  readonly category: EvalCategory;
  readonly split: 'train' | 'holdout';
  /** adversarial boundary cases — hard for any classifier, tracked for analysis */
  readonly boundary?: boolean;
}

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface ConfusionMatrix {
  readonly tp: number;
  readonly fp: number;
  readonly tn: number;
  readonly fn: number;
}

export interface CategoryMetrics {
  readonly samples: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  /**
   * False positive rate = FP / (FP + TN). Meaningful for categories where
   * expected positives are rare (e.g. benign bucket where precision/recall
   * are structurally zero). 0 when no negatives present.
   */
  readonly fpr: number;
}

export interface EvalResult {
  totalSamples: number;
  confusionMatrix: ConfusionMatrix;
  precision: number;
  recall: number;
  f1: number;
  perCategory: Record<string, CategoryMetrics>;
  runAt: string;
  gitSha?: string;
  split: 'train' | 'holdout' | 'all';
  domain: Domain;
}

export interface EvalRunOptions {
  /** filter corpus by split; defaults to 'all' */
  split?: 'train' | 'holdout' | 'all';
  /** domain passed to classifier for threshold selection; defaults to 'core' */
  domain?: Domain;
  /** optional git SHA stamped into the result envelope for historical comparison */
  gitSha?: string;
}

export type EvalError = { readonly _tag: 'EmptyCorpus' };

// ---------------------------------------------------------------------------
// runEval
// ---------------------------------------------------------------------------

export function runEval(
  classifier: InjectionClassifier,
  corpus: readonly EvalSample[],
  opts: EvalRunOptions = {},
): Result<EvalResult, EvalError> {
  const split = opts.split ?? 'all';
  const domain = opts.domain ?? 'core';
  const filtered = split === 'all' ? corpus : corpus.filter((s) => s.split === split);
  if (filtered.length === 0) {
    return Result.err({ _tag: 'EmptyCorpus' });
  }

  const matrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const byCategory = new Map<string, ConfusionMatrix & { samples: number }>();
  let processedCount = 0;

  for (const sample of filtered) {
    const classification = classifier.classify(sample.prompt, domain);
    // classifier returns Result<InjectionVerdict, never> — never errs today,
    // but forward-safe in case the contract widens. Skipped samples are
    // excluded from both the matrix and the reported totalSamples so the
    // envelope is always self-consistent.
    if (!classification.ok) continue;
    processedCount += 1;
    const classifierSaid: 'positive' | 'negative' =
      classification.value.verdict === 'allow' ? 'negative' : 'positive';
    const expectedSaid: 'positive' | 'negative' =
      sample.expectedVerdict === 'allow' ? 'negative' : 'positive';

    const cell: keyof ConfusionMatrix =
      classifierSaid === 'positive' && expectedSaid === 'positive' ? 'tp'
      : classifierSaid === 'positive' && expectedSaid === 'negative' ? 'fp'
      : classifierSaid === 'negative' && expectedSaid === 'negative' ? 'tn'
      : 'fn';

    matrix[cell] += 1;

    // per-category tally (benign prompts contribute TN/FP only)
    const catKey = sample.category;
    const current = byCategory.get(catKey) ?? { tp: 0, fp: 0, tn: 0, fn: 0, samples: 0 };
    byCategory.set(catKey, { ...current, [cell]: current[cell] + 1, samples: current.samples + 1 });
  }

  const { precision, recall, f1 } = metrics(matrix);
  const perCategory: Record<string, CategoryMetrics> = {};
  for (const [cat, m] of byCategory) {
    const catMetrics = metrics(m);
    perCategory[cat] = {
      samples: m.samples,
      precision: catMetrics.precision,
      recall: catMetrics.recall,
      f1: catMetrics.f1,
      fpr: m.fp + m.tn === 0 ? 0 : m.fp / (m.fp + m.tn),
    };
  }

  return Result.ok({
    totalSamples: processedCount,
    confusionMatrix: matrix,
    precision,
    recall,
    f1,
    perCategory,
    runAt: new Date().toISOString(),
    gitSha: opts.gitSha,
    split,
    domain,
  });
}

// ---------------------------------------------------------------------------
// metrics with zero-denominator guards
// ---------------------------------------------------------------------------

function metrics(m: ConfusionMatrix): { precision: number; recall: number; f1: number } {
  const precision = m.tp + m.fp === 0 ? 0 : m.tp / (m.tp + m.fp);
  const recall = m.tp + m.fn === 0 ? 0 : m.tp / (m.tp + m.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

// ---------------------------------------------------------------------------
// persistence — separate from runEval so the runner stays pure
// ---------------------------------------------------------------------------

/**
 * Writes an eval result to <outputDir>/eval-<timestamp>-<suffix>.json and
 * returns the absolute path. Each run gets a unique filename so concurrent
 * CI runs cannot overwrite each other.
 *
 * Filename shape: `eval-<runAtSanitised>-<6charRandom>.json`. The timestamp
 * stem keeps filename-sort ≈ time-sort; the random suffix disambiguates
 * same-millisecond collisions.
 */
export function persistEvalResult(result: EvalResult, outputDir: string): string {
  const stamp = result.runAt.replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);
  const file = join(outputDir, `eval-${stamp}-${suffix}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  return file;
}
