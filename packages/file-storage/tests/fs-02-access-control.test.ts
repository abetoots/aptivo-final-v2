/**
 * @testcase FS-02-AC-001 through FS-02-AC-012
 * @task FS-02
 * @frd FR-CORE-BLOB-002
 *
 * Tests the file access control service:
 * - Happy path download with entity permission
 * - File not found
 * - File not ready (pending, quarantined)
 * - No entity links
 * - Permission denied
 * - Audit logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeDownload } from '../src/access/access-control-service.js';
import type { FileAccessDeps, FileRecord, FileEntityLink } from '../src/access/access-types.js';
import { InMemoryStorageAdapter } from '../src/storage/in-memory-adapter.js';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const testFile: FileRecord = {
  id: 'file-001',
  key: 'uploads/file-001/report.pdf',
  bucket: 'test-bucket',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  status: 'ready',
  uploadedBy: 'user-1',
};

const testLink: FileEntityLink = {
  id: 'link-001',
  fileId: 'file-001',
  entityType: 'project',
  entityId: 'proj-100',
  createdBy: 'user-1',
};

function createTestDeps(overrides?: Partial<FileAccessDeps>): FileAccessDeps {
  const storageAdapter = new InMemoryStorageAdapter();
  // seed storage with a file so presigned download works
  storageAdapter.createPresignedUpload({
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
  });

  return {
    fileStore: {
      getFile: vi.fn(async () => testFile),
      getEntityLinks: vi.fn(async () => [testLink]),
    },
    permissionChecker: {
      canAccessEntity: vi.fn(async () => true),
    },
    auditLogger: {
      logDownload: vi.fn(async () => {}),
    },
    storageAdapter,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('FS-02: Access Control', () => {
  // -----------------------------------------------------------------------
  // happy path
  // -----------------------------------------------------------------------

  describe('happy path', () => {
    it('returns download URL for authorized user', async () => {
      const deps = createTestDeps();
      // seed the key in storage adapter
      const upload = await deps.storageAdapter.createPresignedUpload({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
      if (!upload.ok) throw new Error('setup failed');

      // override fileStore to return matching key
      const file = { ...testFile, key: upload.value.key };
      deps.fileStore = {
        getFile: vi.fn(async () => file),
        getEntityLinks: vi.fn(async () => [testLink]),
      };

      const result = await authorizeDownload('user-1', 'file-001', deps);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.downloadUrl).toBeTruthy();
        expect(result.value.fileName).toBe('report.pdf');
        expect(result.value.mimeType).toBe('application/pdf');
        expect(result.value.expiresAt).toBeTruthy();
      }
    });

    it('calls audit logger on successful download', async () => {
      const deps = createTestDeps();
      const upload = await deps.storageAdapter.createPresignedUpload({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
      if (!upload.ok) throw new Error('setup failed');

      deps.fileStore = {
        getFile: vi.fn(async () => ({ ...testFile, key: upload.value.key })),
        getEntityLinks: vi.fn(async () => [testLink]),
      };

      await authorizeDownload('user-1', 'file-001', deps, '192.168.1.1');

      expect(deps.auditLogger.logDownload).toHaveBeenCalledWith({
        userId: 'user-1',
        fileId: 'file-001',
        ipAddress: '192.168.1.1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // file not found
  // -----------------------------------------------------------------------

  describe('file not found', () => {
    it('returns FileNotFound when file does not exist', async () => {
      const deps = createTestDeps({
        fileStore: {
          getFile: vi.fn(async () => null),
          getEntityLinks: vi.fn(async () => []),
        },
      });

      const result = await authorizeDownload('user-1', 'file-999', deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('FileNotFound');
      }
    });
  });

  // -----------------------------------------------------------------------
  // file status
  // -----------------------------------------------------------------------

  describe('file status', () => {
    it('returns FileNotReady for pending files', async () => {
      const deps = createTestDeps({
        fileStore: {
          getFile: vi.fn(async () => ({ ...testFile, status: 'pending' as const })),
          getEntityLinks: vi.fn(async () => [testLink]),
        },
      });

      const result = await authorizeDownload('user-1', 'file-001', deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('FileNotReady');
        if (result.error._tag === 'FileNotReady') {
          expect(result.error.status).toBe('pending');
        }
      }
    });

    it('returns FileNotReady for quarantined files', async () => {
      const deps = createTestDeps({
        fileStore: {
          getFile: vi.fn(async () => ({ ...testFile, status: 'quarantined' as const })),
          getEntityLinks: vi.fn(async () => [testLink]),
        },
      });

      const result = await authorizeDownload('user-1', 'file-001', deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('FileNotReady');
      }
    });
  });

  // -----------------------------------------------------------------------
  // entity links
  // -----------------------------------------------------------------------

  describe('entity links', () => {
    it('returns NoEntityLink when file has no links', async () => {
      const deps = createTestDeps({
        fileStore: {
          getFile: vi.fn(async () => testFile),
          getEntityLinks: vi.fn(async () => []),
        },
      });

      const result = await authorizeDownload('user-1', 'file-001', deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('NoEntityLink');
      }
    });
  });

  // -----------------------------------------------------------------------
  // authorization
  // -----------------------------------------------------------------------

  describe('authorization', () => {
    it('returns AuthorizationError when user lacks entity permission', async () => {
      const deps = createTestDeps({
        permissionChecker: {
          canAccessEntity: vi.fn(async () => false),
        },
      });

      const result = await authorizeDownload('user-2', 'file-001', deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('AuthorizationError');
        if (result.error._tag === 'AuthorizationError') {
          expect(result.error.userId).toBe('user-2');
          expect(result.error.fileId).toBe('file-001');
        }
      }
    });

    it('allows access when user has permission on any linked entity', async () => {
      const multiLink = [
        { ...testLink, entityId: 'proj-100' },
        { ...testLink, id: 'link-002', entityId: 'proj-200' },
      ];
      const checker = vi.fn()
        .mockResolvedValueOnce(false)   // first link denied
        .mockResolvedValueOnce(true);   // second link allowed

      const deps = createTestDeps({
        fileStore: {
          getFile: vi.fn(async () => testFile),
          getEntityLinks: vi.fn(async () => multiLink),
        },
        permissionChecker: { canAccessEntity: checker },
      });

      // storage must have the file key
      const upload = await deps.storageAdapter.createPresignedUpload({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
      if (!upload.ok) throw new Error('setup failed');
      deps.fileStore.getFile = vi.fn(async () => ({ ...testFile, key: upload.value.key }));

      const result = await authorizeDownload('user-3', 'file-001', deps);
      expect(result.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // audit logging
  // -----------------------------------------------------------------------

  describe('audit logging', () => {
    it('does not log on authorization failure', async () => {
      const deps = createTestDeps({
        permissionChecker: {
          canAccessEntity: vi.fn(async () => false),
        },
      });

      await authorizeDownload('user-2', 'file-001', deps);
      expect(deps.auditLogger.logDownload).not.toHaveBeenCalled();
    });
  });
});
