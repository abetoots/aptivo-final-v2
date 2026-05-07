/**
 * S18-A2: shared TCP-Redis client surface for ws-server multi-instance
 * fan-out + cross-transport dedupe.
 *
 * Three operation families:
 *
 *   1. **Streams** (XADD producer / XREADGROUP consumer with
 *      per-instance consumer groups per AD-S18-2). One XADD writes
 *      once; every consumer group reads it independently — broadcast
 *      fan-out.
 *
 *   2. **String/SET** for the cross-transport dedupe ring. During
 *      the `dual` cutover window each ws-server instance receives an
 *      event from BOTH the legacy list+polling path AND the new
 *      streams path — `SET ws:dedupe:<eventId> 1 NX EX 3600`
 *      succeeds for one and fails for the other, so the subscriber
 *      fans out exactly once per eventId.
 *
 *   3. **Group ops** (XGROUP CREATE/DELETE) for per-instance consumer
 *      group lifecycle. Each ws-server instance creates its own
 *      group on boot; orphaned groups (instance crashed without
 *      cleanup) are reaped via the documented runbook procedure
 *      (S19+ hardening).
 *
 * The interface is intentionally narrow — only the operations B1+A2
 * need today. Full ioredis surface is bigger; we don't import it.
 *
 * Why a shared package: the publisher (apps/web) and the subscriber
 * (apps/ws-server) both need this surface. Defining it once here
 * (with parallel real-and-stub impls) prevents drift between the two
 * sides during the dual-write/dual-read cutover.
 */

/**
 * One Redis Streams entry as returned by XREADGROUP. Stream protocol
 * returns `id` (the auto-assigned monotonic ID like '1700000000000-0')
 * and a flat field-value array. We pre-parse the field-value array
 * into a structured `data` object — consumers care about the
 * structured payload, not the on-the-wire shape.
 */
export interface StreamEntry {
  readonly id: string;
  readonly data: Record<string, string>;
}

/**
 * Read result from XREADGROUP. Multiple streams could be read in a
 * single call but ws-server only ever reads one stream
 * (`ws:events`); the array structure mirrors the venue API for
 * forward-compat with multi-stream consumers.
 */
export interface StreamReadResult {
  readonly stream: string;
  readonly entries: readonly StreamEntry[];
}

export interface XAddOptions {
  /**
   * Approximate trim — bounds stream length without forcing exact
   * count on every write. Equivalent to `XADD ws:events MAXLEN ~ N
   * * data...`. Default for ws:events is 50000 per AD-S18-2.
   */
  readonly maxLen?: number;
}

export interface XReadGroupOptions {
  /** Number of entries to read in one batch. Default 32. */
  readonly count?: number;
  /** Block for up to this many milliseconds when the stream is empty. Default 100ms. */
  readonly blockMs?: number;
}

export interface SetOptions {
  /** TTL in seconds; if absent the key is set without expiry. */
  readonly expirySeconds?: number;
  /** When true, only set if the key doesn't already exist (`SET ... NX`). */
  readonly onlyIfNotExists?: boolean;
}

/**
 * The narrow Redis surface ws-server + apps/web share. All methods
 * are async; impls translate into XADD/XREADGROUP/XGROUP/SET/DEL.
 *
 * Note: this is NOT a general-purpose Redis client. If a future
 * caller needs HSET, ZADD, etc., add them here so the in-memory stub
 * + the ioredis impl stay in lockstep.
 */
export interface WsRedisClient {
  /**
   * XADD — append an entry to a stream. Returns the auto-assigned
   * entry ID. The `fields` map is the structured payload; impls
   * flatten it to the alternating field-value array Redis expects.
   */
  xadd(
    stream: string,
    fields: Record<string, string>,
    options?: XAddOptions,
  ): Promise<string>;

  /**
   * XGROUP CREATE — idempotent create of a consumer group on a
   * stream. `MKSTREAM` flag is implicit — the stream is created if
   * it doesn't exist (avoids a chicken-and-egg problem on first
   * boot when no events have been published yet).
   *
   * `startId` defaults to `'$'` (only entries added AFTER group
   * creation are visible to this group) — per AD-S18-2 we don't
   * replay historical events on instance restart.
   */
  xgroupCreate(stream: string, group: string, startId?: string): Promise<void>;

  /**
   * XGROUP DELETE — remove a consumer group. Used by the runbook
   * cleanup procedure for orphaned groups (instance crashed without
   * its own teardown).
   */
  xgroupDelete(stream: string, group: string): Promise<void>;

  /**
   * XREADGROUP — read pending entries for a consumer in a group.
   * Returns an empty `entries` array on timeout (BLOCK expired with
   * no new entries).
   *
   * Per AD-S18-2: each ws-server instance has its OWN consumer
   * group. The `group` argument is `ws-instance-<WS_INSTANCE_ID>`;
   * the `consumer` argument is fixed (`consumer-default`) since
   * within a per-instance group there's only one consumer.
   */
  xreadgroup(
    stream: string,
    group: string,
    consumer: string,
    options?: XReadGroupOptions,
  ): Promise<StreamReadResult | null>;

  /**
   * Generic SET. The `NX` + `EX` combo is what the cross-transport
   * dedupe ring uses: `set('ws:dedupe:<eventId>', '1', { onlyIfNotExists: true,
   * expirySeconds: 3600 })` returns `true` for the first writer and
   * `false` for the duplicate.
   */
  set(key: string, value: string, options?: SetOptions): Promise<boolean>;

  /** GET — used by tests and ops-tooling; not on the hot path. */
  get(key: string): Promise<string | null>;

  /** DEL — used by tests for cleanup. */
  del(key: string): Promise<number>;

  /**
   * Lifecycle hook — flushes any pending operations and disconnects.
   * Called from the ws-server graceful-shutdown path.
   */
  disconnect(): Promise<void>;
}

/**
 * Connection options for `createTcpRedis`. `url` follows the
 * `redis://[:password@]host:port[/db]` schema. Optional TLS hint
 * for `rediss://` connections.
 */
export interface TcpRedisOptions {
  readonly url: string;
  /**
   * Connection name reported to Redis CLIENT INFO. Defaults to
   * `aptivo-ws-server` when called from ws-server; useful for ops
   * to identify which process owns which connection.
   */
  readonly connectionName?: string;
  /**
   * Optional reconnect-strategy override. Default: exponential
   * backoff capped at 5s.
   */
  readonly retryStrategy?: (attempts: number) => number | null;
}
