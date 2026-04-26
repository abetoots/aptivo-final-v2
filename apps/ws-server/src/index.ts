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
 */

import { createWsServer } from './server.js';
import { createRedisSubscriber, type RedisSubscriber, type WsSubscriberRedis } from './redis-subscriber.js';

export { createWsServer } from './server.js';
export type { WsServer, ServerConfig } from './server.js';
export { verifyWsToken } from './auth.js';
export { createRedisSubscriber } from './redis-subscriber.js';
export type { RedisSubscriber, RedisSubscriberDeps, WsSubscriberRedis } from './redis-subscriber.js';

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
    const subscriber = await buildRedisSubscriber(server);
    if (subscriber) {
      subscriber.start();
      // eslint-disable-next-line no-console
      console.log('[ws-server] redis subscriber started');
    } else {
      // eslint-disable-next-line no-console
      console.log('[ws-server] redis subscriber disabled (WS_REDIS_URL/TOKEN not set or @upstash/redis missing)');
    }

    const shutdown = async (signal: string) => {
      // eslint-disable-next-line no-console
      console.log(`[ws-server] received ${signal}, stopping`);
      if (subscriber) await subscriber.stop();
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
