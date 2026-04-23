/**
 * INT-W1: Drizzle adapter for AuditStore
 * @task INT-W1
 * @frd FR-CORE-AUD-001
 *
 * implements the AuditStore interface from @aptivo/audit using drizzle-orm
 * against the audit_logs and audit_chain_heads tables.
 *
 * transaction design: the withTransaction() extension wraps
 * lockChainHead → insert → updateChainHead in a single pg transaction.
 */

import { eq, sql } from 'drizzle-orm';
import { formatAnomalyScopeKey, type AuditStore, type ChainHead, type InsertAuditLog } from '@aptivo/audit';
import { auditLogs, auditChainHeads } from '../schema/audit-logs.js';
import type { DrizzleClient } from './types.js';

// ---------------------------------------------------------------------------
// extended store type with transaction support
// ---------------------------------------------------------------------------

export interface TransactionalAuditStore extends AuditStore {
  withTransaction<T>(fn: (store: AuditStore) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * creates a drizzle-backed audit store with transaction support.
 *
 * usage:
 * ```ts
 * const store = createDrizzleAuditStore(db);
 * await store.withTransaction(async (txStore) => {
 *   const head = await txStore.lockChainHead('global');
 *   await txStore.insert(record);
 *   await txStore.updateChainHead('global', 1, hash);
 * });
 * ```
 */
export function createDrizzleAuditStore(db: DrizzleClient): TransactionalAuditStore {
  // helper: build store methods bound to a given client (db or tx)
  function makeStore(client: DrizzleClient): AuditStore {
    return {
      async lockChainHead(scope: string): Promise<ChainHead | null> {
        // use raw sql for SELECT ... FOR UPDATE
        const result = await client.execute(
          sql`SELECT ${auditChainHeads.lastSeq} AS last_seq, ${auditChainHeads.lastHash} AS last_hash
              FROM ${auditChainHeads}
              WHERE ${auditChainHeads.chainScope} = ${scope}
              FOR UPDATE`,
        );

        const rows = result.rows ?? result;
        if (!rows || rows.length === 0) {
          return null;
        }

        const row = rows[0];
        return {
          lastSeq: Number(row.last_seq),
          lastHash: String(row.last_hash),
        };
      },

      async insert(record: InsertAuditLog): Promise<{ id: string }> {
        const rows = await client
          .insert(auditLogs)
          .values({
            userId: record.userId,
            actorType: record.actorType,
            ipAddress: record.ipAddress ?? null,
            userAgent: record.userAgent ?? null,
            action: record.action,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            domain: record.domain ?? null,
            metadata: record.metadata,
            previousHash: record.previousHash,
            currentHash: record.currentHash,
          })
          .returning({ id: auditLogs.id });

        return { id: rows[0]!.id };
      },

      async updateChainHead(scope: string, seq: number, hash: string): Promise<void> {
        // upsert: insert if first time, update if exists
        await client
          .insert(auditChainHeads)
          .values({
            chainScope: scope,
            lastSeq: seq,
            lastHash: hash,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: auditChainHeads.chainScope,
            set: {
              lastSeq: seq,
              lastHash: hash,
              updatedAt: new Date(),
            },
          });
      },

      async aggregateAccessPattern(params: {
        actor: string;
        resourceTypes: readonly string[];
        actions?: readonly string[];
        windowMs: number;
      }) {
        // LLM3-04 + S17-B1: counts recent audit_logs rows for
        // (actor, resourceTypes, actions) over the configured window so
        // the anomaly detector can compare against its baseline. Returns
        // 0-count + empty window when nothing matches so cold-start
        // callers get a valid pattern.
        //
        // resourceTypes is always an IN clause (S17-B1 widened from a
        // singular value because a gateway domain like `hr` maps to
        // multiple audit resource types).
        //
        // `actions`: when provided, only rows whose action is in the list
        // are counted (IN clause). When omitted, all actions are counted
        // — needed because the PII audit middleware emits multiple
        // action variants (pii.read, pii.read.bulk, pii.read.export) and
        // a fixed-string filter would silently miss real events.
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - params.windowMs);

        // empty resourceTypes → no possible match; short-circuit.
        if (params.resourceTypes.length === 0) {
          return {
            actor: params.actor,
            resourceType: '',
            action: params.actions?.join(',') ?? 'any',
            count: 0,
            windowStart,
            windowEnd,
          };
        }

        const actionFilter = params.actions && params.actions.length > 0
          ? sql`AND action = ANY(${params.actions as string[]})`
          : sql``;

        const result = await client.execute(
          sql`SELECT COUNT(*)::int AS count FROM ${auditLogs}
              WHERE user_id = ${params.actor}
                AND resource_type = ANY(${params.resourceTypes as string[]})
                ${actionFilter}
                AND created_at >= ${windowStart}
                AND created_at <= ${windowEnd}`,
        );
        const rows = Array.isArray(result) ? result : (result as { rows: Array<{ count: number }> }).rows;
        const count = rows[0]?.count ?? 0;
        return {
          actor: params.actor,
          // S17-B3: scope key — must equal what the baseline cron
          // writes (apps/web/src/lib/services.ts:getAnomalyBaselineScopes).
          // Centralised in @aptivo/audit so both sides can never drift.
          resourceType: formatAnomalyScopeKey(params.resourceTypes),
          action: params.actions?.join(',') ?? 'any',
          count,
          windowStart,
          windowEnd,
        };
      },
    };
  }

  return {
    ...makeStore(db),

    async withTransaction<T>(fn: (store: AuditStore) => Promise<T>): Promise<T> {
      return db.transaction(async (tx: DrizzleClient) => fn(makeStore(tx)));
    },
  };
}
