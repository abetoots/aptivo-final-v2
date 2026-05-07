# S18-C1 Multi-Model Review — Cleanup Bundle (4 sub-threads)

**Task**: S18-C1 (4 SP, WD1 + Senior — bundled per AD-S18-8 to amortize multi-review overhead)
**Goal**: Close 4 distinct S17 carry-forward threads at Phase 3 exit:
- C1a: verifyJwt consolidation
- C1b: UsageRecord consolidation into `@aptivo/types`
- C1c: Ticket escalation notification adapter wiring (replicates AD-S18-6)
- C1d: HITL approval-SLA real impl (replaces `() => []` stub)
**Date**: 2026-05-07 (Sprint 18 final delivery)
**Reviewers**: Codex MCP (thread `019e014c-b725-7551-bf3f-b7866e86777f`) + Gemini PAL clink — invoked via tool calls in this session
**Plan reference**: `docs/06-sprints/sprint-18-plan.md` §C1 (AD-S18-7 + AD-S18-8)

---

## Executive Summary

Single-round multi-model review per AD-S18-8 (cleanup bundle has lower architectural risk than feature work). **Codex GO** with one Medium follow-up; **Gemini GO** with operational notes. The Codex Medium was applied before commit. No round-2 needed.

C1a was scope-corrected after audit: the plan's stated "parallel verifyJwt impls" is not actually a duplication — `apps/ws-server/src/auth.ts` (generic HS256 connection-auth verifier) and `packages/hitl-gateway/src/tokens/jwt-manager.ts` (action-token with channel binding + JTI replay) are deliberately separate shapes. Both reviewers confirmed the scope correction. No code change for C1a.

C1b ships a clean type-only refactor closing the documented "DRIFT RISK" comments in both consumers.

C1c lands the AD-S18-6 dedupe-pattern replication that B3 established — proving the template is reusable for any future notification surface.

C1d replaces the long-standing `getRequests: () => []` stub with a real Drizzle join-based query. Codex caught a data-integrity edge case (orphan FK silently reclassified as `'single'`); the fix surfaces it as `'unknown'` for ops visibility.

**Final verdict: GO.** Sprint 18's final task thread closes 3 of 4 carry-forwards as planned + 1 honest scope correction with documented audit reasoning.

---

## Files Reviewed

```
packages/types/src/usage-record.ts                         (NEW)
packages/types/src/index.ts                                (MOD: barrel)
packages/llm-gateway/src/usage/usage-logger.ts             (MOD: re-export)
packages/database/src/adapters/llm-usage-log-store-drizzle.ts (MOD: re-export)
packages/database/package.json                             (MOD: +@aptivo/types)
packages/database/src/adapters/approval-sla-queries.ts     (NEW)
packages/database/src/adapters/index.ts                    (MOD: barrel)
packages/database/tests/approval-sla-queries.test.ts       (NEW, 7 tests)
apps/web/src/lib/case-tracking/ticket-escalation-notifier.ts (NEW)
apps/web/tests/case-tracking/ticket-escalation-notifier.test.ts (NEW, 9 tests)
apps/web/src/lib/services.ts                               (MOD: 2 lazy getter rewrites)
apps/ws-server/src/auth.ts                                 (READ ONLY, scope-correction reference)
packages/hitl-gateway/src/tokens/jwt-manager.ts            (READ ONLY, scope-correction reference)
```

---

## C1a — verifyJwt consolidation (scope-corrected)

### Audit finding

Plan stated: "ws-server has parallel verifyJwt impl at `apps/ws-server/src/auth.ts:37-74`. Web has its own. Move both to a new `packages/auth-jwt/` shared package."

Actual state of the codebase:

- **`apps/ws-server/src/auth.ts:37-74`** — `verifyWsToken` is a thin generic HS256 verifier returning `{ userId, roles, expMs }`. Used ONLY by ws-server connection auth. No replay protection (one-shot connection token; not action-bound).
- **`packages/hitl-gateway/src/tokens/jwt-manager.ts:139`** — action-token verifier. Channel-bound (per-channel claim binding). JTI-replay protected. Per-action token (approve/reject). Returns `HitlTokenPayload` with action/channel claims.

These are **fundamentally different shapes**:
- ws-server: generic claim shape, no replay, one-shot.
- HITL: action shape, JTI replay, per-channel binding.

Extracting a "shared" package would force an awkward common type that would either be:
- Too narrow (only `sub + roles + exp`) — leaves HITL's specialization in jwt-manager.ts anyway.
- Too wide (everything for both) — exposes HITL-specific concerns to ws-server.

There is no third callsite that argues for unification. Both reviewers confirmed.

### Resolution

**No code change.** Documented as scope correction in this multi-review doc per the S17-CT-3 pattern (where another stated chain-primitive was wrong-shape and we documented the deliberate scope adjustment). The "S17 task: extract" comment in `auth.ts` is also retained as historical context.

### Reviewer verdicts

- **Codex**: "scope correction is defensible. I found only the ws-server verifier and the HITL verifier. They are materially different. I did not find a third JWT verifier that argues for unification. The MCP scoped-token helper is a separate non-JWT HMAC format."
- **Gemini**: "the different claim requirements and replay-protection needs of HITL tokens vs. generic WS connection tokens justify separate implementations."

---

## C1b — UsageRecord consolidation into `@aptivo/types`

### Change

- **New `packages/types/src/usage-record.ts`** — canonical `UsageRecord` + `UsageStore` interfaces.
- `domain: string` (widened from `Domain` enum) — narrowing happens inside the gateway at the construction callsite; the store sees the widened shape so it doesn't need to import the gateway's enum.
- Both consumers re-export from `@aptivo/types`:
  - `packages/llm-gateway/src/usage/usage-logger.ts` (was the source of the original interface; now just re-exports + uses)
  - `packages/database/src/adapters/llm-usage-log-store-drizzle.ts` (was duplicated with explicit "DRIFT RISK / S17 task" comment)
- Removed the `domain: input.domain as Domain` cast in `usage-logger.logSafetyInference` since the canonical shape no longer requires narrowing.
- Added `@aptivo/types` workspace dep to `@aptivo/database` (was missing — discovered when the import failed to typecheck).

### Tests

Type-only refactor. No test changes needed:
- `@aptivo/llm-gateway`: 189/189 (unchanged)
- `@aptivo/database`: 217/217 → 218 (after C1d's orphan-FK test)

### Reviewer verdicts

- **Codex**: "the `domain: string` widening looks acceptable at current callsites. `CompletionRequest.domain` is still narrowed at the gateway boundary. `logSafetyInference` was already the cross-package boundary that wanted `string`. The tradeoff is just that future direct `UsageRecord` producers lose the domain union hint."
- **Gemini**: "Moving `UsageRecord` to `@aptivo/types` and adding the workspace dependency to `@aptivo/database` fixes the 'drift risk' documented in previous sprints while maintaining proper layering."

### Carry-forward (Gemini operational note)

> Ensure that downstream analytics or reporting tools that consume `llm_usage_logs` still validate this field if they expect specific values.

The gateway maintains type safety at the producer level (`request.domain` is still checked against the enum before logging). Downstream consumers that need the narrowed type can import `Domain` from `@aptivo/llm-gateway/providers/types` directly.

---

## C1c — Ticket escalation notification adapter

### Change

- **New `apps/web/src/lib/case-tracking/ticket-escalation-notifier.ts`** — bridges the escalation service's narrow `notifyTierChange(...)` contract onto the platform `@aptivo/notifications.NotificationAdapter` (`send(...)`). Replicates the S18-B3 AD-S18-6 SET-NX-EX dedupe pattern:
  - Dedupe key: `ticket:escalation:dedupe:<ticketId>:<fromTier>->-<toTier>` (1h TTL).
  - GLOBAL scope (web replicas converge on one notification per tier change).
  - **Claim-then-send + release-on-failure** — exact lesson from S18-B3 R1 where Codex caught lossy "burn-first" suppression. Failed sends release the slot so retries can succeed.
  - Fail-OPEN on Redis SET (notification > silence).
  - Missing recipient releases the slot so subsequent config can fire.
- **`apps/web/src/lib/services.ts:1771`** — `getTicketEscalationService` now passes `notifications: getTicketEscalationNotifier()`. Replaces the previous `notifications: undefined` placeholder.

### Tests

- **9 new tests** at `apps/web/tests/case-tracking/ticket-escalation-notifier.test.ts`:
  - dedupe-win calls platform adapter
  - dedupe key shape
  - "initial" prefix for null fromTier
  - dedupe-loss skips adapter
  - send failure releases slot (S18-B3 R1 lesson)
  - missing recipient releases slot
  - fail-OPEN on Redis SET error
  - null dedupeRedis disables dedupe (test/dev path)
  - distinct templates for auto-escalation vs reasoned

### Reviewer verdicts

- **Codex**: "The notifier matches the B3 pattern for normal `Result.err` failures: claim first, release on adapter failure, release on missing recipient, fail-open on Redis `set` failure. I do not see a new race window relative to B3. The only residual gap is generic to this style: if `platformAdapter.send()` were to reject instead of returning `Result.err`, release would be skipped. With the current notification adapters, that looks unlikely because they catch and wrap transport failures."
- **Gemini**: "Resilience pattern reuse: ticket-escalation-notifier.ts perfectly replicates the S18-B3 'claim-then-send + release-on-failure' pattern. This prevents the 'lossy suppression' bug where a transient network failure would silence notifications for the remainder of the 1h dedupe window."

### Codex Low — services.ts wiring degrades to silence when session-Redis is absent

> services.ts:1807 disables ticket escalation notifications entirely when session Redis is absent, even though the notifier itself explicitly supports `dedupeRedis: null`. That means the wiring currently degrades to silence, not "notify without dedupe".

**Decision**: keep as-is for production safety. Local-dev environments without session-Redis are also typically without a configured notification adapter and a designated recipient ID, so silently disabling is the right default. The notifier's `dedupeRedis: null` mode is reserved for tests + targeted dev configurations that explicitly want notifications without dedupe. Documented inline in the `getTicketEscalationNotifier` factory.

### Operational follow-up (Gemini)

> Ensure `TICKET_ESCALATION_RECIPIENT_ID` is added to the staging/production secrets as it replaces the previous `undefined` behavior.

Captured in the S18 delivery review as a deployment prerequisite.

---

## C1d — Approval-SLA real impl via join

### Change

- **New `packages/database/src/adapters/approval-sla-queries.ts`** — `createApprovalSlaQueries(db)` exposes `getRequestsForSla(filters)`:
  - LEFT JOIN `hitl_requests` ↔ `approval_policies` to derive `policyType` per AD-S18-7.
  - Decisions batched via a single `inArray` follow-up query keyed by request IDs (uniqueIndex on `(requestId, approverId)` makes this an index scan).
  - Filter clauses (status / from / to) forwarded to the requests query.
  - `policyType` resolution rules (post-Codex review):
    - `policy_id IS NULL` → `'single'` (legacy single-approver, pre-HITL2).
    - `policy_id` non-null AND join hit → use joined `approval_policies.type`.
    - `policy_id` non-null AND join missed (orphan FK / data drift) → `'unknown'` (NEW; was silently `'single'` pre-Codex). Surfaces to dashboards under a distinct bucket so ops can investigate integrity drift.
- **`apps/web/src/lib/services.ts:1118`** — `getApprovalSlaService` now wires `getRequests: queries.getRequestsForSla`. Replaces the previous `() => []` stub.

### Tests

- **7 new tests** at `packages/database/tests/approval-sla-queries.test.ts`:
  - empty short-circuit (no decisions query when no requests match)
  - join → policyType (sequential)
  - null `policy_id` falls back to `'single'`
  - orphan FK falls back to `'unknown'` (post-Codex addition)
  - batched decisions grouping
  - pending-no-decisions (empty array)
  - filter forwarding

### Reviewer verdicts

- **Codex Medium #1 (BEFORE COMMIT)**: bare `r.policyType ?? 'single'` masks orphan-FK drift. **Fixed**: explicit gate on `r.policyId === null` for the `'single'` fallback; orphan FK returns `'unknown'`. New test covers it.
- **Codex final**: "GO, with one follow-up I would strongly recommend before or immediately after merge: tighten the C1d fallback so only `null policy_id` maps to `'single'`." → applied pre-commit.
- **Gemini**: "Real Drizzle queries replace the stub. The JOIN-based derivation of `policyType` handles legacy records via the `'single'` fallback. Tests verify batching and filtering. Performance estimated highly performant for typical dashboard windows; pivot to denormalization (denormalizing `policyType` onto `hitl_requests`) should be prioritized in Sprint 19 if production volume grows significantly."

### S19 carry-forward

Per AD-S18-7 + Gemini operational note: if production EXPLAIN ANALYZE shows p99 > 100ms on this query, the explicit S19 fallback is "pivot to denormalised `policyType` column on hitl_requests + backfill" — its own task at +1 SP, not absorbed into C1d. C1d delivers the join-only impl; the column pivot is a separate story.

---

## Stats

| Suite | Pre-C1 | Post-C1 |
|---|---|---|
| `@aptivo/llm-gateway` | 189 | 189 |
| `@aptivo/database` | 211 | 218 (+7 new C1d tests) |
| `apps/web` (case-tracking) | baseline | +9 new C1c tests |
| Pre-existing s11 flake | 1 fail | 1 fail (unchanged) |

Typecheck: no new errors from C1; existing pre-existing residuals from B1 (CryptoPositionStore naming) remain — flagged in the sprint plan as out-of-scope.

---

## Final Verdict: GO (both reviewers, single-round bundled per AD-S18-8)

C1 closes 3 of 4 stated carry-forwards + 1 honest scope correction:

- **C1a**: scope-corrected (no actual duplication). Documented in this review.
- **C1b**: `UsageRecord` consolidated; "DRIFT RISK" comments removed; both packages share one type via `@aptivo/types`.
- **C1c**: Ticket escalation notifications replicate AD-S18-6 dedupe pattern from S18-B3. Pattern reusability proven.
- **C1d**: SLA stub replaced with real Drizzle join-based query; orphan-FK data drift surfaces as `'unknown'` (Codex pre-commit catch).

Sprint 18 task threads delivered: A1 + B1 + B2 + A2 + B3 + C1 = 6 of 8 planned committed (the original 8-thread breakdown had A2/A1/B1-3/C1a-d as 8 sub-threads; the bundled C1 counts as one delivery). All multi-model reviews passed two-round (or single-round bundled) sign-off.
