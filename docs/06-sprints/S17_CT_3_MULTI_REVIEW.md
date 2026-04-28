# Sprint 17 Task S17-CT-3 — Multi-Model Review

**Date**: 2026-04-23
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dcdf0-5f9f-7512-a4c0-33e6a6851009`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `114d515c-3709-49d8-aaae-5b9599675bf0`).
**Subject**: S17-CT-3 — case-tracking ticket escalation. Pre-commit review.
**Outcome**: Round 1 — Codex NO-GO (3 release blockers); Gemini unconditional GO (missed all three). Round 2 after applied fixes — **GO from both**, with Gemini explicitly self-calibrating that Codex caught real bugs it missed.

---

## Executive Summary

S17-CT-3 ships per-priority ticket escalation: `escalationState` JSONB column on `tickets`, a `TicketEscalationService` with `advance / manualEscalate / getChainStatus`, the POST/GET `/api/tickets/:id/escalate` route, RBAC seed extension (`platform/tickets.escalate` for `platform-admin` + `case-manager`), composition-root wiring, and OpenAPI v1.2.2 bump. ~430 LOC + 31 new tests.

The plan AC said to "wrap `packages/hitl-gateway/src/policy/sequential-chain.ts`". The wrap was abandoned — that primitive models approve/reject decisions for HITL, the wrong shape for tier responsibility transfer. Decision documented in the service header and re-confirmed by both reviewers in Round 2.

Round 1 produced a stark reviewer disagreement that mirrored S17-CT-1. Codex returned three NO-GO findings: a state-machine off-by-one that prevented single-tier chains (`medium: ['L1']`) from ever escalating, a drift bug in `getChainStatus` that fabricated nonsense next-tier values when configs changed, and a read-modify-write race that could silently drop a history entry under concurrent escalates. Gemini gave unconditional GO, missing all three. Lead deferred to Codex's framing — those are correctness defects, not polish.

Round 2 cleared all three findings. Gemini's calibration in round 2 is captured verbatim in §"Reviewer Calibration" below — important signal for how we weight these reviewers in future sprints.

---

## Round 1 Findings

### Codex — NO-GO (3 release blockers)

**HIGH (NO-GO #1): First-advance off-by-one — single-tier chains can never escalate**
- `apps/web/src/lib/case-tracking/ticket-escalation.ts` (round-1 source).
- `resolveState` synthesized `currentTier=chain[0]` for never-escalated tickets. `performAdvance` then computed `idx=0` and jumped to `chain[idx+1]=chain[1]` on the *first* call.
- Consequence: a `medium`-priority ticket whose chain is `['L1']` could never escalate — first advance jumped past the end and returned `TicketAlreadyAtTopTier`. The state machine was incoherent: synthesized "start state" was indistinguishable from "first step taken".

**HIGH (NO-GO #2): `getChainStatus` returns nonsense on stored-tier drift**
- When the stored `currentTier` was no longer in the configured chain (e.g., config change retired `L99`), `chain.indexOf(state.currentTier)` returned `-1`, then `chain[idx+1] = chain[0]` was reported as the next tier.
- Result: clients would read `currentTier='L99', nextTier='L1', isAtTopTier=false` — internally contradictory and would mislead UI/automation into trying to "escalate" backwards.
- `advance()` already returned `TicketChainExhausted` on this path. The read endpoint silently disagreed.

**HIGH (NO-GO #3): Read-modify-write race silently drops history entries**
- `performAdvance` did `findById → compute newState → setEscalationState(id, newState)` with no version guard.
- Two concurrent escalation requests on the same ticket would both read the same `state`, both compute `history = [...state.history, newEntry]`, and the second writer would overwrite the first — losing one history entry without any error surface.
- High-throughput tickets (a P0 hitting two oncalls simultaneously) would silently corrupt the audit trail.

### Codex — secondary findings

- `manualEscalate` had no service-side max-length validation — only the route Zod cap. Direct service callers (Inngest steps, future workflow nodes) could overflow the JSONB history with a long paste.
- `parseEscalationState` accepted any `Array.isArray(history)` without validating each entry's shape. A corrupt JSONB row (e.g., from manual DB edits or a future migration bug) would smuggle malformed `EscalationHistoryEntry` values to callers indexing `history[i].toTier`.

### Codex — accepted positives

- DI pattern, Result-based error contract, RFC 7807 mapping in the route, fire-and-forget audit + notify, structured logger for notify failures.
- Tagged-error union extension on `EscalationError` (correctly inheriting `TicketError`).
- The `TicketEscalationConfigMissing` early return for `low` priority is the right shape.
- Soft-close guard before any escalation work.

### Gemini — unconditional GO

Gemini surface-reviewed: confirmed the architectural shape, the DI factory pattern, the RFC 7807 mapping, and the audit emission. Did not engage with the state machine semantics, the drift case, or the concurrency model. Returned a clean GO.

**Lead resolution**: Codex's three findings are correctness defects, not stylistic concerns. NO-GO. Apply fixes before commit.

---

## Round 2 — Applied Resolutions

### Fix 1 — First-advance enters chain[0] (no jump)

`resolveState` no longer synthesizes a starting tier:

```ts
function resolveState(ticket): Result<{ state: TicketEscalationState | null; chain: readonly string[] }, ...> {
  const chain = chainForPriority(ticket.priority, deps.chainsByPriority);
  if (chain.length === 0) return Result.err({ _tag: 'TicketEscalationConfigMissing', ... });
  const stored = parseEscalationState(ticket.escalationState);
  return Result.ok({ state: stored, chain });   // state may be null
}
```

`performAdvance` distinguishes "never escalated" from "at chain[0]":

```ts
if (state === null) {
  // First advance: enter chain[0]. No jump.
  fromTier = null;
  toTier = chain[0]!;
} else {
  const idx = chain.indexOf(state.currentTier);
  if (idx < 0) return Result.err({ _tag: 'TicketChainExhausted', ticketId });
  if (idx >= chain.length - 1) return Result.err({ _tag: 'TicketAlreadyAtTopTier', ticketId });
  fromTier = state.currentTier;
  toTier = chain[idx + 1]!;
}
```

Single-tier chains now escalate exactly once and then return `TicketAlreadyAtTopTier`. Tested in `advance() first call enters chain[0] (no jump) — single-tier chains can escalate exactly once`.

### Fix 2 — `getChainStatus` drift handling

Three paths, explicit:

```ts
if (state === null) {
  // never-escalated: synthesized read view that matches what advance() will record
  return Result.ok({ currentTier: chain[0], nextTier: chain[1] ?? null, history: [], isAtTopTier: chain.length <= 1, ... });
}
const idx = chain.indexOf(state.currentTier);
if (idx < 0) return Result.err({ _tag: 'TicketChainExhausted', ticketId });   // drift, same tag as advance()
// normal path: chain[idx+1] or null at top
```

No more fabricated next-tier on drift. Tested in `getChainStatus() returns TicketChainExhausted on stored-tier drift`.

### Fix 3 — Optimistic concurrency on escalation writes

New tagged error:
```ts
| { readonly _tag: 'TicketEscalationStale'; readonly ticketId: string }
```

Store contract grew an `expectedUpdatedAt` parameter:

```ts
setEscalationState(
  id: string,
  state: unknown,
  opts?: { status?: TicketStatus; expectedUpdatedAt?: Date },
): Promise<TicketRecord | null>;
```

Drizzle adapter implements the version guard:

```ts
const whereClause = opts?.expectedUpdatedAt
  ? and(eq(tickets.id, id), eq(tickets.updatedAt, opts.expectedUpdatedAt))
  : eq(tickets.id, id);
const [row] = await db.update(tickets).set(set).where(whereClause).returning();
return row ? rowToRecord(row) : null;   // null = not-found OR stale (caller distinguishes)
```

Service distinguishes via the prior `findById`:

```ts
const ticket = await deps.store.findById(ticketId);                    // exists
if (!ticket) return Result.err({ _tag: 'TicketNotFound', ... });
// ... compute newState ...
const updated = await deps.store.setEscalationState(ticketId, newState, {
  status: 'escalated',
  expectedUpdatedAt: ticket.updatedAt,
});
if (!updated) return Result.err({ _tag: 'TicketEscalationStale', ticketId });
```

Route maps `TicketEscalationStale` to **409 Conflict** (separate from 404 TicketNotFound). Test simulates a racing writer between findById and setEscalationState by monkey-patching findById to bump `updatedAt` right after returning the snapshot — asserts `r.error._tag === 'TicketEscalationStale'`.

### Minor (Codex secondary findings)

- `manualEscalate` now rejects reasons > 500 chars (mirrors route Zod). Constant `MAX_REASON_LENGTH = 500` at top of the service file. Tested.
- `parseEscalationState` validates each history entry via the `isHistoryEntry` type guard (checks `toTier`/`at`/`reason`/`escalatedBy.{id,type}`). Corrupt history → null (treated as fresh state). Tested.

### Plan deviation (HITL sequential-chain wrap)

The plan AC said to wrap `packages/hitl-gateway/src/policy/sequential-chain.ts:45-132`. Decision: **do not wrap**. Reasoning:

- That primitive models multi-actor approval (each step is a vote that approves/rejects/requests changes; terminal state is `approved` or `rejected`).
- Ticket escalation is responsibility transfer (each step changes the on-call tier; no terminal state — the chain is finite but every step is "in progress").
- Forcing the HITL primitive would have required hijacking the approval history to encode escalation reasons — a "false friend" abstraction that would block future per-tier policy.

Documented in the service header. Both reviewers explicitly endorsed the deviation in Round 2.

---

## Round 2 GO Verdicts

### Codex
> **GO**. The three prior NO-GO findings are cleared in the implementation I reviewed.
>
> The first-advance semantics are now coherent. `resolveState()` no longer invents `currentTier=chain[0]`, and `performAdvance()` correctly treats `state === null` as "enter chain[0]" with `fromTier=null` and a real history entry. That fixes the off-by-one and makes single-tier chains behave sensibly.
>
> `getChainStatus()` is also fixed. Never-escalated tickets now return the synthesized read view intentionally, and stored-tier drift returns `TicketChainExhausted` instead of fabricating a bogus next tier.
>
> The optimistic concurrency fix is in place and correctly wired end-to-end. The service passes `expectedUpdatedAt`, the store includes it in the `UPDATE ... WHERE`, and a miss maps to `TicketEscalationStale`, which the route exposes as `409`.
>
> Residual note only: the GET route tests are still lighter than the POST route tests, but that is not a release blocker given the service-level coverage you added.

### Gemini
> **GO**. The Round 2 fixes address all critical correctness and concurrency issues. The move to optimistic locking via `updatedAt` effectively defeats lost-update races. The state machine now correctly handles single-tier chains and initializes without "jumping" tiers. The logic for handling configuration drift is now consistent across read and write paths. The plan deviation from the original HITL-wrap requirement is correct, avoiding a poor abstraction.

---

## Reviewer Calibration

Round 1 had Codex returning three NO-GO findings while Gemini gave unconditional GO. Round 2 explicitly asked Gemini to self-calibrate. Verbatim:

> **Codex caught critical correctness bugs that I missed.**
> - The off-by-one was a subtle state-machine error: synthesizing a "start state" that is indistinguishable from a "first step" state is a classic trap. I prioritized the "shape" of the service over the edge-case of single-tier chains (like `medium`).
> - The race condition was a significant oversight. In a high-concurrency ticket system, JSONB read-modify-write without versioning is a "lost update" waiting to happen.
> - **Calibrated Verdict**: My round 1 review was too high-level. I relied on the tests passing without questioning if the tests covered concurrent access or config drift. These were real bugs, and their discovery justifies the round-2 delay.

This matches the S17-CT-1 pattern: Gemini surface-reviews the architecture, Codex digs into edge-case semantics. Lead should continue to defer to Codex on correctness disagreements and treat Gemini-only GOs with skepticism.

---

## Final Diff Summary

7 files, ~430 LOC + 31 new tests:

- `packages/database/src/schema/tickets.ts` — added `escalationState: jsonb('escalation_state')` (nullable)
- `packages/database/src/adapters/ticket-store-drizzle.ts` — `setEscalationState(id, state, { status?, expectedUpdatedAt? })`; rowToRecord exposes `escalationState: unknown`
- `packages/database/src/seeds/case-tracking-seeds.ts` — extended `CASE_TRACKING_PERMISSIONS` with `platform/tickets.escalate` for `platform-admin` and `case-manager`
- `apps/web/src/lib/case-tracking/ticket-escalation.ts` (new) — service with `advance / manualEscalate / getChainStatus`, `DEFAULT_ESCALATION_CHAINS`, `parseEscalationState` + `isHistoryEntry`, `MAX_REASON_LENGTH=500`, optimistic-locked write, all 3 round-2 fixes
- `apps/web/src/app/api/tickets/[id]/escalate/route.ts` (new) — POST `{reason}` body + GET chain status; RFC 7807 mapping for 7 EscalationError tags including the new `TicketEscalationStale` → 409
- `apps/web/src/lib/services.ts` — `getTicketEscalationService` lazy getter (audit bridged through getAuditService; safe-logger from appLog; notifications: undefined deferred to S18)
- `apps/web/openapi.yaml` — 1.2.1 → 1.2.2; new paths + `TicketEscalationChainStatus` and `TicketEscalationHistoryEntry` schemas
- `apps/web/tests/case-tracking/ticket-escalation.test.ts` (new) — 21 tests including post-Codex regression coverage (drift in getChainStatus, race/stale, malformed history, reason-length cap, single-tier-chain happy path)
- `apps/web/tests/case-tracking/ticket-escalate-route.test.ts` (new) — 10 tests including the 409 stale mapping
- Existing `ticket-service.test.ts`, `ticket-sla-service.test.ts`, `ticket-routes.test.ts` — fixtures gain `escalationState: null` and `setEscalationState: vi.fn()`

## Test Results
- ticket-escalation 21/21, ticket-escalate-route 10/10
- ticket-service 10/10, ticket-sla-service 11/11, ticket-routes 15/15
- apps/web full sweep 1902/1902 pass
- Pre-existing Sprint 9/10/15 typecheck residuals unchanged (hitl-store-drizzle, pool-config, webauthn test fixtures, NODE_ENV reassign in s9-id2-07)
- CT-3-touched files: 0 typecheck errors

## Documented Limitations / Carry-forward

1. **Notifications adapter not wired** — `getTicketEscalationService` passes `notifications: undefined`. Future S18 work plugs in the Novu-backed notifier. Service is fire-and-forget already so the wiring is purely additive.
2. **Per-tenant chain config still in code** — `DEFAULT_ESCALATION_CHAINS` is a const map; the `chainsByPriority` deps override exists for tests/per-tenant work but no admin UI ships in S17. Future iteration moves chains to a config table.
3. **Migration artifacts not committed** — repo convention; `db:generate` runs at deploy. Same convention as all prior schema changes.
4. **Corrupt-history recovery is silent** — Gemini's round-2 medium: `parseEscalationState` returning null on corrupt history will let a subsequent escalate "wipe" the bad row. Acceptable for now — only this service writes the column. Future hardening would log a critical error before falling back.
5. **GET route test coverage lighter than POST** — Codex's round-2 residual note. Not a blocker because the service-level `getChainStatus` tests cover all branches; the route is a thin RBAC + UUID guard wrapper.

---

## Provenance

- **Codex via MCP thread `019dcdf0-5f9f-7512-a4c0-33e6a6851009`** (GPT-5, sandbox read-only). Round-1: 3 HIGH (NO-GO) + 2 secondary findings with explicit code citations. Round-2: GO, with file:line cross-references to each fix.
- **Gemini via `mcp__pal__clink`** (continuation `114d515c-3709-49d8-aaae-5b9599675bf0`, `gemini-3-flash-preview`). Round-1: unconditional GO (missed all three blockers). Round-2: GO with explicit self-calibration ("Codex caught critical correctness bugs that I missed").
- **Lead (Claude Opus 4.7)**: deferred to Codex's NO-GO framing on all three findings; reinforces the standing `feedback_honest_reviewer_attribution` memory and the `feedback_multi_model_sign_off` workflow preference. The S17-CT-1 → S17-CT-3 pattern (Gemini surface-reviews; Codex catches release blockers in state-machine and concurrency code) is now a clear signal for how to weight these reviewers in future sprints.
