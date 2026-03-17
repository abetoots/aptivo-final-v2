# Sprint 12 Batch 1 — Multi-Model Review

**Date**: 2026-03-17
**Reviewers**: Claude Opus 4.6 (Lead), Codex/GPT (via Codex MCP)
**Scope**: S12-00 (Carry-Overs), DEP-12-01 (Pool Config), LLM2-01 (Injection Classifier)
**Verdict**: 0 P1 fixes, 2 P2 fixes, 2 planned/accepted items

---

## Findings

### F-1: Injection Classifier Not Wired into Gateway [PLANNED — LLM2-02]

**Codex**: High — classifier exists but gateway doesn't call it.
**Claude**: By design. Sprint plan says LLM2-01 builds the classifier, LLM2-02 integrates it into the gateway pipeline. This is the next batch.

### F-2: F-4 Store findByName Missing try/catch [P2]

**Codex**: High — `approval-policy-store.ts:findByName()` still throws on DB errors.
**Claude**: Valid. The workflow fallback catches the exception, but the AC explicitly says the store should fail-open. Quick fix.

**Verdict — P2 FIX**: Add try/catch to `findByName` in the store.

### F-3: Pool Config Driver Enforcement [ACCEPTED]

**Codex**: Medium — same as Sprint 10 finding.
**Claude**: Config is forwarded to `drizzle()`. Runtime enforcement depends on driver. Accepted.

### F-4: Unicode Bypass (Zero-Width Chars) [P2]

**Codex**: Medium — zero-width characters and homoglyphs can bypass patterns.
**Claude**: Valid for zero-width chars. Homoglyphs require ML (Phase 3).

**Verdict — P2 FIX**: Strip zero-width characters in normalization step.

---

## Actionable

| # | Finding | Action |
|---|---------|--------|
| 1 | F-2 | Add try/catch to `approval-policy-store.ts:findByName` |
| 2 | F-4 | Strip zero-width chars (`\u200B-\u200F`, `\uFEFF`) in classifier normalization |
