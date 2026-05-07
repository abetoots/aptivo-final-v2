/**
 * S18-A2: in-memory `WsRedisClient` stub.
 *
 * Intent: lets the streams publisher + subscriber + dedupe ring
 * operate end-to-end in tests + local development without needing a
 * real TCP Redis instance. The semantics mirror Redis behaviour for
 * the operations the ws-server uses:
 *
 *   - Stream entries are kept in an array; `xadd` appends, `xreadgroup`
 *     reads from each group's cursor (last-delivered ID).
 *   - Per-group cursors are tracked separately so two consumer groups
 *     reading the same stream BOTH see every entry — true broadcast
 *     fan-out, matching the per-instance-consumer-group design from
 *     AD-S18-2.
 *   - `set` with `onlyIfNotExists` mimics `SET NX`: returns `false`
 *     on a duplicate key (keeps the original value).
 *   - TTL expiry is checked lazily on read — sufficient for test
 *     fixtures; production uses real Redis with proper expiry.
 *
 * Caveats vs real Redis:
 *   - No persistence. Restarting the stub clears all streams.
 *   - `xreadgroup` BLOCK is approximated with a timeout-Promise; on
 *     timeout returns `null` (consumer treats as "no new entries").
 *   - Stream IDs are simple monotonic integers, not Redis's
 *     `<ms>-<seq>` shape. Consumers shouldn't parse the ID format —
 *     it's an opaque cursor.
 *   - MAXLEN approximate trim is implemented as exact trim; the
 *     `~` flag is a Redis perf optimization that's irrelevant
 *     in-memory.
 */

import type {
  StreamEntry,
  StreamReadResult,
  WsRedisClient,
} from './types.js';

interface StoredStream {
  /** entries in order; never gets reordered (consumer cursors point at indices) */
  entries: { id: string; data: Record<string, string> }[];
  /** monotonic counter for entry IDs — opaque cursor per AD-S18-2 */
  nextSeq: number;
  /**
   * group → last-delivered-entry-index map. -1 means "from $", i.e. no historical entries.
   * Cursors are absolute indices into `entries`; on MAXLEN trim we shift them down by the
   * trim count so a trim doesn't skip undelivered entries for any group (Codex+Gemini A2 R1).
   */
  groupCursors: Map<string, number>;
  /**
   * Per-group delivered-but-unacked count. Real Redis tracks the
   * Pending Entry List per (stream, group); we model only the count
   * because the streams subscriber uses NOACK so the PEL is always
   * empty in production. This counter lets future tests assert that a
   * subscriber configured WITHOUT NOACK + WITHOUT XACK calls accumulates
   * pending entries (the bug that motivated the AD-S18-2 round-1 fix).
   */
  groupPel: Map<string, number>;
}

interface StoredKey {
  value: string;
  /** absolute expiry timestamp (ms epoch); undefined = no expiry */
  expiresAt?: number;
}

export interface InMemoryWsRedisOptions {
  /**
   * Optional clock injection for deterministic TTL tests. Defaults
   * to `Date.now()`.
   */
  readonly now?: () => number;
}

export interface InMemoryWsRedis extends WsRedisClient {
  /** Test-only inspection: how many entries are in `stream`? */
  _streamLength(stream: string): number;
  /** Test-only inspection: how many groups exist on `stream`? */
  _groupCount(stream: string): number;
  /** Test-only inspection: pending key count (post-expiry filter). */
  _keyCount(): number;
  /**
   * Test-only inspection: how many entries are pending (delivered but
   * not yet acked) for `(stream, group)`? Always 0 when consumers
   * pass `noAck: true`. Lets tests assert that omitting NOACK without
   * an XACK path causes unbounded growth.
   */
  _pendingEntryCount(stream: string, group: string): number;
}

export function createInMemoryWsRedis(opts: InMemoryWsRedisOptions = {}): InMemoryWsRedis {
  const streams = new Map<string, StoredStream>();
  const keys = new Map<string, StoredKey>();
  const now = opts.now ?? (() => Date.now());

  function getOrCreateStream(name: string): StoredStream {
    let s = streams.get(name);
    if (!s) {
      s = {
        entries: [],
        nextSeq: 1,
        groupCursors: new Map(),
        groupPel: new Map(),
      };
      streams.set(name, s);
    }
    return s;
  }

  function isExpired(stored: StoredKey): boolean {
    return stored.expiresAt !== undefined && now() >= stored.expiresAt;
  }

  return {
    async xadd(stream, fields, options) {
      const s = getOrCreateStream(stream);
      const id = String(s.nextSeq++);
      s.entries.push({ id, data: { ...fields } });

      // approximate-trim — exact in-memory because the ~ flag is a
      // perf optimization that doesn't apply here
      if (options?.maxLen !== undefined && s.entries.length > options.maxLen) {
        const trimCount = s.entries.length - options.maxLen;
        s.entries.splice(0, trimCount);
        // shift per-group cursors down by trimCount so the cursor still
        // points at the same logical entry post-trim (or clamps to -1
        // when the entry it pointed to was trimmed off the head).
        // Without this fix MAXLEN evictions could skip undelivered
        // entries for any group whose cursor was inside the trim window
        // (Codex+Gemini A2 R1).
        for (const [group, cursor] of s.groupCursors) {
          s.groupCursors.set(group, Math.max(-1, cursor - trimCount));
        }
      }
      return id;
    },

    async xgroupCreate(stream, group, startId = '$') {
      const s = getOrCreateStream(stream);
      // idempotent — re-create returns silently per the AD-S18-2 contract
      if (s.groupCursors.has(group)) return;
      // '$' means "deliver only entries added AFTER this point"; record
      // the current end-of-stream as the cursor
      // '0' means "deliver from the beginning" (rarely used; here for completeness)
      const cursor = startId === '0' ? -1 : s.entries.length - 1;
      s.groupCursors.set(group, cursor);
      s.groupPel.set(group, 0);
    },

    async xgroupDelete(stream, group) {
      const s = streams.get(stream);
      if (!s) return;
      s.groupCursors.delete(group);
      s.groupPel.delete(group);
    },

    async xreadgroup(stream, group, _consumer, options) {
      const s = streams.get(stream);
      if (!s) {
        // Real Redis errors with NOGROUP when the stream doesn't exist
        // OR when the group doesn't exist on it. The earlier stub
        // returned null which masked group-creation bugs in tests.
        throw new Error(
          `NOGROUP No such key '${stream}' or consumer group '${group}' in XREADGROUP`,
        );
      }
      const cursor = s.groupCursors.get(group);
      if (cursor === undefined) {
        throw new Error(
          `NOGROUP No such key '${stream}' or consumer group '${group}' in XREADGROUP`,
        );
      }
      const count = options?.count ?? 32;
      const blockMs = options?.blockMs ?? 100;
      const noAck = options?.noAck ?? false;

      // entries strictly after the cursor index
      const startIdx = cursor + 1;
      let available = s.entries.slice(startIdx, startIdx + count);

      if (available.length === 0 && blockMs > 0) {
        // simulate BLOCK by waiting blockMs then re-checking once.
        // Tests can override `now()` but blockMs is real wall time —
        // tests typically pass blockMs: 0 to skip the wait.
        await new Promise((resolve) => setTimeout(resolve, Math.min(blockMs, 500)));
        available = s.entries.slice(startIdx, startIdx + count);
      }
      if (available.length === 0) return null;

      s.groupCursors.set(group, startIdx + available.length - 1);
      // PEL semantics: without NOACK, every delivered entry is added
      // to the per-group pending list. Real callers must XACK to
      // remove. With NOACK Redis skips the PEL entirely.
      if (!noAck) {
        s.groupPel.set(group, (s.groupPel.get(group) ?? 0) + available.length);
      }
      return {
        stream,
        entries: available.map((e): StreamEntry => ({ id: e.id, data: { ...e.data } })),
      } satisfies StreamReadResult;
    },

    async set(key, value, options) {
      const existing = keys.get(key);
      if (options?.onlyIfNotExists && existing && !isExpired(existing)) {
        return false;
      }
      const stored: StoredKey = { value };
      if (options?.expirySeconds !== undefined) {
        stored.expiresAt = now() + options.expirySeconds * 1000;
      }
      keys.set(key, stored);
      return true;
    },

    async get(key) {
      const stored = keys.get(key);
      if (!stored) return null;
      if (isExpired(stored)) {
        keys.delete(key);
        return null;
      }
      return stored.value;
    },

    async del(key) {
      const had = keys.has(key);
      keys.delete(key);
      return had ? 1 : 0;
    },

    async disconnect() {
      // no-op for in-memory
    },

    _streamLength(stream) {
      return streams.get(stream)?.entries.length ?? 0;
    },

    _groupCount(stream) {
      return streams.get(stream)?.groupCursors.size ?? 0;
    },

    _keyCount() {
      // active (non-expired) keys
      let count = 0;
      for (const stored of keys.values()) {
        if (!isExpired(stored)) count++;
      }
      return count;
    },

    _pendingEntryCount(stream, group) {
      const s = streams.get(stream);
      if (!s) return 0;
      return s.groupPel.get(group) ?? 0;
    },
  };
}
