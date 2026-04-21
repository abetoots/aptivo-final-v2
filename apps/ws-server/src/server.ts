/**
 * WFE3-02: WebSocket server bootstrap.
 *
 * Starts a `ws` server on the configured port, wires each incoming
 * connection through the connection handler, runs heartbeat +
 * token-expiry watchdogs on fixed intervals, and exposes programmatic
 * hooks (`publish`, `stop`) so the process entry point or tests can
 * drive it.
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import type { EventFrame } from '@aptivo/types';
import { WsCloseCodes } from '@aptivo/types';
import { verifyWsToken, type WsAuthClaims } from './auth.js';
import { createRateLimiter } from './rate-limit.js';
import { createOutboundQueue } from './backpressure.js';
import { createReplayBuffer } from './replay-buffer.js';
import { createConnectionHandler, type ConnectionHandler } from './connection-manager.js';
import { createEventBridge, type EventBridge } from './event-bridge.js';
import { createMetrics, type WsMetrics } from './metrics.js';

export interface ServerConfig {
  /** port to listen on (default 3001) */
  readonly port?: number;
  /** host to bind to (default: all interfaces). Set to 127.0.0.1 for tests. */
  readonly host?: string;
  /** shared HS256 signing secret used to verify client JWTs */
  readonly jwtSecret: string;
  /** required issuer claim on incoming tokens */
  readonly jwtIssuer: string;
  /** required audience claim on incoming tokens */
  readonly jwtAudience: string;
  /** inbound frame cap per connection (frames/sec) — spec: 50 */
  readonly inboundFramesPerSec?: number;
  /** outbound queue capacity per connection — spec: 1000 */
  readonly outboundQueueCapacity?: number;
  /** replay buffer TTL (ms) — spec: 5 minutes */
  readonly replayTtlMs?: number;
  /** replay buffer size per topic */
  readonly replayMaxPerTopic?: number;
  /** heartbeat interval (ms) — spec: 30s */
  readonly heartbeatIntervalMs?: number;
  /** unauthenticated close deadline (ms) — spec: 10s */
  readonly authTimeoutMs?: number;
  /** how often to check token expiry (ms) */
  readonly tokenExpiryPollMs?: number;
  /** RBAC predicate — defaults to allow any topic starting with 'workflow/' */
  readonly authorize?: (claims: WsAuthClaims, topic: string) => boolean;
  /** audit sink for auth failures */
  readonly onAuthFailure?: (info: { reason: string; userId?: string; at: number }) => void;
}

export interface WsServer {
  /** the `ws` server instance, exposed mainly for integration tests */
  readonly wss: WebSocketServer;
  readonly bridge: EventBridge;
  readonly metrics: WsMetrics;
  /** publish an event to all subscribed connections */
  publish(event: EventFrame): void;
  /** graceful shutdown: broadcast `reconnect` and close all sockets */
  stop(reason?: string, retryAfterMs?: number): Promise<void>;
}

export function createWsServer(config: ServerConfig): WsServer {
  const port = config.port ?? 3001;
  const inboundFramesPerSec = config.inboundFramesPerSec ?? 50;
  const outboundQueueCapacity = config.outboundQueueCapacity ?? 1000;
  const replayTtlMs = config.replayTtlMs ?? 5 * 60_000;
  const replayMaxPerTopic = config.replayMaxPerTopic ?? 1000;
  const heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30_000;
  const tokenExpiryPollMs = config.tokenExpiryPollMs ?? 5_000;
  const authTimeoutMs = config.authTimeoutMs ?? 10_000;
  const authorize = config.authorize ?? ((_claims, topic) => topic.startsWith('workflow/'));

  const replay = createReplayBuffer({ maxPerTopic: replayMaxPerTopic, ttlMs: replayTtlMs });
  const bridge = createEventBridge({ replay });
  const metrics = createMetrics();

  // Shared HTTP server so WebSocket upgrade + /health endpoint share a
  // port. The /health route is what Railway's healthcheckPath probes —
  // without this route the container would flap unhealthy (flagged by
  // Codex pre-commit review).
  const httpServer: HttpServer = createHttpServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', connections: metrics.snapshot().activeConnections }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  if (config.host) {
    httpServer.listen(port, config.host);
  } else {
    httpServer.listen(port);
  }

  const wss = new WebSocketServer({ server: httpServer });
  const handlers = new Map<WebSocket, ConnectionHandler>();

  wss.on('connection', (socket: WebSocket) => {
    // Pre-send watermark check — previously only inbound-message events
    // triggered the backpressure gate, so outbound-only traffic (the
    // common case for event delivery) bypassed the queue entirely. Now
    // every outbound frame first peeks at `bufferedAmount` and engages
    // the buffer path if the socket hasn't drained. Flagged by both
    // reviewers as a critical pre-commit defect.
    const BACKPRESSURE_WATERMARK_BYTES = 64 * 1024;
    const outbound = createOutboundQueue({
      sendRaw: (frame) => {
        socket.send(frame, (err) => {
          if (err) return; // fire-and-forget; the socket's own close handler will clean up
        });
        metrics.onMessageSent();
      },
      capacity: outboundQueueCapacity,
      // wired via DI so every enqueue checks live socket buffer first
      beforeEnqueue: () => {
        outbound.markBlocked(socket.bufferedAmount > BACKPRESSURE_WATERMARK_BYTES);
      },
    });

    socket.on('error', () => {
      // swallow — close event will follow
    });

    const rateLimiter = createRateLimiter({ maxFramesPerSec: inboundFramesPerSec });

    const handler = createConnectionHandler({
      verifyToken: (token) =>
        verifyWsToken(token, {
          secret: config.jwtSecret,
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        }),
      authorize,
      onAuthFailure: (info) => {
        metrics.onAuthFailure();
        config.onAuthFailure?.({ reason: info.reason, at: info.at });
      },
      outbound,
      rateLimiter,
      replay,
      authTimeoutMs,
      close: (code, reason) => socket.close(code, reason),
    });

    handlers.set(socket, handler);
    bridge.attach(handler);
    metrics.onConnect();

    socket.on('message', async (raw) => {
      await handler.onMessage(raw.toString());
    });

    socket.on('close', () => {
      handlers.delete(socket);
      bridge.detach(handler);
      handler.dispose();
      metrics.onDisconnect();
    });

    handler.onOpen();
  });

  const heartbeatTimer = setInterval(() => {
    for (const h of handlers.values()) h.tickHeartbeat();
  }, heartbeatIntervalMs);

  const expiryTimer = setInterval(() => {
    for (const h of handlers.values()) h.checkTokenExpiry();
  }, tokenExpiryPollMs);

  return {
    wss,
    bridge,
    metrics,
    publish(event) {
      const start = Date.now();
      bridge.publish(event);
      metrics.recordPubsubLatency(Date.now() - start);
    },
    async stop(reason = 'deployment', retryAfterMs) {
      clearInterval(heartbeatTimer);
      clearInterval(expiryTimer);
      // broadcast reconnect so clients can back off
      const frame = JSON.stringify({ type: 'reconnect', reason, retryAfterMs });
      for (const socket of wss.clients) {
        try { socket.send(frame); } catch { /* ignore */ }
      }
      // short drain window so the reconnect frame actually reaches
      // clients before the close tear-down. Pre-commit review caught
      // that simultaneous send+close races lose the reconnect frame.
      await delay(100);
      for (const socket of wss.clients) {
        socket.close(WsCloseCodes.GoingAway, reason);
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
