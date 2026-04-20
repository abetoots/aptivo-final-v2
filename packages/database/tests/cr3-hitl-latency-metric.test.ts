/**
 * CR-3: HITL latency metric must measure notification delivery time,
 * not human resolution time.
 *
 * Source-of-truth: BRD §5.1 SLO — "HITL notification delivery P95 < 10s".
 *
 * The getHitlP95LatencyMs query must:
 *   1. Query the notification_deliveries table (not hitl_requests)
 *   2. Filter by templateSlug = 'hitl-approval-request'
 *   3. Filter by status = 'delivered' (or delivered_at IS NOT NULL)
 *   4. Compute percentile over (delivered_at - created_at) ms
 *
 * The prior implementation queried hitl_requests and measured
 * (resolved_at - created_at), which is human decision time, not
 * delivery time. Human decisions can take hours → P95 alert fires constantly.
 */

import { describe, it, expect } from 'vitest';
import { createMetricQueries } from '../src/adapters/metric-queries.js';
import { notificationDeliveries } from '../src/schema/notifications.js';
import { hitlRequests } from '../src/schema/hitl-requests.js';
import type { DrizzleClient } from '../src/adapters/types.js';

interface FromCall {
  table: unknown;
}

function createMockDb(returnRows: Array<{ p95: number }>) {
  const fromCalls: FromCall[] = [];

  const db = {
    _fromCalls: fromCalls,
    select(_fields: unknown) {
      return {
        from(table: unknown) {
          fromCalls.push({ table });
          return {
            where(_condition: unknown) {
              return Promise.resolve(returnRows);
            },
          };
        },
      };
    },
  };

  return db as unknown as DrizzleClient & { _fromCalls: FromCall[] };
}

describe('CR-3: getHitlP95LatencyMs measures notification delivery time', () => {
  it('queries the notification_deliveries table, not hitl_requests', async () => {
    const db = createMockDb([{ p95: 1500 }]);
    const queries = createMetricQueries(db);

    await queries.getHitlP95LatencyMs(5 * 60 * 1000);

    expect(db._fromCalls).toHaveLength(1);
    // must select FROM notification_deliveries
    expect(db._fromCalls[0]?.table).toBe(notificationDeliveries);
    // must NOT select FROM hitl_requests
    expect(db._fromCalls[0]?.table).not.toBe(hitlRequests);
  });

  it('returns the P95 value from the query result', async () => {
    const db = createMockDb([{ p95: 7500 }]);
    const queries = createMetricQueries(db);

    const result = await queries.getHitlP95LatencyMs(5 * 60 * 1000);

    expect(result).toBe(7500);
  });

  it('returns 0 when there are no delivered notifications in the window', async () => {
    const db = createMockDb([]);
    const queries = createMetricQueries(db);

    const result = await queries.getHitlP95LatencyMs(5 * 60 * 1000);

    expect(result).toBe(0);
  });
});
