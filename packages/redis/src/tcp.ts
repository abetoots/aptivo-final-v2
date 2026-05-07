/**
 * S18-A2: ioredis-backed `WsRedisClient`.
 *
 * `ioredis` is declared as an `optionalDependency` in package.json
 * because:
 *   1. The package is meant to ship even in environments that haven't
 *      provisioned TCP Redis (Upstash REST-only deployments retain the
 *      S17 list+polling path).
 *   2. The in-memory stub is a fully-functional alternative for tests
 *      and local development.
 *
 * Loading via `await import('ioredis')` defers the dependency check
 * to first call. If `ioredis` isn't installed, the factory throws with
 * a specific error message pointing at the install command.
 *
 * The factory is `createTcpRedis(opts)`; on success it returns a
 * `WsRedisClient` whose methods translate directly into the matching
 * ioredis call.
 */

import type {
  StreamEntry,
  StreamReadResult,
  WsRedisClient,
  TcpRedisOptions,
} from './types.js';

/**
 * Build a TCP-Redis client from `ioredis`. Throws with a clear error
 * if `ioredis` isn't installed in the environment.
 *
 * Why dynamic import: `ioredis` is an optional dependency. A static
 * `import { Redis } from 'ioredis'` at the top of this file would
 * crash on load in environments that never provisioned the dep —
 * including unit tests in apps that haven't enabled the streams path.
 */
export async function createTcpRedis(opts: TcpRedisOptions): Promise<WsRedisClient> {
  let RedisCtor: new (...args: unknown[]) => unknown;
  try {
    // ESM dynamic import — see S17 ws-server bootstrap for the
    // pattern. The `as` cast keeps the load lazy without leaking the
    // ioredis types into the public API of @aptivo/redis.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('ioredis')) as any;
    RedisCtor = mod.Redis ?? mod.default;
  } catch (cause) {
    throw new Error(
      `@aptivo/redis: createTcpRedis requires the 'ioredis' optional dependency. ` +
      `Install it where the streams path is enabled: pnpm add ioredis. ` +
      `Original error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const client = new RedisCtor(opts.url, {
    connectionName: opts.connectionName ?? 'aptivo-ws-server',
    retryStrategy:
      opts.retryStrategy ??
      ((attempts: number) => Math.min(attempts * 200, 5000)),
    // ioredis lazyConnect avoids a connection on construction so
    // tests that mock the client don't accidentally fire a real
    // connection attempt
    lazyConnect: false,
    // we manage shutdown explicitly via disconnect()
    enableOfflineQueue: true,
  }) as IoRedisLike;

  return wrapIoRedis(client);
}

// ---------------------------------------------------------------------------
// shape we depend on from ioredis — kept narrow so we don't leak the
// full ioredis type surface into our public API
// ---------------------------------------------------------------------------

interface IoRedisLike {
  xadd(...args: unknown[]): Promise<string | null>;
  xgroup(subcommand: string, ...args: unknown[]): Promise<unknown>;
  xreadgroup(...args: unknown[]): Promise<unknown>;
  set(key: string, value: string, ...args: unknown[]): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  quit(): Promise<unknown>;
  disconnect(): void;
}

// ---------------------------------------------------------------------------
// wrapper translating WsRedisClient -> ioredis call shapes
// ---------------------------------------------------------------------------

function wrapIoRedis(client: IoRedisLike): WsRedisClient {
  return {
    async xadd(stream, fields, options) {
      const args: unknown[] = [stream];
      if (options?.maxLen !== undefined) {
        // approximate trim per AD-S18-2: `MAXLEN ~ <n>`
        args.push('MAXLEN', '~', options.maxLen);
      }
      args.push('*'); // auto-assign id
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v);
      }
      const id = await client.xadd(...args);
      // ioredis returns null only when the maxlen evicts the new entry;
      // shouldn't happen for our usage but defensive
      if (id === null) {
        throw new Error(`xadd to ${stream} returned null id`);
      }
      return id;
    },

    async xgroupCreate(stream, group, startId = '$') {
      try {
        await client.xgroup('CREATE', stream, group, startId, 'MKSTREAM');
      } catch (cause) {
        // BUSYGROUP = group already exists; idempotent so swallow
        const msg = cause instanceof Error ? cause.message : String(cause);
        if (msg.includes('BUSYGROUP')) return;
        throw cause;
      }
    },

    async xgroupDelete(stream, group) {
      // returns 1 on delete, 0 on not-found; either is fine
      await client.xgroup('DESTROY', stream, group);
    },

    async xreadgroup(stream, group, consumer, options) {
      const count = options?.count ?? 32;
      const blockMs = options?.blockMs ?? 100;
      const noAck = options?.noAck ?? false;
      // XREADGROUP GROUP <group> <consumer> COUNT <n> BLOCK <ms> [NOACK] STREAMS <stream> >
      // NOACK is required for at-most-once consumers (per AD-S18-2);
      // without it the PEL grows unbounded for healthy groups even
      // though we never call XACK.
      const args: unknown[] = [
        'GROUP', group, consumer,
        'COUNT', count,
        'BLOCK', blockMs,
      ];
      if (noAck) args.push('NOACK');
      args.push('STREAMS', stream, '>');
      const result = await client.xreadgroup(...args);

      if (result === null || !Array.isArray(result) || result.length === 0) {
        return null;
      }

      // ioredis shape:
      //   [ [ streamName, [ [ entryId, [field, value, field, value, ...] ], ... ] ] ]
      const [streamRecord] = result as [[string, unknown[]]];
      if (!Array.isArray(streamRecord) || streamRecord.length < 2) return null;
      const [streamName, entryList] = streamRecord;
      if (!Array.isArray(entryList)) return null;

      const entries: StreamEntry[] = [];
      for (const entry of entryList) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [id, fieldArr] = entry as [string, unknown[]];
        const data: Record<string, string> = {};
        if (Array.isArray(fieldArr)) {
          for (let i = 0; i + 1 < fieldArr.length; i += 2) {
            const k = fieldArr[i];
            const v = fieldArr[i + 1];
            if (typeof k === 'string' && typeof v === 'string') {
              data[k] = v;
            }
          }
        }
        entries.push({ id, data });
      }

      return {
        stream: typeof streamName === 'string' ? streamName : stream,
        entries,
      } satisfies StreamReadResult;
    },

    async set(key, value, options) {
      const args: unknown[] = [];
      if (options?.expirySeconds !== undefined) {
        args.push('EX', options.expirySeconds);
      }
      if (options?.onlyIfNotExists) {
        args.push('NX');
      }
      const result = await client.set(key, value, ...args);
      // ioredis returns 'OK' on success, null when NX failed
      return result === 'OK';
    },

    async get(key) {
      return client.get(key);
    },

    async del(key) {
      return client.del(key);
    },

    async disconnect() {
      try {
        await client.quit();
      } catch {
        // forced disconnect if quit hangs
        client.disconnect();
      }
    },
  };
}
