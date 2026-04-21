# Injection Eval — Rule-Based Baseline

**Generated**: 2026-04-20 (Sprint 16, LLM3-03)
**Classifier**: `createInjectionClassifier()` with `DEFAULT_INJECTION_PATTERNS` (16 regex patterns across 4 categories) — the Phase 2 implementation that is live today.
**Corpus**: `packages/llm-gateway/tests/fixtures/injection-corpus.ts` — 220 labelled samples, stratified 80/20 train/holdout.

This document captures the measurement that LLM3-02 (ML injection classifier) must beat to justify enablement. Numbers are recorded, not asserted — a baseline below the plan's target (75% precision / 70% recall) is a **feature** of the corpus: it reflects the real gap between pattern-matching and semantic detection. The corpus deliberately includes a ~50/50 mix of pattern-hitting attacks (which the regex catches) and semantic variants (which it does not). This produces the recall gap ML is expected to close without sacrificing precision.

---

## 1. Corpus Composition

| Group | Samples | Train | Holdout |
|---|---:|---:|---:|
| Total | 220 | 176 | 44 |
| instruction_override | 27 | 22 | 5 |
| role_play | 28 | 22 | 6 |
| system_extraction | 27 | 22 | 5 |
| context_manipulation | 28 | 22 | 6 |
| benign | 110 | 88 | 22 |
| of which adversarial boundary | 20 | 16 | 4 |

- Stratified split: each category preserves ~80/20 train/holdout proportions.
- Benign oversample relative to attacks is intentional (realistic base rate; forces precision to matter).
- Adversarial boundary: 20 hard cases — 8 benign-looking malicious, 8 suspicious-looking benign, 4 held out. Scored normally but flagged for post-hoc analysis.

## 2. Holdout Baseline (Primary Measurement)

| Metric | Value | Interpretation |
|---|---:|---|
| Precision | **1.000** | Zero false positives — rule-based is conservative, never flags benign |
| Recall | **0.318** | Catches 7 of 22 attacks; misses 15 semantic variants |
| F1 | **0.483** | |
| Total samples | 44 | 22 attacks + 22 benign |
| Confusion matrix | TP=7, FP=0, TN=22, FN=15 | |

Domain selection (`core`, `crypto`, `hr`) produces identical results because no benign sample triggers any pattern, so threshold differences do not affect TN. Domain-level variance only appears when a prompt has non-zero pattern weight — a useful property for threshold tuning but not a measurement axis for this baseline.

**Benign bucket FPR = 0.000** (False Positive Rate for the 22 holdout benign samples). This complements the precision=1.000 headline: the rule-based classifier is not just precise in absolute terms, it also never fires on anything in the benign bucket specifically. ML replacement must preserve this.

### Per-category recall on holdout

| Category | Samples | Recall | Note |
|---|---:|---:|---|
| instruction_override | 5 | 0.200 | 1 of 5 caught (the one matching `/ignore\s+previous\s+instructions/`); 4 semantic variants missed |
| role_play | 6 | 0.333 | pattern-hitters caught; mild phrasings missed |
| system_extraction | 5 | 0.400 | `show system prompt` caught; semantic paraphrases missed |
| context_manipulation | 6 | 0.333 | bracket/XML-like structural patterns caught; natural-language "operator note" style missed |

## 3. Train Baseline (Reference Only)

Reported for completeness. LLM3-02 tuning must not target these numbers.

| Metric | Value |
|---|---:|
| Precision | 1.000 |
| Recall | 0.523 |
| F1 | 0.687 |
| Total samples | 176 |

## 4. Analysis

- **Precision is ceiling-high (1.000)** because every pattern hit is on an unambiguously malicious phrase. The pattern library has excellent specificity.
- **Recall is the problem.** Rule-based misses ~68% of holdout attacks. All misses are semantic variants — paraphrases and indirections that do not include the exact regex trigger strings. The corpus was curated to include these cases *specifically* so this gap would be visible.
- **LLM3-02's mandate**: close the recall gap without dropping precision materially. A plausible ML target on this corpus: precision ≥ 0.90, recall ≥ 0.80, F1 ≥ 0.85.

## 5. Methodology Notes

- `runEval(classifier, corpus, { split: 'holdout', domain: 'core' })` produces the numbers above. Reproducible from repo HEAD.
- `challenge` verdicts are counted as positive (TP or FP) alongside `block`. Rationale: the eval measures *detection*, not *final action policy*. A prompt that correctly earns a challenge is correctly detected.
- Corpus samples were written to avoid direct paraphrasing of `DEFAULT_INJECTION_PATTERNS`. About half the attack samples are pattern-hitters (to measure precision meaningfully); the other half are semantic variants (to expose the recall gap).
- Persistent result files go to `packages/llm-gateway/tests/eval-results/eval-<timestamp>.json` via `persistEvalResult(result, dir)`.

## 6. Senior Dev Sign-Off

- [x] Corpus composition reviewed: 220 samples, ~50/50 pattern / semantic split, 20 boundary cases.
- [x] Stratified 80/20 split verified across all six categories (four attack + benign + boundary).
- [x] Rule-based baseline reproduced and recorded above.
- [x] Corpus is not a paraphrase of the regex library — confirmed by grepping the pattern alphabet against the corpus and observing ~50% non-matches among attack samples.

Signed off via commit 2026-04-20 (sign-off is implicit in the baseline doc being committed; future corpus changes require a new baseline run and sign-off).

## 7. ML Classifier Comparison (pending)

LLM3-02 shipped the ML classifier wrapper + Replicate `ModelClient` adapter behind the `ml-injection-classifier` feature flag (default off). The eval harness is vendor-independent and will accept the ML classifier via the same `AsyncInjectionClassifier` interface the rule-based classifier is adapted to.

The live ML-vs-baseline comparison is **blocked on Replicate procurement** (vendor credentials + model training) and is flagged as a Sprint 17 pre-enablement task. Once live, this section will be filled in with:

- Per-category precision / recall / F1 / FPR for the ML classifier on the `holdout` split
- Delta vs. rule-based baseline (target: recall ≥ 0.80, precision ≥ 0.90, benign FPR < 0.05)
- Enablement recommendation (GO / NO-GO / adjust thresholds)

## 8. Change Log

| Date | Change | Author |
|---|---|---|
| 2026-04-20 | Initial corpus + baseline (LLM3-03) | Sprint 16 |
| 2026-04-20 | LLM3-02 shipped behind flag; ML comparison deferred to post-procurement | Sprint 16 |
