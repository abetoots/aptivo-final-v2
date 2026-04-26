# Sprint 17 Task S17-WS-PUB — Multi-Model Review

**Date**: 2026-04-26
**Reviewers**: Claude Opus 4.7 (Lead), Codex MCP (GPT-5, thread `019dc8df-2082-7303-973f-d9f61b2a86ed`), Gemini via PAL clink (`gemini-3-flash-preview`, continuation `5797da5f-cd06-4e83-aee0-dd06c2a34060`).
**Subject**: S17-WS-PUB — Inngest → Redis publisher + ws-server polling subscriber. Pre-commit review.
**Outcome**: Round 1: NO-GO from both reviewers (2 critical findings, mostly overlapping). Round 2 after applied fixes: **unconditional GO** from both.

---

## Executive Summary

S17-WS-PUB closes Sprint-16 enablement gate #6 by wiring `apps/web` Inngest events to `apps/ws-server` via a Redis list. Five Inngest functions (workflow + HITL events) publish frozen-v1.0 EventFrame envelopes to `ws:events` via `LPUSH`; ws-server polls via `RPOP` (batched), validates via `EventFrameSchema.safeParse`, dedupes by `eventId` in a bounded ring, and feeds the existing in-process EventBridge.

**Why list-based**: Upstash Redis (the project's REST client) does not support persistent `SUBSCRIBE` connections. List + polling gives FIFO over plain HTTP. **Multi-instance horizontal scaling is broken by design** — list semantics are single-consumer per item. Documented as an S18 task.

Round 1 caught two real bugs both reviewers found independently: an ESM `require()` crash in ws-server bootstrap (Critical) and an `eventId` collision risk in the publisher's fallback (Critical/Medium). Both fixed pre-commit; Round 2 GO from both.

---

## Round 1 Findings

### Critical — both reviewers agreed (and Codex framed as NO-GO)

**`eventId` fallback collides intra-millisecond**
- `apps/web/src/lib/inngest/functions/ws-event-publisher.ts:138` (pre-fix)
- `${desc.event}:${Date.now()}` returns the same string for two distinct events emitted in the same millisecond. The subscriber's dedupe ring drops the second event silently.
- Risk: latent — Inngest assigns `event.id` (ULID) in production, so the fallback only triggers in edge cases. But the fallback is in the hot path with no runtime guarantee.

### Critical — Gemini caught (Codex flagged a related ergonomics concern)

**`require('@upstash/redis')` in an ESM file crashes ws-server on startup**
- `apps/ws-server/src/index.ts:42` (pre-fix)
- `apps/ws-server/package.json` declares `"type": "module"`. In plain ESM Node.js, `require` is not defined; the bootstrap throws `ReferenceError: require is not defined` the moment `WS_REDIS_URL` is set.
- Apps/web's identical pattern works because Next.js downlevels imports to CommonJS-compatible code. ws-server has no such bundler.
- Codex's framing: also wanted the optional dependency missing to surface a targeted error instead of `MODULE_NOT_FOUND`.

### Low (not applied — confirmed safe)

- **`inFlight = tick()` race in subscriber `stop()`** (Gemini): if a timer fires immediately before `stop()` clears it, a new tick could be scheduled. Codex independently traced through the lifecycle and confirmed it's not an issue: the next tick checks `stopped` at the top and returns early; any in-flight tick that already pulled items still publishes them (intended — no data loss). Documented this analysis instead of changing code.

### Confirmed positive (both reviewers)

- `Set`-based dedupe ring eviction is spec-correct (insertion order preserved by ECMAScript)
- `setTimeout(..., 0)` back-to-back drain is the right pattern for burst handling
- Schema validation via `EventFrameSchema.safeParse` before fan-out protects WS clients from malformed Redis data
- Thin Redis surface interfaces (`WsPublisherRedis`, `WsSubscriberRedis`) make mocking trivial
- Topic derivation `workflow/${parentWorkflowId}` is consistent with the existing orchestrator subscription pattern

---

## Round 2 — Applied Resolutions

### `eventId` collision (Critical)
Replaced fallback with `randomUUID()` from `node:crypto`:
```ts
const eventId = ((event as { id?: string }).id ?? randomUUID());
```
Inline comment cites the multi-review finding.

### ESM `require` crash (Critical)
Restructured `buildRedisSubscriber` as `async`. Bootstrap path wrapped in async `bootstrap()` with proper error handling:
```ts
const moduleName = '@upstash/redis';
const mod = (await import(moduleName)) as { Redis: ... };
```
Variable indirection bypasses TypeScript's static module-resolution check (the package is in `optionalDependencies` and may not be installed at typecheck time). The try/catch around the import emits a targeted operator message ("WS_REDIS_URL is set but @upstash/redis is not installed") on `MODULE_NOT_FOUND`, replacing the bare crash.

### Low (not applied)
`inFlight = tick()` race documented as safe per Codex's lifecycle trace. Both ticks check `stopped` flag; in-flight publishes complete to avoid data loss; new tick short-circuits. No code change.

---

## Round 2 GO Verdicts

### Codex
> Both findings are cleared. `randomUUID()` removes the only concrete correctness bug I called out... The async `import()` bootstrap change also clears the startup issue. Wrapping the optional `@upstash/redis` load in targeted error handling is the right fix for an ESM package with an optional dependency. **GO**.

### Gemini
> The fixes for the ESM `require` crash and `eventId` collision risk are correctly applied. Restructuring `buildRedisSubscriber` as async with dynamic `import()` resolves the runtime error, and `randomUUID()` ensures event uniqueness under high concurrency. **GO**.

---

## Final Diff Summary

8 files, ~480 lines, 4 new:

- `apps/web/src/lib/inngest/functions/ws-event-publisher.ts` (new) — 5 Inngest functions; `buildEnvelope` helper; thin `WsPublisherRedis` interface
- `apps/web/src/app/api/inngest/route.ts` — registers publisher functions when `getJobsRedis()` is configured; skips with `info` log otherwise
- `apps/web/tests/inngest/functions/ws-event-publisher.test.ts` (new) — 3 tests
- `apps/ws-server/src/redis-subscriber.ts` (new) — polling loop, dedupe ring, schema validation, lifecycle
- `apps/ws-server/src/index.ts` — async bootstrap with optional Redis subscriber wiring
- `apps/ws-server/package.json` — `@upstash/redis` added as optionalDependency
- `apps/ws-server/tests/redis-subscriber.test.ts` (new) — 8 tests
- `apps/ws-server/tests/publisher.integration.test.ts` (new) — 3 round-trip integration tests

## Test Results
- ws-server: 55/55 (+11 new)
- apps/web: 1830/1830 (+3 publisher tests)
- audit 67, database 174, llm-gateway 189 — unchanged
- Pre-existing Sprint 9/10 typecheck residuals unchanged

## Documented Limitations (carry-forward)

1. **Multi-instance ws-server fan-out is broken by design** — list semantics are single-consumer per item. Each ws-server instance polling the same list would see only its share of events. S18 task: replace with a real pub/sub backend (TCP Redis via ioredis, or a managed pub/sub service) or per-instance fan-out queues.
2. **Cross-CI Upstash transport coverage is intentionally absent**. The integration test stubs Redis with an in-memory queue. Real Upstash failure modes (HTTP timeouts, REST quirks, partial writes) only surface in staging. Not blocking — the contract under test is "publisher writes envelope, subscriber reads, bridge fans out", which is transport-independent.
3. **Auto-recovery for late Redis wiring**: if `getJobsRedis()` returns null at startup but Redis comes online later, the publisher functions are not registered and will not fire until the apps/web process restarts. Acceptable for env-driven boot config.

---

## Provenance

- **Codex via MCP thread `019dc8df-2082-7303-973f-d9f61b2a86ed`** (GPT-5, sandbox read-only, approval-policy never, cwd `/home/anon/aptivo-final-v2`). Round-1: ~700 words with 1 NO-GO + 1 medium operational concern + per-area verdicts. Round-2: explicit GO with documented residual risk.
- **Gemini via `mcp__pal__clink`** (continuation `5797da5f-cd06-4e83-aee0-dd06c2a34060`). Round-1: independently flagged the same ESM `require` crash (Critical) and `eventId` collision (Medium). Round-2: explicit GO.
- **Lead (Claude Opus 4.7)**: ran tests after each edit; verified typecheck clean post-fix; confirmed `inFlight` lifecycle independently before accepting Codex's analysis.
