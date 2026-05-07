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
import { createDedupeStore, type DedupeStore } from './redis-dedupe-store.js';
import type { WsRedisClient } from '@aptivo/redis';

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
  dedupeStore?: DedupeStore,
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
    // dual-mode cross-transport dedupe — same DedupeStore as the
    // streams subscriber so events arriving via either path collapse
    // to one fan-out. In list-only mode this is undefined and the
    // subscriber relies on its in-process ring alone.
    dedupeStore,
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
interface StreamsResources {
  readonly redis: WsRedisClient;
  readonly dedupeStore: DedupeStore;
  readonly subscriber: StreamsSubscriber;
}

/**
 * Boots the TCP-Redis client + DedupeStore + StreamsSubscriber as one
 * unit so dual-mode bootstrap can pass the SAME `dedupeStore` to the
 * list subscriber. Returns null when streams are not configured.
 *
 * Fail-fast policy (post-A2 round-1 review): when the caller requires
 * streams (mode='streams' or 'dual') but the TCP URL is missing or the
 * client cannot connect, this throws — the caller exits the process.
 * Silent fallback to list-only would mean WS fan-out goes dark in
 * production; better to crash the deploy than ship a broken cluster.
 */
async function buildStreamsResources(
  server: ReturnType<typeof createWsServer>,
  required: boolean,
): Promise<StreamsResources | null> {
  const tcpUrl = process.env.WS_REDIS_TCP_URL;
  if (!tcpUrl) {
    if (required) {
      throw new Error(
        'WS_TRANSPORT_MODE requires the streams transport but WS_REDIS_TCP_URL is missing. ' +
        'Provision TCP Redis and set WS_REDIS_TCP_URL, or run with WS_TRANSPORT_MODE=list.',
      );
    }
    return null;
  }

  const instanceId = process.env.WS_INSTANCE_ID;
  if (!instanceId || instanceId.trim() === '') {
    // fatal even outside `required` because once tcp URL is set we
    // intend to run streams; partitioning traffic across instances is
    // worse than crashing the deploy.
    throw new Error(
      'WS_REDIS_TCP_URL is set but WS_INSTANCE_ID is missing or empty. ' +
      'Per-instance consumer groups require a unique instance id; refusing to start ' +
      'the streams subscriber to avoid partitioning traffic across instances (AD-S18-2).',
    );
  }

  // dynamic import via @aptivo/redis — that package handles the
  // ioredis-vs-not-installed branching internally.
  const { createTcpRedis } = await import('@aptivo/redis');
  const redis = await createTcpRedis({
    url: tcpUrl,
    connectionName: `aptivo-ws-server-${instanceId}`,
  });

  const dedupeStore = createDedupeStore(redis, {
    // post-A2 R2: dedupe key MUST be per-instance — global per-eventId
    // would have one instance suppress all the others' publishes,
    // breaking AD-S18-2 broadcast.
    instanceId,
    logger: {
      // eslint-disable-next-line no-console
      warn: (event, ctx) => console.warn(`[ws-server] ${event}`, ctx ?? {}),
    },
  });

  const subscriber = createStreamsSubscriber({
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

  return { redis, dedupeStore, subscriber };
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

    // S18-A2 streams resources first — when mode is 'streams' or
    // 'dual' the TCP-Redis-backed DedupeStore is the single source of
    // truth for cross-transport dedupe. Build it here so the list
    // subscriber can share it.
    const streamsRequired = mode === 'streams' || mode === 'dual';
    const streamsResources = streamsRequired
      ? await buildStreamsResources(server, streamsRequired)
      : null;

    // S17 list subscriber — runs when mode is 'list' or 'dual'.
    // In 'dual' mode the streams resources MUST be present (we throw
    // above when they're not), so passing the shared dedupeStore is
    // safe. In 'list' mode the dedupeStore is undefined and the
    // subscriber falls back to its in-process ring alone.
    let listSubscriber: RedisSubscriber | null = null;
    if (mode === 'list' || mode === 'dual') {
      const sharedDedupe = mode === 'dual' ? streamsResources?.dedupeStore : undefined;
      listSubscriber = await buildRedisSubscriber(server, sharedDedupe);
      if (listSubscriber) {
        listSubscriber.start();
        // eslint-disable-next-line no-console
        console.log(
          `[ws-server] list subscriber started (cross-transport dedupe: ${sharedDedupe ? 'shared' : 'local-only'})`,
        );
      } else if (mode === 'dual') {
        // dual mode requires both transports — list missing here means
        // ops set MODE=dual but didn't provision Upstash. Fail loudly.
        throw new Error(
          'WS_TRANSPORT_MODE=dual requires both transports but WS_REDIS_URL/WS_REDIS_TOKEN are missing. ' +
          'Set the Upstash credentials or switch to MODE=streams for streams-only.',
        );
      } else {
        // eslint-disable-next-line no-console
        console.log('[ws-server] list subscriber disabled (WS_REDIS_URL/TOKEN missing)');
      }
    }

    if (streamsResources) {
      await streamsResources.subscriber.start();
      // eslint-disable-next-line no-console
      console.log('[ws-server] streams subscriber started');
    } else if (mode === 'streams') {
      // unreachable — buildStreamsResources(server, true) throws if
      // streams aren't available. Defensive log only.
      // eslint-disable-next-line no-console
      console.error('[ws-server] streams mode requested but resources missing — bug in bootstrap');
      process.exit(1);
    }

    const shutdown = async (signal: string) => {
      // eslint-disable-next-line no-console
      console.log(`[ws-server] received ${signal}, stopping`);
      if (listSubscriber) await listSubscriber.stop();
      if (streamsResources) {
        await streamsResources.subscriber.stop();
        await streamsResources.redis.disconnect();
      }
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
