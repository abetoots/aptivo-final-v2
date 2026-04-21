# WFE3-02 Pre-Commit Review — Multi-Model

**Date**: 2026-04-21
**Reviewers**: Claude Opus 4.7 (Lead), Gemini via PAL clink (`gemini-3-flash-preview`), Codex MCP (GPT-5).
**Subject**: WFE3-02 `apps/ws-server` + protocol frame schemas prior to commit

---

## Executive Summary

Both reviewers found **concrete, verifiable defects**; their findings overlapped on the biggest one (backpressure is dormant for outbound-only traffic) and each surfaced distinct additional bugs. Codex was especially precise with line numbers and caught an **off-by-one in the heartbeat close threshold** that my own tests encoded. Lead verified all findings by reading source. Fixing inline pre-commit.

## Critical Findings (both reviewers, overlapping)

### 🚨 Backpressure bypass for outbound-only traffic

**Claim** (both): `outbound.markBlocked(true)` is only set from `checkBackpressure()`, which is **only called after inbound `message` events**. For a client that subscribes to events and then goes silent (common pattern), every `publish()` goes through the raw send path, the queue never buffers, and the 1000-cap is effectively bypassed — the ws library's internal buffer grows unbounded.

Codex also points out the close condition `depth() > outboundQueueCapacity` is unreachable: `enqueue` already rejects at `>= capacity`, so `depth()` can never exceed it. The real overflow signal is `enqueue() === false`, which `deliverEvent()` and `sendPing()` ignore.

**Lead-verified**: yes, the code flow matches the critique exactly.

**Fix applied**:
1. Move the `bufferedAmount` check INTO the per-connection `sendRaw` callback so every outbound frame triggers the check (not only inbound ones).
2. Have `deliverEvent()` and `sendPing()` check the `send()` boolean return; when enqueue returns false, close the connection with code 1013 immediately.
3. Remove the unreachable `depth() > outboundQueueCapacity` branch — `enqueue === false` is now the authoritative overflow signal.

## High-Impact Findings

### 🚨 Heartbeat off-by-one (Codex)

**Claim**: spec says "3 missed pongs trigger server-initiated close"; the implementation closes on the **4th** missed-pong tick because it uses `missedPongs > maxMissedPongs` with default 3. The connection-manager test encodes this bug by ticking 4 times.

**Lead-verified**: correct. Each `sendPing()` increments `missedPongs` and the close fires when it exceeds `maxMissedPongs`.

**Fix**: change to `missedPongs >= maxMissedPongs` so 3 missed pongs triggers the close. Update the test accordingly.

### 🚨 Frames can fire after close initiation (Codex)

**Claim**: `sendPing()`/`checkTokenExpiry()` call `deps.close(...)` but do NOT mark the handler closed or clear `auth` + `subs`. `deliverEvent()` continues to send if `auth.status === 'authed'` and the topic is subscribed. Detach only happens later when the socket `'close'` event fires. There's a race where events published after close-initiation but before the socket close callback still get queued/sent — potentially after the TLS tear-down has started.

**Fix**: add a `closed` flag inside the handler. `deps.close()` transitions the state to closed before the callback fires; `deliverEvent`, `sendPing`, and all other outbound methods short-circuit when `closed === true`.

### 🟡 Replay buffer topic leak (Gemini)

**Claim**: the `rings` Map grows once per unique topic and is never pruned. Over a long-running server, memory grows linearly with the number of distinct topics ever published, even if all their events have aged out.

**Fix**: when `eventsSince()` runs `prune(ring)`, if the pruned `live` array is empty, delete the topic's ring entry. Bounds memory to "topics with at least one event in the last TTL window."

### 🟡 Railway health-check points to a route that doesn't exist (Codex)

**Claim**: `railway.json` declares `healthcheckPath: /health`, but the server only starts a raw `WebSocketServer` — no HTTP route. Deploying with this config would flap unhealthy.

**Fix**: construct a Node `http.Server` in `createWsServer`, mount a minimal `/health` route that returns 200, and pass the HTTP server to `WebSocketServer` via the `server` option so WebSocket upgrade + HTTP health-check share the same port.

## Lower-Priority Findings

- **Shutdown drain delay** (Gemini): `server.stop()` broadcasts `reconnect` then immediately closes. Clients may miss the reconnect frame if the close fires before the frame reaches them. **Fix**: add ~100 ms delay after broadcasts before closing sockets.
- **Shutdown undercounts `messagesSent`** (Codex): `stop()` uses raw `socket.send` bypassing the outbound queue + metrics. **Accepted — minor**; shutdown messages are transient, not worth routing through the queue path.
- **Heartbeat interval vs per-pong timeout** (Gemini): spec says "client must respond with pong within 10s"; implementation only checks once per heartbeat interval (30s default). **Accepted as S17 polish** — tightening would require a separate pong-deadline timer.
- **Subscriptions unbounded per connection** (Codex): the `subs` Set on the handler has no cap. **Accepted — out of S16 scope**; adding a cap now without a sizing study would be arbitrary.

## Security Findings — All Clean

Both reviewers agreed:
- `HS256`-only algorithm allowlist in `verifyWsToken` correctly blocks `alg=none` / algorithm-confusion attacks.
- Pre-auth RBAC bypass — not present. Non-`auth` frames before auth are rejected by the state machine.
- JWT signing + audience/issuer enforced via `jose.jwtVerify` options.

## Test Coverage Gaps (both reviewers)

- No test for backpressure engagement on outbound-only traffic.
- No test for the (now-fixed) off-by-one heartbeat.
- No test for stale handler continuing to emit events after close.
- No integration test for graceful shutdown broadcast.
- No Railway health-check verification.

## Actionable Recommendations (all applied pre-commit)

1. ✅ **Backpressure: check `bufferedAmount` inside `sendRaw`** before every outbound frame; `deliverEvent`/`sendPing` close 1013 on enqueue-full.
2. ✅ **Heartbeat off-by-one**: `>= maxMissedPongs`; test updated.
3. ✅ **Close-after-close race**: add `closed` flag; outbound methods short-circuit when closed.
4. ✅ **Replay-buffer topic leak**: delete ring entry when pruned empty.
5. ✅ **Railway health-check**: HTTP server mounted with `/health`; shared with WebSocket upgrade.
6. ✅ **Shutdown drain delay**: 100 ms between reconnect broadcast and socket close.
7. ✅ **New tests** for each fix: outbound backpressure engagement, 3-missed-pongs close, deliverEvent-after-close silence, health-check endpoint.

## Deferred to S17

- Proper pong-within-10s deadline (would need per-ping timers).
- Subscription cap per connection (needs sizing study).
- Inngest → Redis pub/sub bridge for multi-instance fan-out.
- Consolidate ws-server's JWT verify with HITL's `jwt-manager`.
- Wire `onAuthFailure` → `AuditService` in composition root.

## Provenance

- Gemini via `mcp__pal__clink` (routed to `gemini-3-flash-preview`).
- Codex via MCP thread `019dadd1-6dec-7ac1-a57f-8408bf49916f` (stable after auth refresh).
- Lead verification: direct reads of `server.ts` (backpressure path), `connection-manager.ts` (heartbeat + close race), `replay-buffer.ts` (topic pruning), `railway.json` + `index.ts` (missing `/health` route).
