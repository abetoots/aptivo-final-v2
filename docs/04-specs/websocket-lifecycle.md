# WebSocket Lifecycle Specification

**Version**: 1.0.0
**Status**: Implemented (Sprint 16, WFE3-02)
**Server**: `apps/ws-server` (new Node.js process; `ws` library + `jose` for JWT)
**Frame schemas**: `packages/types/src/websocket-events.ts` (Zod — authoritative contract)
**Closes**: RC-1 (WebSocket connection lifecycle), RC-2 (WebSocket reconnection behavior)
**Change discipline**: any modification to frame shape or error codes requires an explicit migration note + v1.1 bump. Frozen at v1.0 by end of S16.

---

## 1. Connection Lifecycle

### 1.1 Phases

| Phase | Description | Duration |
|-------|-------------|----------|
| **Connect** | Client establishes WebSocket via `wss://` | < 3s target |
| **Authenticate** | JWT token validated on first message | < 1s |
| **Active** | Bidirectional messaging | Until close |
| **Idle** | No messages for configurable period | Default 5 min |
| **Close** | Graceful close with reason code | Immediate |

### 1.2 Authentication Flow

1. Client connects to `wss://aptivo.dev/ws`
2. Server sends `{ type: 'auth_required' }`
3. Client sends `{ type: 'auth', token: '<JWT>' }`
4. Server validates JWT (same validation as REST API)
5. Server sends `{ type: 'auth_ok', userId: '...' }` or `{ type: 'auth_failed', reason: '...' }`
6. Unauthenticated connections are closed after 10s timeout

### 1.3 Heartbeat

- Server sends `{ type: 'ping' }` every 30 seconds
- Client must respond with `{ type: 'pong' }` within 10 seconds
- 3 missed pongs trigger server-initiated close

## 2. Reconnection Behavior

### 2.1 Client Reconnection Strategy

| Attempt | Delay | Max |
|---------|-------|-----|
| 1 | 1s | — |
| 2 | 2s | — |
| 3 | 4s | — |
| 4+ | 8s (capped) | 10 attempts |

Exponential backoff with jitter (+-500ms). After 10 failed attempts, surface error to user.

### 2.2 State Recovery

On reconnection, client sends `{ type: 'resume', lastEventId: '...' }`.
Server replays events since `lastEventId` if within replay window (5 minutes).
If outside replay window, server sends `{ type: 'full_sync' }` requiring client to re-fetch state.

### 2.3 Server-Initiated Reconnection

- Deployment: server sends `{ type: 'reconnect', reason: 'deployment' }` before closing
- Maintenance: `{ type: 'reconnect', reason: 'maintenance', retryAfterMs: 30000 }`

## 3. Error Codes

| Code | Reason | Action | Emitted by |
|------|--------|--------|-----------|
| 1000 | Normal close | No reconnect | Client/server |
| 1001 | Going away (deployment) | Auto reconnect | Server-initiated shutdown |
| 1008 | Policy violation (heartbeat miss) | Re-authenticate | Heartbeat timer (3+ missed pongs) |
| 1011 | Server error | Reconnect with backoff | Unexpected server failure |
| 1013 | Try again later (backpressure) | Reconnect with delay | Outbound queue > capacity |
| 4001 | Auth timeout / invalid auth | Re-authenticate | Auth frame verification failure; auth deadline elapsed |
| 4002 | Rate limited | Retry after delay | Inbound frame rate exceeds per-connection cap |
| 4003 | Token expired mid-session | Re-authenticate | Watchdog detected `exp` passed |

**Committed in code** at `packages/types/src/websocket-events.ts` (`WsCloseCodes` enum). Adding a new code requires a v1.1 bump + server support + client awareness.

## 4. Implementation Notes (Sprint 16)

Implemented in `apps/ws-server` with the following composition:

| Module | Responsibility |
|---|---|
| `src/server.ts` | Bootstrap, lifecycle, heartbeat / expiry interval timers |
| `src/connection-manager.ts` | Per-connection state machine (auth, subscribe, deliver, heartbeat, expiry) |
| `src/auth.ts` | Generic HS256 JWT verify (parallel impl to HITL — S17 consolidation task) |
| `src/event-bridge.ts` | In-process event fanout (Redis pub/sub → S17) |
| `src/replay-buffer.ts` | Per-topic ring buffer, 5-min TTL + 1000-event cap |
| `src/rate-limit.ts` | Sliding-window inbound frame rate limiter (50/sec default per spec) |
| `src/backpressure.ts` | Bounded outbound queue (1000 default per spec) |
| `src/metrics.ts` | Counters: `ws_active_connections`, `ws_auth_failures_total`, messages sent, pub/sub latency |

### S17 follow-ups (tracked in sprint plan)

- Inngest → Redis pub/sub bridge so `apps/web` events reach horizontally-scaled ws-server instances.
- Consolidate JWT verification with HITL's `jwt-manager` into a shared module.
- Staging deploy verification (Railway manifest committed at `apps/ws-server/railway.json`; no production deployment performed in S16).
- Wire `onAuthFailure` callback to the `AuditService` from the composition root so 4001/4003 events are captured for credential-stuffing detection.

---

## Traceability

| Finding | Source | Status |
|---------|--------|--------|
| RC-1 | WebSocket connection lifecycle | **Addressed** (documented) |
| RC-2 | WebSocket reconnection behavior | **Addressed** (documented) |
