/**
 * MCP-10: Data deletion workflow
 * @task MCP-10
 *
 * GDPR/data deletion with per-step checkpointing.
 * Each step runs independently — partial failure records
 * which steps completed for manual resume.
 *
 * Pure step execution logic (no Inngest dependency).
 * The Inngest function wrapping happens in the consuming app.
 */

import type {
  DeletionCheckpoint,
  DeletionDeps,
  DeletionResult,
  DeletionStep,
} from './workflow-types.js';

/**
 * Execute a single deletion step with error capture.
 * Never throws — returns a checkpoint with status.
 */
export async function executeDeletionStep(
  step: DeletionStep,
  fn: () => Promise<unknown>,
): Promise<DeletionCheckpoint> {
  try {
    await fn();
    return { step, status: 'completed' };
  } catch (err) {
    return {
      step,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute the full deletion pipeline for a user.
 *
 * Runs all steps sequentially. If a step fails, subsequent
 * steps are skipped (fail-fast). Returns checkpoints for
 * all attempted + skipped steps.
 */
export async function executeDataDeletion(
  userId: string,
  deps: DeletionDeps,
): Promise<DeletionResult> {
  const steps: Array<{ step: DeletionStep; fn: () => Promise<unknown> }> = [
    { step: 'db-records', fn: () => deps.deleteDbRecords(userId) },
    { step: 's3-files', fn: () => deps.deleteS3Files(userId) },
    { step: 'audit-masking', fn: () => deps.maskAuditEntries(userId) },
  ];

  const checkpoints: DeletionCheckpoint[] = [];
  let failed = false;

  for (const { step, fn } of steps) {
    if (failed) {
      checkpoints.push({ step, status: 'skipped' });
      continue;
    }

    const checkpoint = await executeDeletionStep(step, fn);
    checkpoints.push(checkpoint);

    if (checkpoint.status === 'failed') {
      failed = true;
    }
  }

  const allCompleted = checkpoints.every((c) => c.status === 'completed');

  return {
    userId,
    checkpoints,
    completedAt: allCompleted ? new Date().toISOString() : undefined,
  };
}
