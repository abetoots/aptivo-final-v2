# Sprint 12 Batch 2 — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: LLM2-02 (Content Filter), LLM2-03 (Rate Limits), OBS-01 (Burn-Rate Alerting)
**Verdict**: 0 P1 fixes, 3 P2 fixes, 2 accepted items

---

## Findings

### F-1: ContentPart[] Bypass in Safety Checks [P2]

**Codex**: Critical — multi-modal `ContentPart[]` message content coerced to empty string, bypassing filters.
**Claude**: Valid. The gateway coerces `content` to string for safety checks but providers process the original array. Fix: extract text from ContentPart[] before safety checking.

**Verdict — P2 FIX**: Add text extraction helper for `ContentPart[]` in safety checks.

### F-2: Rate Limiter Edge Cases [P2]

**Codex**: High — negative elapsed time (clock skew) and zero refill rate produce invalid values.
**Claude**: Valid edge cases. Quick guards.

**Verdict — P2 FIX**: Clamp `elapsed` to `Math.max(0, ...)` and guard `refillRate > 0`.

### F-3: Burn-Rate Double Normalization [P2]

**Codex**: High — `computeNormalizedBurnRate` inflates burn rates by multiplying by month/window ratio on top of already-normalized `burnRate`.
**Claude**: Valid. The `burnRate` from `computeErrorBudget` (consumed/totalBudget) IS already the normalized rate. Multiplying by month/window double-normalizes. The evaluator should compare `burnRate` directly against multiplier thresholds.

**Verdict — P2 FIX**: Remove `computeNormalizedBurnRate` from the evaluation path. Compare `fastBudget.burnRate` and `slowBudget.burnRate` directly against multiplier thresholds.

### F-4: Durable Limiter Not in Gateway Path [ACCEPTED]

**Codex**: High — `getDurableRateLimiter` exported but gateway uses `TokenBucket(store)`.
**Claude**: By design. The Redis store IS wired into the gateway's TokenBucket. The `createDurableRateLimiter` with per-user tiers is a standalone service for workflow-level rate limiting (different from the gateway's per-request bucket). The gateway limits total throughput; the durable limiter limits per-user quotas. They serve different purposes.

### F-5: Slow Window Same Snapshot [ACCEPTED]

**Codex**: Medium — SLO alert adapter passes same metrics to both windows.
**Claude**: The burn-rate evaluator correctly handles different windows. The SLO cron needs to provide windowed data separately — Sprint 13 scope.

---

## Actionable

| # | Finding | Action |
|---|---------|--------|
| 1 | F-1 | Extract text from ContentPart[] before safety checks |
| 2 | F-2 | Guard elapsed >= 0 and refillRate > 0 in durable limiter |
| 3 | F-3 | Remove double normalization — compare burnRate directly against thresholds |
