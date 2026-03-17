# WebSocket Lifecycle Specification

**Version**: 1.0.0
**Status**: Draft
**Closes**: RC-1 (WebSocket connection lifecycle), RC-2 (WebSocket reconnection behavior)

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

| Code | Reason | Action |
|------|--------|--------|
| 1000 | Normal close | No reconnect |
| 1001 | Going away (deployment) | Auto reconnect |
| 1008 | Policy violation (auth) | Re-authenticate |
| 1011 | Server error | Reconnect with backoff |
| 4001 | Auth timeout | Re-authenticate |
| 4002 | Rate limited | Retry after delay |

## 4. Phase 2 Status

WebSocket support is **documented but not implemented** in Phase 2. The specification defines the contract for Phase 3 implementation. Phase 2 uses polling-based updates via Inngest `step.waitForEvent()` for real-time behavior.

---

## Traceability

| Finding | Source | Status |
|---------|--------|--------|
| RC-1 | WebSocket connection lifecycle | **Addressed** (documented) |
| RC-2 | WebSocket reconnection behavior | **Addressed** (documented) |
