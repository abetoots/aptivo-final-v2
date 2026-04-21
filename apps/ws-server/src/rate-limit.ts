/**
 * WFE3-02: per-connection inbound frame rate limiter (sliding 1-second
 * window).
 *
 * When the rate limiter rejects a frame, the caller should close the
 * connection with code 4002. The limiter is NOT shared across
 * connections — each connection gets its own; a DoS across many
 * connections is a platform concern (WAF / load balancer), not this
 * component's responsibility.
 */

export interface RateLimiterConfig {
  readonly maxFramesPerSec: number;
  readonly nowMs?: () => number;
}

export interface RateLimiter {
  /** records a frame arrival; returns true if allowed, false if over cap */
  allow(): boolean;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const now = config.nowMs ?? Date.now;
  const window: number[] = [];

  return {
    allow() {
      const current = now();
      const cutoff = current - 1000;
      // drop arrivals older than the sliding window
      while (window.length > 0 && window[0]! < cutoff) window.shift();
      if (window.length >= config.maxFramesPerSec) return false;
      window.push(current);
      return true;
    },
  };
}
