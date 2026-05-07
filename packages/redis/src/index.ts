/**
 * S18-A2: @aptivo/redis — shared TCP-Redis client surface for
 * ws-server multi-instance fan-out.
 *
 * Two impls behind one interface:
 *   - `createTcpRedis(opts)` — ioredis-backed (production)
 *   - `createInMemoryWsRedis(opts?)` — in-memory stub (tests + local)
 */

export type {
  StreamEntry,
  StreamReadResult,
  WsRedisClient,
  XAddOptions,
  XReadGroupOptions,
  SetOptions,
  TcpRedisOptions,
} from './types.js';

export { createTcpRedis } from './tcp.js';
export { createInMemoryWsRedis } from './in-memory.js';
export type { InMemoryWsRedis, InMemoryWsRedisOptions } from './in-memory.js';
