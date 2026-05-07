# S18-A2 Multi-Model Review — ws-server Multi-Instance via TCP Redis Streams

**Task**: S18-A2 (3 SP, Web Dev 2)
**Goal**: Replace S17 list+polling transport (single-consumer per item, broken under multi-instance) with TCP Redis Streams + per-instance consumer groups for true broadcast fan-out.
**Date**: 2026-04-29 → 2026-05-07 (Sprint 18 Day 1-3)
**Reviewers**: Codex MCP + Gemini PAL clink (both invoked via tool calls in this session)
**Reviewer ID** (Codex): thread `019e010e-080c-7442-a318-690223b77ea8`
**Plan reference**: `docs/06-sprints/sprint-18-plan.md` §A2 (AD-S18-2)
**Note on AD-S18-2 honesty**: production rollout is blocked on TCP Redis provisioning (DevOps calendar). Scaffold is fully tested in-memory; multi-model review covers design soundness + cutover semantics.

---

## Executive Summary

Two-round review with parallel Codex + Gemini reviewers across the slice 1-4 implementation. **Round 1**: NO-GO from both — 4 findings (2 HIGH, 2 MEDIUM) with strong consensus. **Round 1.5 (Codex only)**: caught a critical design flaw introduced by R1 fix #2 — global `ws:dedupe:<eventId>` key would have one of N ws-server instances suppress all the others' broadcasts. **Round 2**: GO from both after the per-instance dedupe scope fix landed.

The pattern is the same one S17 documented: Codex catches state-machine + concurrency design defects (Streams ack semantics, cross-instance suppression) that surface review misses; Gemini catches resource-management + operational defects (PEL leak, orphan cleanup); the two reviewers are complementary on broad-scope design audits.

**Final verdict: GO.** A2 is production-ready pending TCP Redis provisioning. All round-1 + round-2 findings are addressed, not just patched.

---

## Files Reviewed (10)

```
apps/web/src/app/api/inngest/route.ts            (publisher mode-switch + fail-fast)
apps/ws-server/src/index.ts                      (bootstrap, streams resources, dual-mode wiring)
apps/ws-server/src/redis-subscriber.ts           (S17 list subscriber + DedupeStore acceptance)
apps/ws-server/src/streams-subscriber.ts         (XREADGROUP loop, NOACK)
apps/ws-server/src/redis-dedupe-store.ts         (per-instance SET NX EX dedupe ring)
apps/ws-server/tests/redis-subscriber.test.ts    (dual-mode dedupe + ring-miss optimization)
apps/ws-server/tests/redis-dedupe-store.test.ts  (per-instance scope + cross-instance non-suppression)
apps/ws-server/tests/streams-subscriber.test.ts  (broadcast invariant + NOACK assertion)
packages/redis/src/{types,in-memory,tcp}.ts      (WsRedisClient interface + impls)
packages/redis/tests/in-memory.test.ts           (PEL semantics + MAXLEN cursor adjustment + NOGROUP)
docs/06-operations/01-runbook.md §17             (cutover sequence + per-instance dedupe semantics)
```

---

## Round 1 — NO-GO from both reviewers (independent)

### Consensus findings (both reviewers, ranked)

#### #1 [Critical / HIGH] Cross-transport dedupe broken in dual mode

- Both reviewers flagged: list subscriber (`apps/ws-server/src/redis-subscriber.ts`) used an in-process Set ring; streams subscriber used Redis SET NX EX. They didn't share state.
- In `WS_TRANSPORT_MODE=dual`, the same eventId arriving via BOTH transports would cause double fan-out: list transport claimed the in-process ring entry, streams transport hit the Redis SET (untouched by the list path), so both saw "first observation" and both called `bridge.publish`.
- Bootstrap comment claimed shared dedupe but no shared store existed. Runbook §17.3 cutover claim was false.

#### #2 [Critical / HIGH] Streams subscriber never acks → unbounded PEL

- Both reviewers flagged: `XREADGROUP` does NOT auto-ack. Without explicit `XACK` (or `NOACK` flag) the per-(stream, group) Pending Entry List grows unbounded for healthy groups.
- File comment claimed "auto-acked because we never call XACK explicitly" — wrong; that's exactly the bug.
- Production impact: linear Redis memory growth per event, not just per-orphaned-group. Cluster runs out of memory.
- In-memory stub didn't model PEL so tests couldn't catch it.

#### #3 [HIGH / Medium] In-memory stub too forgiving

- Gemini: stub doesn't model PEL, masks the leak.
- Codex: missing-group `xreadgroup` returns null (real Redis errors NOGROUP); MAXLEN trim doesn't shift per-group cursors so undelivered entries inside the trim window are silently skipped.

#### #4 [MEDIUM] Silent disable on misconfig (Codex)

- `WS_TRANSPORT_MODE=streams` without `WS_REDIS_TCP_URL` warned + skipped function registration. WS fan-out went dark in production instead of crashing the deploy.
- Same pattern at `apps/web/src/app/api/inngest/route.ts:108,130` and `apps/ws-server/src/index.ts:123,198`.

### Reviewer-unique findings

- **Gemini**: orphan group cleanup on ephemeral pods (Railway/k8s with dynamic names). Recommended optional auto-cleanup on graceful shutdown. *Resolution*: kept as runbook procedure for S18; add as opt-in flag if S19 hardening shows need. Decision: not blocking for S18 because group count is bounded by deployed instance count.
- **Codex**: noted simultaneous-deploy claim was overstated — 30-second skew is safe once dual-mode dedupe is fixed; unsafe case is skipping dual entirely. *Resolution*: documented in runbook §17.3.

### Round 1 verdicts (independent)

- **Codex** (thread `019e010e-080c-7442-a318-690223b77ea8`): NO-GO. 2 HIGH + 2 MEDIUM. "The patch closes 0 of the 4 round-1 issues from this draft."
- **Gemini**: NO-GO. 2 Critical + 1 High + 1 Medium. "Top fixes required: (1) Pass `DedupeStore` to `RedisSubscriber` in `dual` mode, (2) Use `NOACK` in `XREADGROUP` or call `XACK`, (3) Align `in-memory.ts` stub semantics with `ioredis` regarding ACKs."

---

## Round 1 fixes applied

### Fix 1 — NOACK semantics (closes #2 + part of #3)

- `packages/redis/src/types.ts`: added `noAck?: boolean` to `XReadGroupOptions` (default false; matches Redis default — explicit XACK still required when not set).
- `packages/redis/src/tcp.ts`: ioredis wrapper threads `NOACK` keyword into XREADGROUP arg list when `noAck:true`.
- `apps/ws-server/src/streams-subscriber.ts`: passes `noAck: true` per AD-S18-2 at-most-once design (ws-server's lost-during-crash trade-off matches the S17 list subscriber). Doc comment rewritten to remove the false "auto-acked" claim and call out the round-1 review.
- `packages/redis/src/in-memory.ts`: stub now models per-group PEL count via `_pendingEntryCount(stream, group)` test inspector. Without NOACK, deliveries increment; with NOACK, PEL stays empty.
- New tests: `tests/in-memory.test.ts` "without NOACK ... PEL accumulates" + "with NOACK skips PEL"; `tests/streams-subscriber.test.ts` "subscriber passes noAck:true to xreadgroup so the PEL stays empty".

**Why NOACK over explicit XACK**: AD-S18-2 commits to at-most-once delivery. Adding XACK would imply at-least-once recovery semantics (XAUTOCLAIM after consumer crash) which we explicitly don't want — same single-instance trade-off as S17.

### Fix 2 — cross-transport dedupe wired into list subscriber (closes #1)

- `apps/ws-server/src/redis-subscriber.ts`: optional `dedupeStore?: DedupeStore` in deps. tick() consults local in-process ring first (cheap fast path), then `await deps.dedupeStore.isFirstObservation(eventId)` only when ring misses.
- `apps/ws-server/src/index.ts`: refactored streams build into `buildStreamsResources(server, required)` returning `{ redis, dedupeStore, subscriber }`. Bootstrap builds streams resources FIRST in dual mode then passes the SAME `dedupeStore` to `buildRedisSubscriber(server, dedupeStore)` — both subscribers share state.
- New tests: `redis-subscriber.test.ts` "dual-mode shared dedupeStore suppresses cross-transport duplicates" + "dedupeStore is consulted only after the local ring misses".

### Fix 3 — fail-fast on misconfig (closes #4)

- `apps/web/src/app/api/inngest/route.ts`: `WS_TRANSPORT_MODE=streams|dual` without `WS_REDIS_TCP_URL` throws at module load (route handler chain crashes; deploy fails). `MODE=dual` without Upstash also throws (dual-write without both transports is meaningless). `MODE=list` without Upstash still soft-disables (test/local-dev path; documented in comment).
- `apps/ws-server/src/index.ts`: `buildStreamsResources(server, required=true)` throws on missing `WS_REDIS_TCP_URL` → bootstrap exits. Dual-mode list-missing fail-fast in bootstrap.

### Fix 4 — in-memory stub fidelity (closes #3 fully)

- `xreadgroup` throws `NOGROUP No such key '<stream>' or consumer group '<group>'` on missing stream OR missing group (was: returned null, masking group-creation bugs).
- MAXLEN trim shifts per-group cursors down by `trimCount` (clamp at -1) so undelivered entries past the trim window aren't skipped.
- Updated existing tests that depended on null-on-missing-group (xreadgroup unknown-group, xgroupDelete then read) to expect throw.

---

## Round 1.5 — Codex catches a CRITICAL bug introduced by Fix 2

After R1 fixes landed, Codex returned NO-GO with **one new HIGH finding** Gemini round-1 had also missed:

> The dedupe key is global per `eventId`, not per ws-server instance. `buildStreamsResources()` creates a `DedupeStore` backed by shared TCP Redis for every instance, and `createStreamsSubscriber()` consults it before every publish. That means instance A claims `ws:dedupe:<eventId>`, then instance B reads the same stream entry from its own consumer group and suppresses it as a duplicate, so only one instance fans out. **This violates the A2 broadcast invariant even in `streams` mode.**

The bug was masked by `streams-subscriber.test.ts:204` (the AD-S18-2 invariant test) which gave each subscriber its OWN in-memory Redis as the dedupe backing — so the production wiring (shared Redis, distinct instances) was never exercised.

This is the failure mode A2 was supposed to fix. Catching it pre-rollout is exactly what multi-model review is for.

### Round 2 fix — per-instance dedupe scope

- `apps/ws-server/src/redis-dedupe-store.ts`: `DedupeStoreOptions.instanceId: string` is now REQUIRED (factory throws on empty/whitespace). Key becomes `ws:dedupe:<instanceId>:<eventId>` instead of the global `ws:dedupe:<eventId>`. Each ws-server instance has its own dedupe keyspace; instances do not suppress each other.
- `apps/ws-server/src/index.ts:179-189`: `buildStreamsResources` passes `instanceId` to `createDedupeStore`. Same `instanceId` is the per-instance consumer group suffix and the WS_INSTANCE_ID env var.
- `tests/redis-dedupe-store.test.ts`: existing tests pass `{ instanceId: 'inst-A' }`. NEW tests: "two instances against the SAME backing Redis do NOT suppress each other (broadcast invariant)" + "factory throws when instanceId is empty".
- `tests/streams-subscriber.test.ts:204`: rewritten to use the SAME `redis` instance for both subscribers' dedupe stores (production-realistic). Distinct `instanceId` ('A' vs 'B') keeps their dedupe keyspaces isolated. Both subscribers still receive all 3 events.
- `docs/06-operations/01-runbook.md §17.1`: updated to reflect per-instance dedupe key shape (`ws:dedupe:<WS_INSTANCE_ID>:<eventId>`); explicit note that global key would break broadcast.

---

## Round 2 — GO from both reviewers (independent)

### Codex round 2

> No findings. The per-instance dedupe scope is now correct. `createDedupeStore()` keys on `ws:dedupe:<instanceId>:<eventId>`, and `buildStreamsResources()` passes the same `WS_INSTANCE_ID` that also defines the consumer-group suffix. That gives exactly the right boundary: list+streams duplicates collapse **within one ws-server instance**, while other instances keep independent keyspaces and still broadcast the same stream entry.
>
> The updated broadcast test now exercises the production wiring meaningfully. Both subscribers share the same Redis backing for streams and dedupe, and only differ by `instanceId`, which is how production is composed. That directly covers the bug I flagged in round 2.
>
> Verdict: **GO**.

The only residual caveat: `WS_INSTANCE_ID` must actually be unique per process, not merely non-empty — that was already an A2 requirement, not a code regression.

### Gemini round 2

> Verified S18-A2 Round 2. All previous critical findings are addressed, and the cross-instance suppression bug caught in Round 2 is fixed and verified with production-realistic tests.
>
> **Cross-Instance Fan-out**: The dedupe keyspace is now correctly partitioned by `WS_INSTANCE_ID`, allowing horizontal scaling without instances suppressing each other's broadcasts.
>
> **Resilience**: The `DedupeStore` fails OPEN on Redis errors, prioritizing event delivery over potential duplicates.
>
> Verdict: **GO**.

Recommendations from Gemini (operational, not code):
- Ensure `WS_INSTANCE_ID` is uniquely assigned (e.g., via K8s Pod Name or Railway Instance ID) during deployment.
- Monitor `ws:events` stream length in production; the default MAXLEN 50,000 provides ample headroom for current traffic patterns.

---

## Test Coverage Summary

| Suite | Round 0 | Round 1 (post-NOACK + dedupe) | Round 2 (post-per-instance scope) |
|---|---|---|---|
| `@aptivo/redis` | 16 tests | 20 tests | 20 tests |
| `@aptivo/ws-server` | 73 tests | 75 tests | 77 tests |
| Critical new assertions | — | NOACK pass-through; PEL stays empty; MAXLEN cursor adjustment; NOGROUP error; dedupeStore wired into list subscriber; ring-miss optimization | Per-instance dedupe scope; two instances same Redis don't suppress; factory rejects empty instanceId |

Pre-existing apps/web `s11-hitl2-07` flake is unrelated to A2 (verified by `git stash` then re-running on main).

---

## Pattern Reinforcement

Two-reviewer-round model continues to deliver outsized value:
- **Codex round 1**: caught NOACK PEL leak + cross-transport dedupe gap — system-semantic failures around at-least-once vs at-most-once delivery semantics.
- **Codex round 2**: caught the cross-instance suppression bug introduced by R1 fix — pure design-correctness check that ANY load-bearing test had been masking.
- **Gemini round 1**: caught PEL leak independently + flagged orphan group cleanup as an operational concern Codex didn't surface.
- **Gemini round 2**: confirmed the fix and added operational recommendations (WS_INSTANCE_ID uniqueness, MAXLEN headroom).

**Lesson reinforced**: when a load-bearing invariant test gives each "instance" its own backing store, the test isn't testing the production wiring — it's testing isolation. For multi-instance designs, tests must use the SAME backend the instances share.

---

## Final Verdict: GO (both reviewers, two-round sign-off)

A2 is production-ready pending TCP Redis provisioning (DevOps calendar item, not S18 scope). The implementation closes:

- **AD-S18-2 broadcast invariant**: per-instance consumer groups + per-instance dedupe scope = each ws-server instance fans out every event to its websocket clients, independent of every other instance.
- **Cross-transport dedupe in dual mode**: same instance receiving X via list AND streams collapses to one publish via the shared per-instance DedupeStore.
- **At-most-once via NOACK**: PEL stays empty for healthy groups; lost-during-crash events accept the same trade-off as S17 list subscriber.
- **Fail-fast on misconfig**: `streams|dual` modes without TCP Redis crash the deploy; `list` mode falls back gracefully for test/dev.
- **Production-realistic tests**: AD-S18-2 invariant test now uses shared Redis with distinct instanceIds — the same wiring shape production deploys.

Carry-forward (operational, not code): the documented S19 hardening item to auto-clean orphan consumer groups on graceful shutdown remains. Acceptable for S18 because group count is bounded by deployed instance count.
