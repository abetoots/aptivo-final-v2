/**
 * WFE3-02: in-process metrics counters.
 *
 * Lightweight atomic counters exposed for scraping (e.g. by a future
 * Prometheus endpoint) or for the composition root to forward to an
 * observability service. The spec calls for:
 * - ws_active_connections (gauge)
 * - ws_message_egress_rate (counter, per-minute rate computed by caller)
 * - ws_pubsub_latency_ms (histogram — gauge-last approximation here)
 * - ws_auth_failures_total (counter)
 *
 * Deliberately a thin struct, not a full metrics framework; the server
 * forwards these to its actual observability sink in the composition
 * root.
 */

export interface WsMetricsSnapshot {
  activeConnections: number;
  messagesSent: number;
  authFailuresTotal: number;
  lastPubsubLatencyMs: number;
}

export interface WsMetrics {
  onConnect(): void;
  onDisconnect(): void;
  onMessageSent(): void;
  onAuthFailure(): void;
  recordPubsubLatency(ms: number): void;
  snapshot(): WsMetricsSnapshot;
}

export function createMetrics(): WsMetrics {
  let activeConnections = 0;
  let messagesSent = 0;
  let authFailuresTotal = 0;
  let lastPubsubLatencyMs = 0;

  return {
    onConnect() { activeConnections += 1; },
    onDisconnect() { activeConnections = Math.max(0, activeConnections - 1); },
    onMessageSent() { messagesSent += 1; },
    onAuthFailure() { authFailuresTotal += 1; },
    recordPubsubLatency(ms: number) { lastPubsubLatencyMs = ms; },
    snapshot() {
      return { activeConnections, messagesSent, authFailuresTotal, lastPubsubLatencyMs };
    },
  };
}
