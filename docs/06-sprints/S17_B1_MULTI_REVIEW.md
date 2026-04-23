# Sprint 17 Task S17-B1 — Multi-Model Review

**Date**: 2026-04-23
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019db84b-7215-7191-9788-885e2c440bfc`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `71f3849d-577d-4eea-ba6d-80751f4d5b99`).
**Subject**: S17-B1 — merged actor / department / aggregate-key stream. Pre-commit review of 10-file diff (+204/-61 before fix, +218/-78 after).
**Outcome**: Two-round review. Round 1: NO-GO from both reviewers (4 distinct findings). Round 2 after applied fixes: **GO** from both (Codex conditional on accurate commit framing).

---

## Executive Summary

S17-B1 was originally written claiming closure of S16 enablement gates #2 (anomaly-gate aggregate-key alignment) and #3 (request→actor plumbing + departmentId stamping). Both reviewers independently caught that the implementation closes the **contract layer** (types, gateway pipeline, audit-store SQL contract, middleware factory, per-domain audit-scope mapping) but does NOT close those gates in production paths because:

1. The per-domain audit-scope mapping for `crypto` used phantom `resource_type` and `action` values that don't exist in the codebase's actual emitter vocabulary.
2. `AuditService.emit()` only writes `audit_logs.user_id` when `event.actor.type === 'user'` (audit-service.ts:61). All current workflow emitters use `actor.type: 'system'` because the LLM gateway is consumed by background Inngest steps, not direct HTTP routes. The `WHERE user_id = $actor` filter in the new aggregate query matches zero workflow-originated rows.
3. The `requireLlmContext` middleware was created but no production path consumes it. There is no `/api/llm/complete` HTTP endpoint — the gateway's only callers are workflow files in `apps/web/src/lib/workflows/*`, none of which stamp `request.actor`.

These are **architectural prerequisites** outside B1's scope as written. Resolution: keep B1 as a contract-layer commit with verified mapping values and explicit operational caveats. Production closure of Gates #2 and #3 carries forward to S18 (workflow → user actor propagation as part of Epic 5 Domain Workflows).

The phantom values (HIGH severity) were a real bug, fixed pre-commit. Everything else became documentation.

---

## Round 1 — NO-GO Findings

### Codex (GPT-5)

**BLOCKER** — `AuditService.emit()` only writes `user_id` when `actor.type === 'user'`
- `packages/audit/src/audit-service.ts:61`: `userId: event.actor.type === 'user' ? event.actor.id : null`
- All workflow emitters use `actor.type: 'system'`. Gate #2 query never matches workflow-originated rows.

**BLOCKER** — `requireLlmContext` middleware exists but is not wired into any production path
- `getLlmGateway()` in `apps/web/src/lib/services.ts:641-647` still binds `resolveActor: () => undefined`.
- Workflow callsites (`hr-candidate-flow.ts`, `crypto-paper-trade.ts`, `demo-workflow.ts`, `hr-contract-approval.ts`) call `gateway.complete(request)` without stamping `request.actor`.
- No `/api/llm/complete` HTTP route exists for the middleware to attach to.

**HIGH** — `DOMAIN_AUDIT_SCOPE.crypto` is phantom
- Used `['wallet', 'position', 'execution']` + `['wallet.read.bulk', 'position.read.bulk']`.
- Repo-wide search found no emitter producing those values. Real crypto audit emits `resource.type: 'trade-signal' | 'trade-execution' | 'security-report'` with actions like `crypto.signal.risk-rejected` (from `crypto-paper-trade.ts:170-171,411-412` and `crypto-security-scan.ts:215-216`).
- The crypto domain mapping silently re-introduces the original Gate #2 bug.

**HIGH** — HR mapping is correct in vocabulary but inert in practice
- `auditPiiReadBulk` / `auditPiiReadExport` middleware functions exist but no production callsite invokes them. HR list/export endpoints aren't wrapped with `withPiiReadAudit`. The mapping is correct, but it'll match zero rows until that instrumentation lands (Epic 5 / S18).

**MEDIUM** — `departmentId` fallback chain in `UsageLogger.logUsage` is dead code
- The gateway always passes `actor?.departmentId` into `logUsageSafe`, so `request.actor?.departmentId` is never reached. Harmless but cognitive load.

**NIT** — `aggregateAccessPattern` JSDoc says `resourceTypes` "must be non-empty" but the empty-array short-circuit makes that no longer true.

**NIT** — `ActorContext` immutability respected (no mutation found in gateway path).

### Gemini (flash-preview)

Independently flagged the same crypto phantom-values issue (HIGH) with a slightly different recommended fix (point at real `crypto-paper-trade.ts` values). Confirmed:
- Breaking change to `aggregateAccessPattern` contract is correctly contained (only `services.ts` + the test mock affected).
- Middleware department-lookup decision (single-owner via `departments.ownerUserId`) is well-documented.
- AC coverage: 10/11 ACs covered; the "alignment" AC technically met but realism failing for crypto.

**Verdict**: NO-GO until crypto scope aligned with actual emission.

---

## Round 2 — Applied Resolutions

### 1. Phantom crypto values — **fixed in code**
`apps/web/src/lib/services.ts` `DOMAIN_AUDIT_SCOPE.crypto` updated to verified emitters:
```ts
crypto: {
  resourceTypes: ['trade-signal', 'trade-execution', 'security-report'],
  actions: [
    'crypto.signal.risk-rejected',
    'crypto.trade.paper-executed',
    'crypto.security.scanned',
  ],
}
```
With provenance comment citing the workflow files where each value originates.

### 2. HR mapping inertness — **documented**
Inline comment on `DOMAIN_AUDIT_SCOPE` notes: HR vocabulary is correct (matches `pii-read-audit.ts` middleware) but no production callsites for `auditPiiReadBulk` / `auditPiiReadExport` exist yet. Tracked alongside Epic 5 HR onboarding (S18) when list/export endpoints land and get wrapped with `withPiiReadAudit`.

### 3. `actor.type='system'` BLOCKER — **documented as out-of-scope prerequisite**
New "OPERATIONAL CAVEAT" comment block at the `getAccessPattern` binding in `services.ts` explains the audit-service field contract, the workflow `actor.type: 'system'` reality, and the workflow→user actor propagation work needed to close Gate #2 in production. Marked as carry-forward to S18.

### 4. Middleware-not-wired BLOCKER — **documented**
The `resolveActor` binding comment in `services.ts` updated with explicit STATUS line: contract is in place, but no production caller stamps `request.actor` because workflow Inngest payloads don't carry initiating-user context. Workflow callsite stamping is its own task carried to S18.

### 5. Doc drift on `resourceTypes` empty-array — **fixed**
`packages/audit/src/types.ts` JSDoc updated: empty `resourceTypes` is documented as a valid signal (short-circuits the SQL query, returns zero-count pattern).

### 6. `departmentId` fallback chain — **left as-is**
Both reviewers agreed: dead code today, but cheap and safe to keep as a contract for direct `UsageLogger` callers that bypass the gateway. Removing it would force callers into a single happy-path.

---

## Round 2 — GO Verdicts

### Codex
> Defensible only if the commit/PR/sprint record is explicitly reframed to "contract-layer groundwork," not "closes Gate #2 / Gate #3." The code now looks internally consistent for that narrower scope: the crypto mapping is backed by real emitters, the empty-array behavior is documented correctly, and the comments accurately describe why production behavior is still a no-op. ... **GO, conditional on scope/name/docs being updated to stop claiming production closure of Gate #2/#3.**

### Gemini
> The implementation is now a defensible "Contract & Foundation" commit. ... While Gates #2 and #3 remain "inert" in production until workflow→user actor propagation lands, the machinery is correctly verified by the updated test suite. The extensive documentation of these limitations ensures that maintainers have full context. **GO**

---

## Reframed B1 Scope

S17-B1 ships:
- ✅ `ActorContext` type + `CompletionRequest.actor` field
- ✅ `GatewayDeps.resolveActor` widened to return `ActorContext | undefined`
- ✅ Gateway pipeline resolves actor once, threads `userId` to anomaly gate + `departmentId` to usage logger
- ✅ `UsageRecord.departmentId` field (gateway + database adapter mirror)
- ✅ `UsageLogger.logUsage` accepts and persists `departmentId`
- ✅ Drizzle adapter writes `departmentId` to `llm_usage_logs`
- ✅ `aggregateAccessPattern` widened from singular `resourceType: string` to `resourceTypes: readonly string[]`
- ✅ Per-domain `DOMAIN_AUDIT_SCOPE` mapping with **verified** emitter values
- ✅ `requireLlmContext` middleware factory + 3 unit tests
- ✅ `UsageLogger` tests covering `departmentId` persistence (3 new)
- ✅ All 181 llm-gateway + 67 audit + 170 database + 14 budget + 1806 apps/web tests pass

S17-B1 does NOT close in production:
- ❌ Gate #2 (anomaly-gate operational firing) — needs workflow→user actor propagation so audit emitters use `actor.type: 'user'` and the aggregate query matches non-zero rows
- ❌ Gate #3 (departmentId stamping) — needs workflow callsites in `apps/web/src/lib/workflows/*` to stamp `request.actor` (or a new HTTP `/api/llm/complete` route to use the middleware)
- ❌ HR PII bulk read instrumentation — needs `withPiiReadAudit` wrapped around HR list/export endpoints (Epic 5 / S18)

These three items are explicitly carry-forward to S18.

---

## Provenance

- **Codex via MCP thread `019db84b-7215-7191-9788-885e2c440bfc`** (GPT-5, sandbox read-only, approval-policy never, cwd `/home/anon/aptivo-final-v2`). Round-1 delivered ~700-word structured review with 7 distinct findings (2 BLOCKER, 2 HIGH, 1 MEDIUM, 2 NIT) and explicit file:line citations. Round-2 conditional GO.
- **Gemini via `mcp__pal__clink`** (continuation `71f3849d-577d-4eea-ba6d-80751f4d5b99`). Independently flagged the same crypto phantom-values issue (HIGH). Round-2 unconditional GO.
- **Lead (Claude Opus 4.7)**: verified each finding via repo grep before applying; verified emitter values against `crypto-paper-trade.ts`, `crypto-security-scan.ts`, `pii-read-audit.ts`, and `audit-service.ts`; ran full test suites after each fix (llm-gateway 181/181, audit 67/67, database 170/170, budget 14/14, apps/web 1806/1806).
