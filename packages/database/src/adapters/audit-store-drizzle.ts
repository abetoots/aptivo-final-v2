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
import type { AuditStore, ChainHead, InsertAuditLog } from '@aptivo/audit';
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
    };
  }

  return {
    ...makeStore(db),

    async withTransaction<T>(fn: (store: AuditStore) => Promise<T>): Promise<T> {
      return db.transaction(async (tx: DrizzleClient) => fn(makeStore(tx)));
    },
  };
}
