/**
 * AUD-02: Audit service
 * @task AUD-02
 * @frd FR-CORE-AUD-001
 * @guidelines §2.1 (Functional core — Result types, factory pattern)
 *
 * createAuditService(deps) factory — same pattern as createLlmGateway/createMcpWrapper.
 *
 * Write path:
 * 1. Validate input
 * 2. Mask PII in metadata
 * 3. Lock chain head (SELECT ... FOR UPDATE)
 * 4. Compute hash = sha256(previousHash + eventData)
 * 5. Insert audit log
 * 6. Update chain head
 * 7. Return AuditRecord
 */

import { Result } from '@aptivo/types';
import type {
  AuditEventInput,
  AuditRecord,
  AuditError,
  AuditService,
  AuditServiceDeps,
  AuditStore,
  InsertAuditLog,
} from './types.js';
import { computeAuditHash } from './hashing.js';
import { maskMetadata } from './masking.js';

const GENESIS_HASH = '0'.repeat(64);

export function createAuditService(deps: AuditServiceDeps): AuditService {
  const scope = deps.chainScope ?? 'global';

  // core write path used by both transactional and non-transactional modes
  async function doEmit(
    store: AuditStore,
    event: AuditEventInput,
    maskedMetadata: Record<string, unknown> | null,
  ): Promise<Result<AuditRecord, AuditError>> {
    // 3. lock chain head (serializes concurrent writes)
    const chainHead = await store.lockChainHead(scope);
    const previousHash = chainHead?.lastHash ?? GENESIS_HASH;
    const nextSeq = (chainHead?.lastSeq ?? 0) + 1;

    // 4. compute tamper-evident hash
    const eventData: Record<string, unknown> = {
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      domain: event.domain,
      metadata: maskedMetadata,
      seq: nextSeq,
    };
    const currentHash = computeAuditHash(previousHash, eventData);

    // 5. insert audit log
    const record: InsertAuditLog = {
      userId: event.actor.type === 'user' ? event.actor.id : null,
      actorType: event.actor.type,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      action: event.action,
      resourceType: event.resource.type,
      resourceId: event.resource.id ?? null,
      domain: event.domain ?? null,
      metadata: maskedMetadata,
      previousHash: chainHead ? previousHash : null,
      currentHash,
    };
    const { id } = await store.insert(record);

    // 6. update chain head
    await store.updateChainHead(scope, nextSeq, currentHash);

    // 7. return record
    return Result.ok({
      id,
      previousHash: chainHead ? previousHash : null,
      currentHash,
      sequence: nextSeq,
      timestamp: new Date(),
    });
  }

  return {
    async emit(event: AuditEventInput): Promise<Result<AuditRecord, AuditError>> {
      // 1. validate
      if (!event.actor?.id || !event.action || !event.resource?.type) {
        return Result.err({
          _tag: 'ValidationError',
          message: 'Missing required fields: actor.id, action, resource.type',
        });
      }

      try {
        // 2. mask PII in metadata
        const maskedMetadata = maskMetadata(event.metadata, deps.masking);

        // use transaction if available (drizzle adapters provide withTransaction)
        const store = deps.store as AuditStore & {
          withTransaction?: <T>(fn: (txStore: AuditStore) => Promise<T>) => Promise<T>;
        };

        if (typeof store.withTransaction === 'function') {
          return await store.withTransaction((txStore) =>
            doEmit(txStore, event, maskedMetadata),
          );
        }

        // fallback: sequential calls (in-memory stores, tests)
        return await doEmit(store, event, maskedMetadata);
      } catch (err) {
        deps.logger?.warn('audit emit failed', { error: String(err) });
        return Result.err({
          _tag: 'PersistenceError',
          operation: 'emit',
          cause: err,
        });
      }
    },
  };
}
