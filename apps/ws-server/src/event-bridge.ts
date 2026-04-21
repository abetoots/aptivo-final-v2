/**
 * WFE3-02: in-process event bridge.
 *
 * Tracks connected handlers and fans out published events. Events are
 * stored in the replay buffer first so reconnecting clients can pick up
 * where they left off.
 *
 * S17 target: plug a Redis pub/sub subscriber into `publish()` so events
 * emitted by `apps/web` (via Inngest) reach ws-server instances even
 * when horizontally scaled. For S16 the bridge is in-process only —
 * sufficient for single-instance staging deploys.
 */

import type { EventFrame } from '@aptivo/types';
import type { ConnectionHandler } from './connection-manager.js';
import type { ReplayBuffer } from './replay-buffer.js';

export interface EventBridge {
  attach(conn: ConnectionHandler): void;
  detach(conn: ConnectionHandler): void;
  publish(event: EventFrame): void;
  /** count of attached connections (metrics) */
  connectionCount(): number;
}

export interface EventBridgeDeps {
  readonly replay: ReplayBuffer;
}

export function createEventBridge(deps: EventBridgeDeps): EventBridge {
  const conns = new Set<ConnectionHandler>();

  return {
    attach(conn) {
      conns.add(conn);
    },
    detach(conn) {
      conns.delete(conn);
    },
    publish(event) {
      // persist first so a reconnecting client can resume even if its
      // current connection dropped during the publish
      deps.replay.append({
        topic: event.topic,
        eventId: event.eventId,
        timestamp: event.timestamp,
        data: event.data,
      });
      for (const conn of conns) {
        conn.deliverEvent(event);
      }
    },
    connectionCount() {
      return conns.size;
    },
  };
}
