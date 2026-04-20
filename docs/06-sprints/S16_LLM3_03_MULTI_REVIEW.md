# LLM3-03 Pre-Commit Review — Multi-Model

**Date**: 2026-04-20
**Reviewers**: Claude Opus 4.7 (Lead), Gemini via PAL clink (`gemini-3-flash-preview` — Pro tier still not reached). **Codex unavailable** — MCP returned HTTP 403 on both retries (likely auth/quota). Skill's fallback applied: Lead + one external reviewer is sufficient to proceed; this file is short-circuited accordingly.
**Subject**: LLM3-03 injection eval harness + 220-sample corpus + baseline doc prior to commit

---

## Executive Summary

Gemini approves with three minor recommendations; Lead verification agrees on all three and adds one minor item. No blockers. Fixes applied inline pre-commit. The corpus is independently judged high-quality (Gemini manually audited ~20% of samples and confirmed labels + split fairness).

---

## Consensus Findings (Gemini + Lead)

1. **Benign-category metrics report 0/0** for precision/recall/F1 because benign samples have `expectedVerdict: 'allow'` (so TP and FN are structurally zero). The number is technically correct but misleading when the per-category table is read. Gemini recommends tracking False Positive Rate (FPR = FP / (FP + TN)) for benign; Lead agrees and extends to make `fpr` part of every category's `CategoryMetrics` so the schema is uniform.
2. **`totalSamples` vs confusion-matrix sum** can drift if the classifier ever errors (it currently can't — returns `Result<_, never>` — but forward-safe): `runEval` uses `filtered.length` as `totalSamples`, while the matrix tallies only rows where `classification.ok`. Change to track a separate `processedCount` and assert they match, or report `processedCount` as `totalSamples`.
3. **Millisecond timestamp collisions** in `persistEvalResult`: the filename derives from `runAt` at ISO-millisecond resolution. Two runs in the same ms would collide and overwrite silently. Not a local-dev concern but real in CI parallel. Mitigation: append a short random suffix.

## Approved (no action)

- **`challenge → positive` binary mapping**: both reviewers approve. The harness measures detection rate, not final action policy; a challenge on a malicious prompt is correct detection.
- **Corpus quality**: Gemini manually audited ~20% and confirmed no mislabels; no trivial train/holdout overlap. Lead concurs.
- **Test coverage**: happy paths, edge cases, split filtering, persistence round-trip, confusion-matrix tallying, and corpus-composition assertions all present.

## Lead's Additional Finding

- **No test for the `domain` option propagating to the classifier call.** The corpus currently produces identical results across `core | crypto | hr` because no benign sample matches any pattern (so threshold differences don't bite). This is a corpus property, not a harness bug. But the harness has no explicit test that `opts.domain` is actually passed — a refactor could silently drop it. Add a minimal test that uses a mock classifier and asserts the `domain` arg is forwarded.

## Items Gemini Flagged That Lead Marks as "Nice-to-have, Not This Commit"

- Using `runAt` as the filename stem vs UUID: the random-suffix fix resolves the collision concern; swapping to a pure UUID loses the "sort by filename = sort by time" ergonomic. Keep ISO + random suffix.
- Making `EvalResult.runAt` and `confusionMatrix` `readonly`: the persistence test deliberately mutates `runAt` to produce deterministic filenames; tightening this requires a test refactor for marginal benefit.

## Actionable Recommendations (all applied pre-commit)

1. Add `fpr` to `CategoryMetrics`; compute it for every category (with zero-denom guard). Benign will now report a meaningful value.
2. Track `processedCount` inside `runEval`; set `totalSamples = processedCount` so the envelope is always self-consistent.
3. Append a random 6-character suffix to `persistEvalResult` filenames.
4. Add a harness test that asserts `opts.domain` is forwarded to the classifier via a mock.

## Provenance

- Gemini via `mcp__pal__clink` (routed to `gemini-3-flash-preview`).
- Codex via MCP — **unavailable** (two HTTP 403s with `cf-ray` tokens; likely token refresh required on the operator side). Flag in operator runbook if this recurs.
- Lead verification: `grep` scan of regex alphabet against corpus, spot-check of ~15 samples by eye, confirmation that the numbers in the baseline doc match the recorded output.
