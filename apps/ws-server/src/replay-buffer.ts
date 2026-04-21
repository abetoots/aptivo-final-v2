/**
 * WFE3-02: Per-topic replay buffer for WebSocket resume semantics.
 *
 * Each topic holds a bounded ring of recent events; clients reconnecting
 * with `{ type: 'resume', lastEventId }` get every event AFTER that id
 * if it's still in the buffer. If the id is gone (evicted by cap or TTL),
 * the server responds with `full_sync` and the client re-fetches state
 * via REST.
 *
 * In-memory only. Horizontal scaling would require sticky routing or a
 * shared event log — deliberately out of scope for S16.
 */

export interface ReplayEvent {
  readonly topic: string;
  readonly eventId: string;
  readonly timestamp: string; // ISO
  readonly data: unknown;
}

export interface ReplayBufferConfig {
  /** maximum events retained per topic (LRU eviction) */
  readonly maxPerTopic: number;
  /** retention window in ms (events older than this are invisible to readers) */
  readonly ttlMs: number;
  /** injectable clock for tests */
  readonly nowMs?: () => number;
}

export type ReplayResult =
  | { kind: 'events'; events: readonly ReplayEvent[] }
  | { kind: 'full_sync' };

export interface ReplayBuffer {
  append(event: ReplayEvent): void;
  /** returns events strictly after `lastEventId`; full_sync if cursor unknown or outside TTL */
  eventsSince(topic: string, lastEventId: string): ReplayResult;
  /** test hook — drop everything */
  clear(): void;
}

interface TopicRing {
  events: ReplayEvent[]; // in insertion order, oldest first
}

export function createReplayBuffer(config: ReplayBufferConfig): ReplayBuffer {
  const now = config.nowMs ?? Date.now;
  const rings = new Map<string, TopicRing>();

  function prune(ring: TopicRing): ReplayEvent[] {
    const cutoff = now() - config.ttlMs;
    // drop events older than TTL; keep at most maxPerTopic newest
    const live = ring.events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    if (live.length > config.maxPerTopic) {
      return live.slice(live.length - config.maxPerTopic);
    }
    return live;
  }

  return {
    append(event) {
      const ring = rings.get(event.topic) ?? { events: [] };
      ring.events.push(event);
      if (ring.events.length > config.maxPerTopic) {
        ring.events.splice(0, ring.events.length - config.maxPerTopic);
      }
      rings.set(event.topic, ring);
    },

    eventsSince(topic, lastEventId) {
      const ring = rings.get(topic);
      if (!ring) return { kind: 'full_sync' };
      const live = prune(ring);
      // topic-ring housekeeping: if every event has aged out, drop the
      // ring entry so the rings Map doesn't accumulate one entry per
      // unique topic ever published. Flagged by pre-commit review as a
      // memory-leak risk on long-running servers.
      if (live.length === 0) {
        rings.delete(topic);
        return { kind: 'full_sync' };
      }
      ring.events = live;
      const idx = live.findIndex((e) => e.eventId === lastEventId);
      if (idx === -1) return { kind: 'full_sync' };
      return { kind: 'events', events: live.slice(idx + 1) };
    },

    clear() {
      rings.clear();
    },
  };
}
