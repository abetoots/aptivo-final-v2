# FA3-01 Pre-Commit Review — Multi-Model

**Date**: 2026-04-21
**Reviewers**: Claude Opus 4.7 (Lead), Gemini via PAL clink, Codex MCP (GPT-5).
**Subject**: FA3-01 Department Budgeting + Admin Rate-Limiter + admin API prior to commit

---

## Executive Summary

Both reviewers found concrete defects; Codex's findings were especially precise and surfaced **two real data-integrity bugs** that Gemini didn't catch (missing FK on `llm_usage_logs.departmentId`, unstamped-row global-count leaking across departments). Gemini caught a **documentation/implementation mismatch** on the rate-limiter (called "sliding window" but implemented as fixed). Lead-verified all findings against source. Fixing inline pre-commit.

## Critical Findings (Codex, Lead-verified)

### 🚨 `llm_usage_logs.departmentId` had no FK to `departments`

**Claim**: the new nullable column was added but without `.references(() => departments.id)`. Once S17 stamping lands, a bad writer (or a bug) could stamp orphan department IDs; the adapter's filter on the raw column would count them anyway.

**Fix**: added the FK reference. S17 stamping code now has data-integrity enforcement at the DB layer.

### 🚨 `aggregateSpend` unstamped-count leaked across departments

**Claim**: the adapter's `unstampedRowCount` counted ALL unstamped rows in the time window globally — with no department scoping. So a department with 3 stamped rows + unrelated traffic from other departments would get `coverageLevel: 'partial'` because of completely unrelated rows. The store contract documented unstamped rows as "ones that would have qualified but lack a departmentId" but the implementation couldn't actually do that attribution — you can't look at an unstamped row and tell which department it should have belonged to.

**Fix**: dropped the global unstamped query entirely. Adapter now returns `unstampedRowCount: 0` always. The coverageLevel logic was simplified to a binary `'none' | 'full'` signal derived solely from this department's stamped-row count. Honest signal: "this department has stamped rows or doesn't."

## Consensus Finding (both reviewers)

### 🟡 `coverageLevel` semantics were inconsistent

**Claim** (both): The type doc + schema comments said "S16 always returns 'none' or 'partial'" but the code had a reachable `'full'` state, and a test asserted `'full'` in S16. Three-way internal inconsistency.

**Fix**: collapsed `coverageLevel` to binary (`'none' | 'full'`) after fixing the unstamped-attribution problem. Type doc, schema comment, service logic, and tests all align on the new two-state model.

## Findings (Codex)

### 🟡 `getBudget` conflated "department missing" with "budget not configured"

**Claim**: both paths returned `DepartmentNotFound`; the GET budget route then unconditionally rendered "department has no budget config" even for genuinely missing departments.

**Fix**: added `BudgetNotConfigured` error variant. `getBudget` and `checkBudget` now probe the department first, then the budget; emit distinct tags. Route distinguishes the two 404 types in its `detail` field + `type` URI.

## Findings (Gemini)

### 🟡 Rate-limiter doc/implementation mismatch

**Claim**: the file said "sliding window" but implemented fixed-window (window-aligned keys). Fixed windows allow up to 2x burst at boundaries; sliding windows don't.

**Fix**: updated the header comment to explicitly say "FIXED-WINDOW" and call out the burst-at-boundary tradeoff. If sliding is later required, the migration path is a Redis sorted-set — noted inline. Did not change behaviour; the implementation is fine, the doc was wrong.

### `remaining` semantics are pre-transaction (Gemini nit)

Gemini observed that `checkBudget` returns `remaining = limitUsd - currentSpend` (pre-transaction), not `limitUsd - currentSpend - amountUsd` (post-transaction). **Accepted as documented behaviour**; the JSDoc already says "remaining" without qualification. Renaming or changing semantics would be a breaking API change for zero real benefit — if a caller wants post-transaction, they can compute it themselves from the return.

### Soft-exceed has no hard ceiling (Gemini nit)

If `blockOnExceed: false`, a single misconfigured transaction could go 10x over. **Accepted as policy** — soft-exceed is explicitly a "warn, don't block" mode. Adding a hard ceiling would be a new product decision.

### INCR + EXPIRE atomicity (Gemini nit)

If the process crashes between INCR and EXPIRE, a key leaks without TTL. **Accepted as low risk** — TTL drift in admin writes is operationally tolerable. Real fix (SET NX EX, Lua script, or pipeline) tracked for S17 if it becomes a concern.

## Approved (both reviewers)

- Schema FKs + indexes (other than the missing one, now fixed).
- Factory+deps composition pattern matches platform convention.
- RBAC-before-rate-limit ordering correct (unauth users don't burn admin buckets; no route-existence leak).
- Fire-and-forget audit catch is consistent with existing codebase pattern.
- OpenAPI v1.2.0+ entries complete for all four new endpoints.
- Numeric precision safe — numeric(10,2) fits in JS Number.
- Next.js App Router `../..` import depth correct for `[id]/budget/route.ts`.

## Test Deltas

- Removed the now-unreachable `'partial'` coverageLevel test (coverageLevel is binary).
- Existing service tests all pass with new binary logic.
- 14 service tests + 7 rate-limit tests = **21 tests** post-fix (was 22 before the partial-test removal).

## Deferred to S17

- Department-ID stamping on LLM requests (the attribution plumbing that makes `coverageLevel: 'full'` meaningful in practice).
- FA3-02 budget notifications + HITL escalation (Path A deferred from S16).
- Sliding-window rate-limiter if burst-at-boundary becomes a real concern.
- Redis atomicity (INCR+EXPIRE → SET NX EX or Lua script) if TTL leaks become operationally visible.
- Soft-exceed hard ceiling (policy decision).
- Proper DB migration generation + reversibility test (requires live PG).

## Provenance

- Gemini via `mcp__pal__clink` (`gemini-3-flash-preview`).
- Codex via MCP thread `019dadd1-6dec-7ac1-a57f-8408bf49916f`.
- Lead verification: direct read of `llm-usage.ts` (FK gap), `department-budget-store-drizzle.ts:138-161` (unstamped-global-count leak), `department-budget-service.ts:138-141 + 197-205` (getBudget conflation + coverageLevel reachable 'full').
