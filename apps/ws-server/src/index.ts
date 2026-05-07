/**
 * WFE3-02: ws-server process entry point.
 *
 * Reads config from env, starts the server, and handles SIGTERM / SIGINT
 * by calling the graceful-shutdown path (broadcast reconnect, close
 * sockets, exit).
 *
 * S17-WS-PUB: optionally starts a Redis-list subscriber so events
 * published by apps/web (via Inngest → ws:events) reach this process
 * and fan out via the existing in-process EventBridge.
 *
 * S18-A2: optionally starts a Streams subscriber too, governed by
 * WS_TRANSPORT_MODE env var:
 *   - `list` (default): list subscriber only (S17 back-compat)
 *   - `streams`: streams subscriber only (post-cutover)
 *   - `dual`: BOTH subscribers running, sharing a Redis-SET dedupe
 *     ring so each logical event fans out exactly once
 *
 * Streams transport requires WS_REDIS_TCP_URL pointing at TCP Redis
 * (Railway/DO managed); list transport keeps using the existing
 * WS_REDIS_URL/TOKEN Upstash REST credentials.
 */

import { createWsServer } from './server.js';
import { createRedisSubscriber, type RedisSubscriber, type WsSubscriberRedis } from './redis-subscriber.js';
import { createStreamsSubscriber, type StreamsSubscriber } from './streams-subscriber.js';
import { createDedupeStore } from './redis-dedupe-store.js';

export { createWsServer } from './server.js';
export type { WsServer, ServerConfig } from './server.js';
export { verifyWsToken } from './auth.js';
export { createRedisSubscriber } from './redis-subscriber.js';
export type { RedisSubscriber, RedisSubscriberDeps, WsSubscriberRedis } from './redis-subscriber.js';
export { createStreamsSubscriber } from './streams-subscriber.js';
export type { StreamsSubscriber, StreamsSubscriberDeps } from './streams-subscriber.js';
export { createDedupeStore } from './redis-dedupe-store.js';
export type { DedupeStore } from './redis-dedupe-store.js';

type TransportMode = 'list' | 'dual' | 'streams';

function readTransportMode(): TransportMode {
  const raw = (process.env.WS_TRANSPORT_MODE ?? 'list').toLowerCase();
  if (raw === 'list' || raw === 'dual' || raw === 'streams') return raw;
  // eslint-disable-next-line no-console
  console.warn(`[ws-server] unknown WS_TRANSPORT_MODE='${raw}', defaulting to 'list'`);
  return 'list';
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`[ws-server] missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

/**
 * S17-WS-PUB: builds the optional Redis subscriber. Skipped when
 * WS_REDIS_URL/TOKEN are absent — useful for tests + local dev where
 * the in-process bridge alone is sufficient.
 *
 * Async because `@aptivo/ws-server` is `"type": "module"` and CommonJS
 * `require()` is not defined in plain ESM Node. Multi-model review
 * (S17_WS_PUB_MULTI_REVIEW) caught this — earlier draft used `require`
 * and would have crashed on startup the moment WS_REDIS_URL was set.
 */
async function buildRedisSubscriber(
  server: ReturnType<typeof createWsServer>,
): Promise<RedisSubscriber | null> {
  const url = process.env.WS_REDIS_URL;
  const token = process.env.WS_REDIS_TOKEN;
  if (!url || !token) return null;

  let RedisCtor: new (opts: { url: string; token: string }) => WsSubscriberRedis;
  try {
    // dynamic import via a variable so TypeScript's static module
    // resolution doesn't try to find @upstash/redis at typecheck time
    // — it's an optional dependency and may not be installed.
    const moduleName = '@upstash/redis';
    const mod = (await import(moduleName)) as {
      Redis: new (opts: { url: string; token: string }) => WsSubscriberRedis;
    };
    RedisCtor = mod.Redis;
  } catch (cause) {
    // eslint-disable-next-line no-console
    console.error(
      '[ws-server] WS_REDIS_URL is set but @upstash/redis is not installed; ' +
        'install it as a dependency or unset WS_REDIS_URL. cause=' +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    return null;
  }

  const redis = new RedisCtor({ url, token });
  return createRedisSubscriber({
    redis,
    bridge: server.bridge,
    queueKey: process.env.WS_REDIS_QUEUE_KEY ?? 'ws:events',
    pollIntervalMs: Number(process.env.WS_REDIS_POLL_INTERVAL_MS) || undefined,
    logger: {
      // eslint-disable-next-line no-console
      warn: (event, ctx) => console.warn(`[ws-server] ${event}`, ctx ?? {}),
    },
  });
}

/**
 * S18-A2: builds the streams subscriber. Skipped when
 * WS_REDIS_TCP_URL is absent (mode='list') or when WS_TRANSPORT_MODE
 * is `list`. WS_INSTANCE_ID is required (per-instance group naming);
 * a missing value is fatal because silent default would partition
 * traffic — the AD-S18-2 invariant we're enforcing.
 *
 * Async dynamic import for ioredis matches the Upstash pattern: the
 * dependency is `optionalDependencies` so the package ships in
 * environments that haven't provisioned TCP Redis.
 */
async function buildStreamsSubscriber(
  server: ReturnType<typeof createWsServer>,
): Promise<StreamsSubscriber | null> {
  const tcpUrl = process.env.WS_REDIS_TCP_URL;
  if (!tcpUrl) return null;

  const instanceId = process.env.WS_INSTANCE_ID;
  if (!instanceId || instanceId.trim() === '') {
    // eslint-disable-next-line no-console
    console.error(
      '[ws-server] WS_REDIS_TCP_URL is set but WS_INSTANCE_ID is missing or empty. ' +
      'Per-instance consumer groups require a unique instance id; refusing to start ' +
      'the streams subscriber to avoid partitioning traffic across instances.',
    );
    process.exit(1);
  }

  // dynamic import via @aptivo/redis — that package handles the
  // ioredis-vs-not-installed branching internally.
  const { createTcpRedis } = await import('@aptivo/redis');
  const redis = await createTcpRedis({
    url: tcpUrl,
    connectionName: `aptivo-ws-server-${instanceId}`,
  });

  const dedupeStore = createDedupeStore(redis, {
    logger: {
      // eslint-disable-next-line no-console
      warn: (event, ctx) => console.warn(`[ws-server] ${event}`, ctx ?? {}),
    },
  });

  return createStreamsSubscriber({
    redis,
    dedupeStore,
    bridge: server.bridge,
    instanceId,
    streamName: process.env.WS_STREAM_NAME ?? 'ws:events',
    logger: {
      // eslint-disable-next-line no-console
      warn: (event, ctx) => console.warn(`[ws-server] ${event}`, ctx ?? {}),
      // eslint-disable-next-line no-console
      info: (event, ctx) => console.log(`[ws-server] ${event}`, ctx ?? {}),
    },
  });
}

// only run as a script when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createWsServer({
    port: Number(process.env.WS_PORT) || 3001,
    jwtSecret: requireEnv('WS_JWT_SECRET'),
    jwtIssuer: process.env.WS_JWT_ISSUER ?? 'aptivo-web',
    jwtAudience: process.env.WS_JWT_AUDIENCE ?? 'aptivo-ws',
  });

  // eslint-disable-next-line no-console
  console.log(`[ws-server] listening on port ${process.env.WS_PORT ?? 3001}`);

  const bootstrap = async () => {
    const mode = readTransportMode();
    // eslint-disable-next-line no-console
    console.log(`[ws-server] transport mode: ${mode}`);

    // S17 list subscriber — runs when mode is 'list' or 'dual'
    let listSubscriber: RedisSubscriber | null = null;
    if (mode === 'list' || mode === 'dual') {
      listSubscriber = await buildRedisSubscriber(server);
      if (listSubscriber) {
        listSubscriber.start();
        // eslint-disable-next-line no-console
        console.log('[ws-server] list subscriber started');
      } else {
        // eslint-disable-next-line no-console
        console.log('[ws-server] list subscriber disabled (WS_REDIS_URL/TOKEN missing)');
      }
    }

    // S18-A2 streams subscriber — runs when mode is 'streams' or 'dual'
    let streamsSubscriber: StreamsSubscriber | null = null;
    if (mode === 'streams' || mode === 'dual') {
      streamsSubscriber = await buildStreamsSubscriber(server);
      if (streamsSubscriber) {
        await streamsSubscriber.start();
        // eslint-disable-next-line no-console
        console.log('[ws-server] streams subscriber started');
      } else {
        // eslint-disable-next-line no-console
        console.log('[ws-server] streams subscriber disabled (WS_REDIS_TCP_URL missing)');
      }
    }

    const shutdown = async (signal: string) => {
      // eslint-disable-next-line no-console
      console.log(`[ws-server] received ${signal}, stopping`);
      if (listSubscriber) await listSubscriber.stop();
      if (streamsSubscriber) await streamsSubscriber.stop();
      await server.stop('deployment', 5000);
      process.exit(0);
    };

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  };

  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ws-server] bootstrap failed', err);
    process.exit(1);
  });
}
