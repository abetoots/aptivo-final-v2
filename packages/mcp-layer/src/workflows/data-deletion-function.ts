/**
 * CF-04: Data deletion Inngest function wrapper
 * @task CF-04
 * @warning S4-W9 (closes)
 *
 * Wraps executeDataDeletion() in an Inngest function with step.run()
 * calls per deletion step. Enables Inngest checkpoint recovery on
 * partial failure.
 *
 * This module defines the function factory — the actual Inngest client
 * and function registration happens in the consuming app (apps/web).
 */

import { executeDataDeletion } from './data-deletion.js';
import type { DeletionDeps, DeletionResult } from './workflow-types.js';

// ---------------------------------------------------------------------------
// types for inngest integration
// ---------------------------------------------------------------------------

/** minimal inngest function interfaces — compatible with @inngest/inngest */
export interface InngestStepTools {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

export interface DataDeletionEvent {
  data: {
    userId: string;
  };
}

export const DATA_DELETION_EVENT = 'mcp/data.deletion.requested' as const;

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * Creates the Inngest function handler for data deletion.
 *
 * Each deletion step (db-records, s3-files, audit-masking) is wrapped
 * in step.run() for checkpoint recovery. If one step fails, Inngest
 * can retry from that step without re-running completed steps.
 */
export function createDataDeletionHandler(deps: DeletionDeps) {
  return async function handleDataDeletion(
    event: DataDeletionEvent,
    step: InngestStepTools,
  ): Promise<DeletionResult> {
    const { userId } = event.data;

    // wrap each dep in step.run for checkpointing
    const wrappedDeps: DeletionDeps = {
      deleteDbRecords: (uid) =>
        step.run('delete-db-records', () => deps.deleteDbRecords(uid)),
      deleteS3Files: (uid) =>
        step.run('delete-s3-files', () => deps.deleteS3Files(uid)),
      maskAuditEntries: (uid) =>
        step.run('mask-audit-entries', () => deps.maskAuditEntries(uid)),
    };

    return executeDataDeletion(userId, wrappedDeps);
  };
}
