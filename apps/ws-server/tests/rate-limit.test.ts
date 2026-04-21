/**
 * WFE3-02: inbound frame rate limiter tests (sliding window).
 */

import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../src/rate-limit.js';

describe('WFE3-02: createRateLimiter', () => {
  it('permits frames within the cap', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxFramesPerSec: 10, nowMs: () => clock });
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.allow()).toBe(true);
    }
  });

  it('rejects the first frame over the cap within the window', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxFramesPerSec: 3, nowMs: () => clock });
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });

  it('admits new frames once older ones age out of the 1-second window', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxFramesPerSec: 2, nowMs: () => clock });
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
    clock = 1001; // slide past the 1s window
    expect(limiter.allow()).toBe(true);
  });

  it('handles bursts at window boundaries correctly', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxFramesPerSec: 5, nowMs: () => clock });
    for (let i = 0; i < 5; i += 1) expect(limiter.allow()).toBe(true);
    // full — rejected
    expect(limiter.allow()).toBe(false);
    clock = 500;
    // still within window for 5 prior frames
    expect(limiter.allow()).toBe(false);
    clock = 1001;
    // all 5 have aged out
    for (let i = 0; i < 5; i += 1) expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
  });
});
