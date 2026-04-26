# Sprint 17 Task S17-CT-1 — Multi-Model Review

**Date**: 2026-04-26
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dc971-1fd7-7823-9b1f-b92ac53b0fd6`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `5c49d1f6-cc23-4ba3-9ce1-16072d5148d0`).
**Subject**: S17-CT-1 — case-tracking ticket CRUD API. Pre-commit review.
**Outcome**: Round 1: NO-GO from Codex (2 release-blocking findings + 1 medium); GO with 1 medium from Gemini. Round 2 after applied fixes: **unconditional GO** from both.

---

## Executive Summary

S17-CT-1 lays the Epic 4 foundation: a `tickets` table, Drizzle store, service layer with tagged-error contract + audit emission, and HTTP routes (`/api/tickets`, `/api/tickets/[id]`) with RFC 7807 problem+json. ~700 net new lines, 31 new tests, full apps/web suite at 1855/1855.

Round 1 Gemini gave GO with one medium (pagination race). Codex caught two real release blockers Gemini missed: missing RBAC seed (every request would 403 in production) and incomplete request validation (malformed UUIDs and non-integer pagination flowed straight into the store). Both fixed pre-commit; round 2 GO from both unconditional.

This pattern reinforces the workflow-preference memory: never collapse two reviewers' verdicts into one — disagreements catch what consensus misses.

---

## Round 1 Findings

### Codex — 2 NO-GO blockers + 1 MEDIUM

**NO-GO 1**: Routes require `platform/tickets.{create,read,update,delete}` permissions but no seed exists. Production fails closed with 403s on every ticket request until a separate seed PR lands.

**NO-GO 2**: Route validation is incomplete:
- `GET /api/tickets`: `ownerUserId` and `departmentId` query params are passed through without UUID validation.
- `limit`/`offset` accept non-integers (`Number.isFinite` accepts `1.5`, `1e3`).
- `GET/PATCH/DELETE /api/tickets/{id}`: path `:id` is not validated.
- Malformed UUIDs flow into store predicates → DB driver errors instead of clean RFC 7807 400s. Violates the "RFC 7807 on every error" contract.

**MEDIUM**: Workflow-definition gate doc-vs-impl drift. The service comment says "graph validity check"; composition root only calls `defService.findById()` (existence-only). Either invoke `validateGraph` or align the contract.

### Codex — 2 LOW (accepted as carry-forward)

- Composite `(status, created_at)` index would beat the current single-column indexes for the list hot path.
- OpenAPI documents only `200/404/409` for `/api/tickets/{id}`; runtime can also return `401/403/429`. PATCH 400 omits the `issues[]` shape.

### Gemini — 1 MEDIUM + 1 LOW

**MEDIUM**: Pagination race in `list()` — separate count + page queries can disagree if a row is inserted between them.

**LOW**: `softClose()` updates `closedAt = now()` on every call. Service-layer guard prevents redundant calls but the store itself isn't idempotent for the timestamp.

Gemini gave GO with mediums; Codex framed them as NO-GO. Lead deferred to Codex's framing — silent-403 in production is a release blocker.

---

## Round 2 — Applied Resolutions

### RBAC seed (Codex NO-GO 1) — applied
New `packages/database/src/seeds/case-tracking-seeds.ts` defining 4 ticket permissions across 3 roles:
- `platform-admin`: full CRUD
- `case-manager`: read + create + update (no delete)
- `case-viewer`: read-only

Idempotent via `onConflictDoNothing()`. Re-exported from `seeds/index.ts`.

### Request validation (Codex NO-GO 2) — applied
- `apps/web/src/app/api/tickets/route.ts`: strict UUID regex + `parsePositiveInt` (rejects decimals, scientific notation, leading whitespace via `/^\d+$/`). `ownerUserId`, `departmentId`, `limit`, `offset` now 400 with `https://aptivo.dev/errors/ticket-list-invalid` for malformed input.
- `apps/web/src/app/api/tickets/[id]/route.ts`: `rejectIfInvalidId` helper called from GET/PATCH/DELETE returns 400 `https://aptivo.dev/errors/ticket-id-invalid` before reaching the service.
- New regression test asserts the service is NOT called when `:id` is malformed.

### Workflow validation gate (Codex MEDIUM) — applied
`getTicketService` in `services.ts` now invokes `validateGraph(result.value.steps)` after the existence check. Returns `{ status: 'invalid', reason: graph.error._tag }` on cycle/dangling/etc.

### OpenAPI completeness (Codex LOW) — applied
Added 401/403/429 responses to all `/api/tickets/{id}` operations. PATCH 400 schema now includes the `issues[]` array shape.

### Composite index (Codex LOW) — accepted as CT-2 follow-up
Will pick the right composite when CT-2 SLA query patterns are in.

### Pagination race + softClose timestamp (Gemini) — accepted as documented limitations
Pagination race documented; CT-2 may bundle into a single transaction if needed. softClose is shielded by the service-layer guard for every production caller.

---

## Round 2 GO Verdicts

### Codex
> The prior NO-GOs are cleared. **GO**. The RBAC blocker is fixed by the new seed export... The malformed-input blocker is fixed in tickets/route.ts and [id]/route.ts, with the service short-circuit regression covered in ticket-routes.test.ts. The workflow gate now actually validates graph integrity in services.ts, and the /api/tickets/{id} OpenAPI responses now match runtime behavior. Residuals are the same non-blocking ones already accepted: composite index deferral and count/page race.

### Gemini
> The fixes—idempotent RBAC seeds, strict UUID/integer edge validation, and the validateGraph service gate—successfully resolve the critical omissions. The system now fails safe with RFC 7807 400s before reaching the store and ensures workflow integrity. **GO**.

---

## Final Diff Summary

13 files, ~1100 lines, 7 new files:

- `packages/database/src/schema/tickets.ts` (new) — table + status/priority enums, 4 indexes
- `packages/database/src/adapters/ticket-store-drizzle.ts` (new) — CRUD + softClose; no-op patch handling
- `packages/database/src/seeds/case-tracking-seeds.ts` (new) — RBAC seed
- `packages/database/src/{schema,adapters,seeds}/index.ts` — barrels
- `packages/database/tests/ticket-store.test.ts` (new) — 6 tests
- `packages/types/src/events/ticket.ts` (new) — Inngest event schemas
- `packages/types/src/index.ts` — re-export
- `apps/web/src/lib/case-tracking/ticket-service.ts` (new) — `Result<TicketRecord, TicketError>` contract
- `apps/web/src/app/api/tickets/route.ts` (new) — GET/POST + UUID/int validation
- `apps/web/src/app/api/tickets/[id]/route.ts` (new) — GET/PATCH/DELETE + `rejectIfInvalidId`
- `apps/web/src/lib/services.ts` — `getTicketStore` + `getTicketService` lazy getters; validateGraph wired
- `apps/web/openapi.yaml` — 1.2.0 → 1.2.1; full /api/tickets paths + Ticket/CreateTicket/UpdateTicket schemas
- `apps/web/tests/case-tracking/ticket-service.test.ts` (new) — 10 tests
- `apps/web/tests/case-tracking/ticket-routes.test.ts` (new) — 15 tests

## Test Results

- ticket-service 10/10, ticket-routes 15/15, ticket-store 6/6
- apps/web 1855/1855 (with `--no-file-parallelism`)
- audit 67, database 180 (+6), llm-gateway 189, ws-server 55 — unchanged
- Pre-existing Sprint 9/10 typecheck residuals unchanged

## Documented Limitations (carry-forward)

1. **Pagination race** — separate `count(*)` + page query. Acceptable for CT-1's scale; CT-2 may bundle into a single transaction.
2. **softClose timestamp non-idempotency** — store doesn't guard re-close; service layer's `TicketAlreadyClosed` is the production gate.
3. **No composite (status, created_at) index** — CT-2 SLA query patterns will inform it.
4. **Parallel-vitest flake** — full apps/web suite passes 1855/1855 with `--no-file-parallelism`; parallel runs see ~12 spurious failures unrelated to CT-1 (worker-isolation in module-mock state).

---

## Provenance

- **Codex via MCP thread `019dc971-1fd7-7823-9b1f-b92ac53b0fd6`** (GPT-5, sandbox read-only). Round-1: ~900 words, 2 NO-GO blockers + 1 MEDIUM + 2 LOW with explicit file:line citations. Round-2: GO at ~150 words.
- **Gemini via `mcp__pal__clink`** (continuation `5c49d1f6-cc23-4ba3-9ce1-16072d5148d0`). Round-1: GO with 1 MEDIUM (pagination race) + 1 LOW; missed Codex's two NO-GO blockers. Round-2: GO unconditional.
- **Lead (Claude Opus 4.7)**: deferred to Codex's NO-GO framing on the RBAC seed and request-validation gaps; both were silent-failure modes that Gemini's surface-level review rated as "well-implemented".
