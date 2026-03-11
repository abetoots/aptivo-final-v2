/**
 * AUD-04: DLQ processor
 * @task AUD-04
 * @warning T1-W21 (closes)
 *
 * Inngest function factories for:
 * 1. processAuditEvent — durable audit write with DLQ fallback
 * 2. replayDlqEvents — scheduled DLQ replay with exponential backoff
 *
 * These are function factories — the actual Inngest client and registration
 * happens in the consuming app (apps/web).
 */

import type { Result } from '@aptivo/types';
import type { AuditService, AuditEventInput, AuditRecord, AuditError } from '../types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const BASE_BACKOFF_MS = 1_000; // 1s

/** exponential backoff: 1s * 2^(attempt-1) → 1s, 2s, 4s, 8s, … */
function computeNextRetryAt(attemptCount: number): Date {
  const delayMs = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1);
  return new Date(Date.now() + delayMs);
}

// ---------------------------------------------------------------------------
// interfaces
// ---------------------------------------------------------------------------

/** minimal inngest step tools interface */
export interface InngestStepTools {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/** DLQ store interface — backed by audit_write_dlq table */
export interface DlqStore {
  insert(entry: DlqEntry): Promise<void>;
  getPending(limit: number): Promise<DlqEntry[]>;
  markRetrying(id: string): Promise<void>;
  markExhausted(id: string): Promise<void>;
  markReplayed(id: string): Promise<void>;
  incrementAttempt(id: string, nextRetryAt?: Date): Promise<void>;
}

export interface DlqEntry {
  id?: string;
  payload: AuditEventInput;
  error: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  status: 'pending' | 'retrying' | 'exhausted' | 'replayed';
}

export interface AuditEventData {
  data: AuditEventInput;
}

// ---------------------------------------------------------------------------
// processAuditEvent — durable audit write
// ---------------------------------------------------------------------------

/**
 * Creates the Inngest function handler for processing audit events.
 *
 * On failure after all Inngest retries, persists to DLQ.
 */
export function createProcessAuditEvent(
  auditService: AuditService,
  dlqStore: DlqStore,
  options?: { maxAttempts?: number },
) {
  const maxAttempts = options?.maxAttempts ?? 3;

  return async function processAuditEvent(
    event: AuditEventData,
    step: InngestStepTools,
  ): Promise<Result<AuditRecord, AuditError> | { dlq: true }> {
    const auditEvent = event.data;

    // write audit event as a durable step
    const result = await step.run('write-audit', () =>
      auditService.emit(auditEvent),
    );

    if (result.ok) {
      return result;
    }

    // write failed — persist to DLQ
    await step.run('persist-dlq', async () => {
      await dlqStore.insert({
        payload: auditEvent,
        error: result.error._tag + ': ' + ('message' in result.error ? result.error.message : 'unknown'),
        attemptCount: 1,
        maxAttempts,
        nextRetryAt: computeNextRetryAt(1),
        status: 'pending',
      });
    });

    return { dlq: true };
  };
}

// ---------------------------------------------------------------------------
// replayDlqEvents — scheduled DLQ replay
// ---------------------------------------------------------------------------

/**
 * Creates the Inngest function handler for replaying DLQ entries.
 *
 * Processes pending entries with exponential backoff.
 * Entries exceeding maxAttempts are marked as 'exhausted'.
 */
export function createReplayDlqEvents(
  auditService: AuditService,
  dlqStore: DlqStore,
  options?: { batchSize?: number },
) {
  const batchSize = options?.batchSize ?? 10;

  return async function replayDlqEvents(
    step: InngestStepTools,
  ): Promise<{ processed: number; exhausted: number }> {
    const entries = await step.run('fetch-pending', () =>
      dlqStore.getPending(batchSize),
    );

    let processed = 0;
    let exhausted = 0;

    const now = new Date();

    for (const entry of entries) {
      if (entry.attemptCount >= entry.maxAttempts) {
        await step.run(`exhaust-${entry.id}`, () =>
          dlqStore.markExhausted(entry.id!),
        );
        exhausted++;
        continue;
      }

      // skip entries not yet due for retry
      if (entry.nextRetryAt && entry.nextRetryAt > now) {
        continue;
      }

      await step.run(`retry-${entry.id}`, async () => {
        await dlqStore.markRetrying(entry.id!);
        const result = await auditService.emit(entry.payload);

        if (result.ok) {
          await dlqStore.markReplayed(entry.id!);
        } else {
          const nextAttempt = entry.attemptCount + 1;
          await dlqStore.incrementAttempt(entry.id!, computeNextRetryAt(nextAttempt));
        }

        return result.ok;
      });

      processed++;
    }

    return { processed, exhausted };
  };
}
