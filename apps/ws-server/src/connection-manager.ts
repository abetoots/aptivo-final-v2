/**
 * WFE3-02: per-connection state machine.
 *
 * Handles the full protocol lifecycle for a single WebSocket connection:
 * - auth_required → auth → auth_ok/auth_failed (10s timeout closes 4001)
 * - subscribe / unsubscribe / resume with RBAC + replay
 * - ping/pong heartbeat with 3-miss disconnect (close 1008)
 * - mid-session token-expiry watchdog (close 4003, new code in v1.0)
 * - inbound rate-limit breach (close 4002)
 * - outbound backpressure breach (close 1013)
 *
 * No `ws` library dependency — the server passes in `sendFrame` and
 * `close` callbacks so the handler stays unit-testable.
 */

import {
  InboundFrameSchema,
  type OutboundFrame,
  type EventFrame,
  WsCloseCodes,
} from '@aptivo/types';
import type { WsAuthClaims, WsAuthError } from './auth.js';
import type { RateLimiter } from './rate-limit.js';
import type { OutboundQueue } from './backpressure.js';
import type { ReplayBuffer } from './replay-buffer.js';

// ---------------------------------------------------------------------------
// handler dependencies — all injectable for testability
// ---------------------------------------------------------------------------

export interface ConnectionDeps {
  /** returns true if the authenticated user can subscribe to the topic */
  readonly authorize: (claims: WsAuthClaims, topic: string) => boolean;
  /** verifies the JWT presented in the auth frame */
  readonly verifyToken: (token: string) => Promise<import('@aptivo/types').Result<WsAuthClaims, WsAuthError>>;
  /** audit-sink for auth failures (4001 / 4003) — allow omission in tests */
  readonly onAuthFailure?: (info: { reason: string; at: number }) => void;
  /** the connection's outbound queue (backpressure-aware) */
  readonly outbound: OutboundQueue;
  /** per-connection inbound rate limiter */
  readonly rateLimiter: RateLimiter;
  /** topic replay buffer (shared across connections) */
  readonly replay: ReplayBuffer;
  /** server-initiated close with the given code + optional frame */
  readonly close: (code: number, reason?: string) => void;
  /** injectable clock for tests */
  readonly nowMs?: () => number;
  /** max unauthenticated wait before close 4001 (ms) — spec default 10s */
  readonly authTimeoutMs?: number;
  /** max missed pongs before close 1008 — spec says 3 */
  readonly maxMissedPongs?: number;
}

// ---------------------------------------------------------------------------
// connection handler
// ---------------------------------------------------------------------------

type AuthState =
  | { status: 'unauth' }
  | { status: 'authed'; claims: WsAuthClaims };

export interface ConnectionHandler {
  /** send auth_required immediately after connect; starts auth-timeout timer */
  onOpen(): void;
  /** process an inbound raw text frame */
  onMessage(raw: string): Promise<void>;
  /** called when the server sends a ping; caller sets up the 30s cadence */
  sendPing(): void;
  /** called when the connection closes — tears down timers */
  dispose(): void;
  /** fans out a topic event to this connection if subscribed; also stores in replay buffer */
  deliverEvent(event: EventFrame): void;
  /** test hook: set auth state directly */
  _setAuthForTest(claims: WsAuthClaims | null): void;
  /** test hook: force the heartbeat to tick (instead of waiting for real time) */
  tickHeartbeat(): void;
  /** test hook: force the token-expiry watchdog to tick */
  checkTokenExpiry(): void;
  /** current subscriptions (for tests / observability) */
  subscriptions(): readonly string[];
}

export function createConnectionHandler(deps: ConnectionDeps): ConnectionHandler {
  const now = deps.nowMs ?? Date.now;
  const authTimeoutMs = deps.authTimeoutMs ?? 10_000;
  const maxMissedPongs = deps.maxMissedPongs ?? 3;

  let auth: AuthState = { status: 'unauth' };
  const subs = new Set<string>();
  let missedPongs = 0;
  let lastPongAt = 0;
  let authDeadline = 0;
  // `closed` is set BEFORE deps.close() fires so later deliverEvent /
  // heartbeat calls that race with the socket's close callback cannot
  // emit frames on a torn-down connection. Pre-commit review caught
  // events leaking through this window when pub/sub fires between
  // close initiation and the ws socket's close event.
  let closed = false;

  function closeConn(code: number, reason?: string) {
    if (closed) return;
    closed = true;
    subs.clear();
    deps.close(code, reason);
  }

  function send(frame: OutboundFrame): boolean {
    if (closed) return false;
    const ok = deps.outbound.enqueue(JSON.stringify(frame));
    if (!ok) {
      // outbound queue full — caller's slow-consumer policy fires by
      // closing the socket with 1013. This is the REAL overflow signal:
      // the previously-unreachable `depth() > capacity` branch in
      // server.ts was a no-op because enqueue already rejects at the
      // cap. Pre-commit review caught this.
      closeConn(
        /* WsCloseCodes.TryAgainLater */ 1013,
        'outbound queue overflow',
      );
    }
    return ok;
  }

  return {
    onOpen() {
      if (closed) return;
      authDeadline = now() + authTimeoutMs;
      send({ type: 'auth_required' });
    },

    async onMessage(raw) {
      if (closed) return;
      if (!deps.rateLimiter.allow()) {
        closeConn(WsCloseCodes.RateLimited, 'inbound rate limit exceeded');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        send({ type: 'error', code: 400, message: 'invalid JSON' });
        return;
      }

      const result = InboundFrameSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'error', code: 400, message: 'unknown or malformed frame' });
        return;
      }
      const frame = result.data;

      // the auth frame is the one message allowed before authentication
      if (auth.status === 'unauth' && frame.type !== 'auth') {
        send({ type: 'error', code: 401, message: 'authenticate first' });
        return;
      }

      switch (frame.type) {
        case 'auth': {
          const verify = await deps.verifyToken(frame.token);
          if (!verify.ok) {
            deps.onAuthFailure?.({ reason: verify.error._tag, at: now() });
            send({ type: 'auth_failed', reason: verify.error._tag });
            closeConn(WsCloseCodes.AuthTimeout, verify.error._tag);
            return;
          }
          auth = { status: 'authed', claims: verify.value };
          send({ type: 'auth_ok', userId: verify.value.userId, roles: [...verify.value.roles] });
          authDeadline = 0;
          return;
        }
        case 'subscribe': {
          const { claims } = auth as Exclude<AuthState, { status: 'unauth' }>;
          if (!deps.authorize(claims, frame.topic)) {
            send({ type: 'error', code: 403, message: 'forbidden', topic: frame.topic });
            return;
          }
          subs.add(frame.topic);
          send({ type: 'subscribe_ok', topic: frame.topic });
          return;
        }
        case 'unsubscribe': {
          subs.delete(frame.topic);
          return;
        }
        case 'resume': {
          const { claims } = auth as Exclude<AuthState, { status: 'unauth' }>;
          if (!deps.authorize(claims, frame.topic)) {
            send({ type: 'error', code: 403, message: 'forbidden', topic: frame.topic });
            return;
          }
          subs.add(frame.topic);
          const replay = deps.replay.eventsSince(frame.topic, frame.lastEventId);
          if (replay.kind === 'full_sync') {
            send({ type: 'full_sync', topic: frame.topic, reason: 'cursor outside replay window' });
          } else {
            for (const ev of replay.events) {
              send({
                type: 'event',
                topic: ev.topic,
                eventId: ev.eventId,
                timestamp: ev.timestamp,
                data: ev.data,
              });
            }
          }
          return;
        }
        case 'pong': {
          missedPongs = 0;
          lastPongAt = now();
          return;
        }
      }
    },

    sendPing() {
      if (closed) return;
      if (auth.status !== 'authed') return; // no heartbeats before auth
      missedPongs += 1;
      // spec says "3 missed pongs trigger server-initiated close", so
      // firing on the 3rd (not 4th) matches. Pre-commit review caught
      // the off-by-one — previous code used `>` with default 3, which
      // fired on the 4th miss.
      if (missedPongs >= maxMissedPongs) {
        closeConn(WsCloseCodes.PolicyViolation, 'missed heartbeats');
        return;
      }
      send({ type: 'ping' });
    },

    tickHeartbeat() {
      this.sendPing();
    },

    checkTokenExpiry() {
      if (closed) return;
      if (auth.status !== 'authed') {
        // if we're still unauth past the deadline, close with 4001
        if (authDeadline > 0 && now() >= authDeadline) {
          deps.onAuthFailure?.({ reason: 'AuthTimeout', at: now() });
          closeConn(WsCloseCodes.AuthTimeout, 'auth timeout');
        }
        return;
      }
      if (now() >= auth.claims.expMs) {
        deps.onAuthFailure?.({ reason: 'TokenExpired', at: now() });
        closeConn(WsCloseCodes.TokenExpired, 'token expired mid-session');
      }
    },

    deliverEvent(event) {
      if (closed) return;
      if (auth.status !== 'authed') return;
      if (!subs.has(event.topic)) return;
      send(event);
    },

    dispose() {
      closed = true;
      subs.clear();
    },

    _setAuthForTest(claims) {
      auth = claims ? { status: 'authed', claims } : { status: 'unauth' };
    },

    subscriptions() {
      return [...subs];
    },
  };
}
