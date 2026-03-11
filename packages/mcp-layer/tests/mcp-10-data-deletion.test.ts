/**
 * @testcase MCP-10-DD-001 through MCP-10-DD-010
 * @task MCP-10
 * @warning S4-W9 (closes)
 *
 * Tests the data deletion workflow:
 * - Full successful deletion
 * - Partial failure with checkpointing
 * - Step skipping after failure
 * - Individual step execution
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeDataDeletion,
  executeDeletionStep,
} from '../src/workflows/data-deletion.js';
import type { DeletionDeps } from '../src/workflows/workflow-types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createMockDeps(overrides?: Partial<DeletionDeps>): DeletionDeps {
  return {
    deleteDbRecords: vi.fn(async () => ({ deletedCount: 10 })),
    deleteS3Files: vi.fn(async () => ({ deletedCount: 3 })),
    maskAuditEntries: vi.fn(async () => ({ maskedCount: 25 })),
    ...overrides,
  };
}

describe('MCP-10: Data Deletion Workflow', () => {
  // -----------------------------------------------------------------------
  // executeDeletionStep
  // -----------------------------------------------------------------------

  describe('executeDeletionStep', () => {
    it('returns completed checkpoint on success', async () => {
      const checkpoint = await executeDeletionStep(
        'db-records',
        async () => ({ count: 5 }),
      );

      expect(checkpoint.step).toBe('db-records');
      expect(checkpoint.status).toBe('completed');
      expect(checkpoint.error).toBeUndefined();
    });

    it('returns failed checkpoint with error message on failure', async () => {
      const checkpoint = await executeDeletionStep(
        's3-files',
        async () => { throw new Error('S3 connection refused'); },
      );

      expect(checkpoint.step).toBe('s3-files');
      expect(checkpoint.status).toBe('failed');
      expect(checkpoint.error).toBe('S3 connection refused');
    });

    it('handles non-Error throws', async () => {
      const checkpoint = await executeDeletionStep(
        'audit-masking',
        async () => { throw 'string error'; },
      );

      expect(checkpoint.status).toBe('failed');
      expect(checkpoint.error).toBe('string error');
    });
  });

  // -----------------------------------------------------------------------
  // executeDataDeletion — full success
  // -----------------------------------------------------------------------

  describe('full successful deletion', () => {
    it('completes all three steps and sets completedAt', async () => {
      const deps = createMockDeps();
      const result = await executeDataDeletion('user-123', deps);

      expect(result.userId).toBe('user-123');
      expect(result.checkpoints).toHaveLength(3);
      expect(result.checkpoints.every((c) => c.status === 'completed')).toBe(true);
      expect(result.completedAt).toBeTruthy();
    });

    it('calls all dependency functions with userId', async () => {
      const deps = createMockDeps();
      await executeDataDeletion('user-456', deps);

      expect(deps.deleteDbRecords).toHaveBeenCalledWith('user-456');
      expect(deps.deleteS3Files).toHaveBeenCalledWith('user-456');
      expect(deps.maskAuditEntries).toHaveBeenCalledWith('user-456');
    });

    it('executes steps in order: db → s3 → audit', async () => {
      const callOrder: string[] = [];
      const deps: DeletionDeps = {
        deleteDbRecords: vi.fn(async () => { callOrder.push('db'); return { deletedCount: 1 }; }),
        deleteS3Files: vi.fn(async () => { callOrder.push('s3'); return { deletedCount: 1 }; }),
        maskAuditEntries: vi.fn(async () => { callOrder.push('audit'); return { maskedCount: 1 }; }),
      };

      await executeDataDeletion('user-789', deps);
      expect(callOrder).toEqual(['db', 's3', 'audit']);
    });
  });

  // -----------------------------------------------------------------------
  // partial failure
  // -----------------------------------------------------------------------

  describe('partial failure', () => {
    it('records failed step and skips subsequent steps', async () => {
      const deps = createMockDeps({
        deleteS3Files: vi.fn(async () => { throw new Error('S3 timeout'); }),
      });

      const result = await executeDataDeletion('user-123', deps);

      expect(result.checkpoints).toEqual([
        { step: 'db-records', status: 'completed' },
        { step: 's3-files', status: 'failed', error: 'S3 timeout' },
        { step: 'audit-masking', status: 'skipped' },
      ]);
      expect(result.completedAt).toBeUndefined();
    });

    it('does not call subsequent deps after failure', async () => {
      const deps = createMockDeps({
        deleteDbRecords: vi.fn(async () => { throw new Error('DB error'); }),
      });

      await executeDataDeletion('user-123', deps);

      expect(deps.deleteDbRecords).toHaveBeenCalled();
      expect(deps.deleteS3Files).not.toHaveBeenCalled();
      expect(deps.maskAuditEntries).not.toHaveBeenCalled();
    });

    it('records first step failure when DB delete fails', async () => {
      const deps = createMockDeps({
        deleteDbRecords: vi.fn(async () => { throw new Error('constraint violation'); }),
      });

      const result = await executeDataDeletion('user-123', deps);

      expect(result.checkpoints[0]).toEqual({
        step: 'db-records',
        status: 'failed',
        error: 'constraint violation',
      });
      expect(result.checkpoints[1].status).toBe('skipped');
      expect(result.checkpoints[2].status).toBe('skipped');
    });
  });
});
