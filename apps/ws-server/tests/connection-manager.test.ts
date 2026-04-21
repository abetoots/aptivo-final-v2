/**
 * WFE3-02: connection handler state-machine tests.
 *
 * Covers the full protocol flow via injected collaborators. No real
 * WebSocket required — the server integration test exercises that.
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createConnectionHandler } from '../src/connection-manager.js';
import { createRateLimiter } from '../src/rate-limit.js';
import { createOutboundQueue } from '../src/backpressure.js';
import { createReplayBuffer } from '../src/replay-buffer.js';
import { WsCloseCodes } from '@aptivo/types';
import type { WsAuthClaims } from '../src/auth.js';

function setup(overrides: Parameters<typeof createConnectionHandler>[0] extends infer D
  ? D extends object ? Partial<D> : never : never = {} as never) {
  const sent: string[] = [];
  const sendRaw = (frame: string) => sent.push(frame);
  const outbound = createOutboundQueue({ sendRaw, capacity: 100 });
  const rateLimiter = createRateLimiter({ maxFramesPerSec: 50 });
  const replay = createReplayBuffer({ maxPerTopic: 100, ttlMs: 5 * 60_000 });
  const closeFn = vi.fn();
  const verifyToken = vi.fn(async (token: string) => {
    if (token === 'good') {
      const claims: WsAuthClaims = { userId: 'user-1', roles: ['user'], expMs: Date.now() + 60_000 };
      return Result.ok(claims);
    }
    return Result.err({ _tag: 'InvalidSignature' as const });
  });
  const authorize = vi.fn((_claims, topic: string) => topic.startsWith('workflow/'));
  const onAuthFailure = vi.fn();

  const handler = createConnectionHandler({
    outbound,
    rateLimiter,
    replay,
    close: closeFn,
    verifyToken,
    authorize,
    onAuthFailure,
    ...overrides,
  });

  return {
    handler,
    sent,
    outbound,
    replay,
    closeFn,
    verifyToken,
    authorize,
    onAuthFailure,
    parseSent() {
      return sent.map((s) => JSON.parse(s));
    },
  };
}

// ---------------------------------------------------------------------------
// onOpen + auth flow
// ---------------------------------------------------------------------------

describe('WFE3-02: connection — auth flow', () => {
  it('sends auth_required on open', () => {
    const s = setup();
    s.handler.onOpen();
    expect(s.parseSent()[0]).toEqual({ type: 'auth_required' });
  });

  it('rejects any non-auth frame before authentication', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'workflow/1' }));
    const frames = s.parseSent();
    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({ type: 'error', code: 401 });
  });

  it('transitions to authed on valid token', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    const frames = s.parseSent();
    expect(frames[1]).toMatchObject({ type: 'auth_ok', userId: 'user-1', roles: ['user'] });
  });

  it('closes 4001 on invalid token and records auth failure', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'bad' }));
    expect(s.closeFn).toHaveBeenCalledWith(WsCloseCodes.AuthTimeout, expect.any(String));
    expect(s.onAuthFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'InvalidSignature' }));
  });

  it('closes 4001 when auth deadline elapses without a valid token', () => {
    const now = { t: 1000 };
    const s = setup({ nowMs: () => now.t, authTimeoutMs: 5000 });
    s.handler.onOpen();
    now.t += 6000;
    s.handler.checkTokenExpiry();
    expect(s.closeFn).toHaveBeenCalledWith(WsCloseCodes.AuthTimeout, 'auth timeout');
    expect(s.onAuthFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'AuthTimeout' }));
  });
});

// ---------------------------------------------------------------------------
// subscribe / authorize
// ---------------------------------------------------------------------------

describe('WFE3-02: connection — subscribe + RBAC', () => {
  it('returns subscribe_ok when authorize allows', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'workflow/42' }));
    const last = s.parseSent().at(-1);
    expect(last).toEqual({ type: 'subscribe_ok', topic: 'workflow/42' });
    expect(s.handler.subscriptions()).toEqual(['workflow/42']);
  });

  it('returns error 403 when authorize denies', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'admin/stuff' }));
    const last = s.parseSent().at(-1);
    expect(last).toMatchObject({ type: 'error', code: 403, topic: 'admin/stuff' });
    expect(s.handler.subscriptions()).toEqual([]);
  });

  it('unsubscribe removes topic from subscriptions', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'workflow/1' }));
    await s.handler.onMessage(JSON.stringify({ type: 'unsubscribe', topic: 'workflow/1' }));
    expect(s.handler.subscriptions()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// event delivery + replay
// ---------------------------------------------------------------------------

describe('WFE3-02: connection — event delivery', () => {
  it('fans out an event to a subscribed connection', async () => {
    const s = setup();
    s.handler._setAuthForTest({ userId: 'u', roles: ['user'], expMs: Date.now() + 60_000 });
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'workflow/42' }));
    s.sent.length = 0;
    s.handler.deliverEvent({
      type: 'event',
      topic: 'workflow/42',
      eventId: 'evt-1',
      timestamp: new Date().toISOString(),
      data: { stepId: 's1' },
    });
    const last = s.parseSent().at(-1);
    expect(last).toMatchObject({ type: 'event', eventId: 'evt-1' });
  });

  it('does NOT fan out to non-subscribed topics', () => {
    const s = setup();
    s.handler._setAuthForTest({ userId: 'u', roles: ['user'], expMs: Date.now() + 60_000 });
    s.handler.deliverEvent({
      type: 'event',
      topic: 'workflow/99',
      eventId: 'evt-9',
      timestamp: new Date().toISOString(),
      data: {},
    });
    expect(s.sent).toHaveLength(0);
  });

  it('resume within window emits events since lastEventId', async () => {
    const s = setup();
    // pre-populate the replay buffer
    s.replay.append({
      topic: 'workflow/1',
      eventId: 'a',
      timestamp: new Date().toISOString(),
      data: {},
    });
    s.replay.append({
      topic: 'workflow/1',
      eventId: 'b',
      timestamp: new Date().toISOString(),
      data: {},
    });
    s.replay.append({
      topic: 'workflow/1',
      eventId: 'c',
      timestamp: new Date().toISOString(),
      data: {},
    });
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    s.sent.length = 0;
    await s.handler.onMessage(JSON.stringify({ type: 'resume', topic: 'workflow/1', lastEventId: 'a' }));
    const emitted = s.parseSent().filter((f) => f.type === 'event');
    expect(emitted.map((e) => e.eventId)).toEqual(['b', 'c']);
  });

  it('resume outside window emits full_sync', async () => {
    const s = setup();
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    s.sent.length = 0;
    await s.handler.onMessage(JSON.stringify({ type: 'resume', topic: 'workflow/1', lastEventId: 'gone' }));
    const last = s.parseSent().at(-1);
    expect(last).toMatchObject({ type: 'full_sync', topic: 'workflow/1' });
  });
});

// ---------------------------------------------------------------------------
// heartbeat + token expiry
// ---------------------------------------------------------------------------

describe('WFE3-02: connection — heartbeat + expiry', () => {
  it('closes 1008 on the 3rd missed pong (per spec)', async () => {
    // spec §1.3 says "3 missed pongs trigger server-initiated close".
    // Pre-commit review caught an off-by-one: previous code fired on
    // the 4th tick because of `>` vs `>=`. This test LOCKS IN the
    // corrected behaviour — close fires on tick #3, not tick #4.
    const s = setup({ maxMissedPongs: 3 });
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    s.handler.tickHeartbeat(); // missed #1
    s.handler.tickHeartbeat(); // missed #2
    expect(s.closeFn).not.toHaveBeenCalled();
    s.handler.tickHeartbeat(); // missed #3 — close
    expect(s.closeFn).toHaveBeenCalledWith(WsCloseCodes.PolicyViolation, 'missed heartbeats');
  });

  it('pong resets the missed-pong counter', async () => {
    const s = setup({ maxMissedPongs: 3 });
    s.handler.onOpen();
    await s.handler.onMessage(JSON.stringify({ type: 'auth', token: 'good' }));
    s.handler.tickHeartbeat();
    s.handler.tickHeartbeat();
    await s.handler.onMessage(JSON.stringify({ type: 'pong' }));
    s.handler.tickHeartbeat();
    s.handler.tickHeartbeat();
    // still have not exceeded 3 because pong reset; no close
    expect(s.closeFn).not.toHaveBeenCalled();
  });

  it('does not deliver events after close has been initiated (race guard)', async () => {
    const s = setup();
    s.handler._setAuthForTest({ userId: 'u', roles: ['user'], expMs: Date.now() + 60_000 });
    await s.handler.onMessage(JSON.stringify({ type: 'subscribe', topic: 'workflow/1' }));
    s.sent.length = 0;
    // trigger a server-initiated close via token-expiry
    s.handler._setAuthForTest({ userId: 'u', roles: [], expMs: Date.now() - 1 });
    s.handler.checkTokenExpiry();
    // now a pub/sub event arrives between close-initiation and socket close
    s.handler.deliverEvent({
      type: 'event',
      topic: 'workflow/1',
      eventId: 'evt-late',
      timestamp: new Date().toISOString(),
      data: {},
    });
    // the late event must not be sent — handler is closed
    expect(s.sent).toHaveLength(0);
  });

  it('closes 4003 when token exp elapses mid-session', () => {
    const now = { t: 1000 };
    const s = setup({ nowMs: () => now.t });
    s.handler._setAuthForTest({ userId: 'u', roles: [], expMs: now.t + 5000 });
    now.t += 6000;
    s.handler.checkTokenExpiry();
    expect(s.closeFn).toHaveBeenCalledWith(WsCloseCodes.TokenExpired, 'token expired mid-session');
    expect(s.onAuthFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'TokenExpired' }));
  });
});

// ---------------------------------------------------------------------------
// rate limit + backpressure
// ---------------------------------------------------------------------------

describe('WFE3-02: connection — rate limit + backpressure', () => {
  it('closes 4002 on inbound rate-limit breach', async () => {
    const s = setup({ rateLimiter: createRateLimiter({ maxFramesPerSec: 1, nowMs: () => 0 }) });
    await s.handler.onMessage(JSON.stringify({ type: 'pong' }));
    await s.handler.onMessage(JSON.stringify({ type: 'pong' }));
    expect(s.closeFn).toHaveBeenCalledWith(WsCloseCodes.RateLimited, 'inbound rate limit exceeded');
  });
});
