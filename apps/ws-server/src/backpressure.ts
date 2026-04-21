/**
 * WFE3-02: per-connection outbound queue + slow-consumer policy.
 *
 * Wraps raw-send so the server can track how many frames are queued
 * waiting for the socket to drain. When the queue exceeds its capacity,
 * `enqueue()` returns false — the server MUST close the connection with
 * code 1013 (Try Again Later) to avoid unbounded memory growth when a
 * consumer can't keep up.
 *
 * The `markBlocked` hook lets the server flip the queue into buffering
 * mode when the underlying ws socket reports bufferedAmount > 0 (or any
 * backpressure signal). Blocked messages drain FIFO once unblocked.
 */

export interface OutboundQueueConfig {
  /** underlying raw send — e.g. ws.send(frame). MUST not throw. */
  readonly sendRaw: (frame: string) => void;
  /** max messages allowed in the pending queue before enqueue rejects */
  readonly capacity: number;
  /**
   * Optional pre-send hook the queue invokes before every enqueue, so
   * the server can flip `blocked` based on the live socket buffer
   * without the caller needing to remember to call markBlocked(...).
   * Without this, outbound-only traffic silently bypasses backpressure
   * (flagged by pre-commit review).
   */
  readonly beforeEnqueue?: () => void;
}

export interface OutboundQueue {
  /** returns false if the queue is full (caller should close the socket) */
  enqueue(frame: string): boolean;
  markBlocked(blocked: boolean): void;
  depth(): number;
}

export function createOutboundQueue(config: OutboundQueueConfig): OutboundQueue {
  const pending: string[] = [];
  let blocked = false;

  function drain(): void {
    while (!blocked && pending.length > 0) {
      const frame = pending.shift()!;
      config.sendRaw(frame);
    }
  }

  return {
    enqueue(frame) {
      config.beforeEnqueue?.();
      if (!blocked) {
        config.sendRaw(frame);
        return true;
      }
      if (pending.length >= config.capacity) return false;
      pending.push(frame);
      return true;
    },

    markBlocked(next) {
      blocked = next;
      if (!blocked) drain();
    },

    depth() {
      return pending.length;
    },
  };
}
