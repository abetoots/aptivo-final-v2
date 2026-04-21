/**
 * WFE3-02: end-to-end server integration test.
 *
 * Starts a real server on an ephemeral port, connects a `ws` client,
 * and validates the full protocol flow: auth_required → auth → auth_ok
 * → subscribe → subscribe_ok → server-published event → client
 * receives event frame.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { SignJWT } from 'jose';
import type { AddressInfo } from 'node:net';
import { createWsServer, type WsServer } from '../src/server.js';

const SECRET = 'integration-test-secret-32-chars-minimum-ok';
const ISSUER = 'aptivo-web';
const AUDIENCE = 'aptivo-ws';

let server: WsServer | null = null;

async function startServer(overrides: Partial<Parameters<typeof createWsServer>[0]> = {}) {
  server = createWsServer({
    port: 0, // ephemeral
    host: '127.0.0.1',
    jwtSecret: SECRET,
    jwtIssuer: ISSUER,
    jwtAudience: AUDIENCE,
    heartbeatIntervalMs: 1_000_000,
    tokenExpiryPollMs: 1_000_000,
    ...overrides,
  });
  if (!server.wss.address()) {
    await new Promise<void>((resolve) => server!.wss.once('listening', () => resolve()));
  }
  const addr = server.wss.address() as AddressInfo;
  return `ws://127.0.0.1:${addr.port}`;
}

async function mintToken(opts: { sub: string; roles?: string[]; expSeconds?: number } = { sub: 'user-1' }) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: opts.roles ?? ['user'] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expSeconds ?? 300))
    .sign(new TextEncoder().encode(SECRET));
}

// Collects frames as they arrive so tests never miss the message-event
// race (e.g. auth_required can fire before a `.once('message', ...)`
// listener is attached). Each helper drains in FIFO order.
interface FrameCollector {
  next(): Promise<Record<string, unknown>>;
}

function collectFrames(ws: WebSocket): FrameCollector {
  const buffered: Record<string, unknown>[] = [];
  const waiters: Array<(f: Record<string, unknown>) => void> = [];
  ws.on('message', (raw) => {
    const frame = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(frame); else buffered.push(frame);
  });
  return {
    next() {
      return new Promise((resolve) => {
        const frame = buffered.shift();
        if (frame) resolve(frame); else waiters.push(resolve);
      });
    },
  };
}

afterEach(async () => {
  if (server) {
    await server.stop('test cleanup').catch(() => { /* ignore */ });
    server = null;
  }
});

describe('WFE3-02: server integration — happy path', () => {
  it('walks a client through the full auth → subscribe → event flow', async () => {
    const url = await startServer();
    const token = await mintToken({ sub: 'user-1', roles: ['user'] });
    const client = new WebSocket(url);
    const frames = collectFrames(client);
    await new Promise<void>((resolve) => client.once('open', () => resolve()));

    expect(await frames.next()).toEqual({ type: 'auth_required' });

    client.send(JSON.stringify({ type: 'auth', token }));
    expect(await frames.next()).toMatchObject({ type: 'auth_ok', userId: 'user-1' });

    client.send(JSON.stringify({ type: 'subscribe', topic: 'workflow/42' }));
    expect(await frames.next()).toEqual({ type: 'subscribe_ok', topic: 'workflow/42' });

    server!.publish({
      type: 'event',
      topic: 'workflow/42',
      eventId: 'evt-1',
      timestamp: new Date().toISOString(),
      data: { step: 's1' },
    });
    expect(await frames.next()).toMatchObject({ type: 'event', topic: 'workflow/42', eventId: 'evt-1' });

    client.close();
    await new Promise<void>((resolve) => client.once('close', () => resolve()));
  }, 10_000);

  it('rejects a bogus token and closes with 4001', async () => {
    const url = await startServer();
    const client = new WebSocket(url);
    const frames = collectFrames(client);
    await new Promise<void>((resolve) => client.once('open', () => resolve()));
    expect(await frames.next()).toEqual({ type: 'auth_required' });
    client.send(JSON.stringify({ type: 'auth', token: 'not-a-jwt' }));
    const closeInfo = await new Promise<{ code: number }>((resolve) => {
      client.once('close', (code) => resolve({ code }));
    });
    expect(closeInfo.code).toBe(4001);
  }, 10_000);

  it('exposes /health endpoint returning 200 for Railway health-check', async () => {
    const url = await startServer();
    // ws url → http url
    const httpUrl = url.replace('ws://', 'http://') + '/health';
    const res = await fetch(httpUrl);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  }, 10_000);

  it('rejects subscribe on a forbidden topic with error 403', async () => {
    const url = await startServer();
    const token = await mintToken({ sub: 'user-1' });
    const client = new WebSocket(url);
    const frames = collectFrames(client);
    await new Promise<void>((resolve) => client.once('open', () => resolve()));
    expect(await frames.next()).toEqual({ type: 'auth_required' });
    client.send(JSON.stringify({ type: 'auth', token }));
    expect(await frames.next()).toMatchObject({ type: 'auth_ok' });
    client.send(JSON.stringify({ type: 'subscribe', topic: 'admin/secret' }));
    expect(await frames.next()).toMatchObject({ type: 'error', code: 403, topic: 'admin/secret' });
    client.close();
    await new Promise<void>((resolve) => client.once('close', () => resolve()));
  }, 10_000);
});
