/**
 * MCP-10: Data deletion workflow types
 * @task MCP-10
 * @warning S4-W9 (closes)
 */

export type DeletionStep = 'db-records' | 's3-files' | 'audit-masking';

export interface DeletionCheckpoint {
  step: DeletionStep;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface DeletionResult {
  userId: string;
  checkpoints: DeletionCheckpoint[];
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// injectable dependencies for each deletion step
// ---------------------------------------------------------------------------

export interface DeletionDeps {
  /** delete user's records from application tables */
  deleteDbRecords(userId: string): Promise<{ deletedCount: number }>;
  /** delete user's files from S3/blob storage */
  deleteS3Files(userId: string): Promise<{ deletedCount: number }>;
  /** mask user-identifying data in audit log entries */
  maskAuditEntries(userId: string): Promise<{ maskedCount: number }>;
}
