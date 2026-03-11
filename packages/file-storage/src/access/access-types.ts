/**
 * FS-02: Access control types
 * @task FS-02
 * @frd FR-CORE-BLOB-002
 */

import type { Result } from '@aptivo/types';
import type { StorageAdapter, FileStatus } from '../storage/storage-types.js';

// ---------------------------------------------------------------------------
// record types (mapped from DB rows)
// ---------------------------------------------------------------------------

export interface FileRecord {
  id: string;
  key: string;
  bucket: string;
  fileName: string;
  mimeType: string;
  status: FileStatus;
  uploadedBy: string;
}

export interface FileEntityLink {
  id: string;
  fileId: string;
  entityType: string;
  entityId: string;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// dependency interfaces (DB adapters inject these)
// ---------------------------------------------------------------------------

export interface FileStore {
  getFile(fileId: string): Promise<FileRecord | null>;
  getEntityLinks(fileId: string): Promise<FileEntityLink[]>;
}

export interface PermissionChecker {
  canAccessEntity(
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<boolean>;
}

export interface DownloadAuditLogger {
  logDownload(entry: {
    userId: string;
    fileId: string;
    ipAddress?: string;
  }): Promise<void>;
}

export interface FileAccessDeps {
  fileStore: FileStore;
  permissionChecker: PermissionChecker;
  auditLogger: DownloadAuditLogger;
  storageAdapter: StorageAdapter;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type FileAccessError =
  | { _tag: 'FileNotFound'; fileId: string }
  | { _tag: 'FileNotReady'; fileId: string; status: FileStatus }
  | { _tag: 'AuthorizationError'; userId: string; fileId: string; reason: string }
  | { _tag: 'NoEntityLink'; fileId: string }
  | { _tag: 'DownloadFailed'; cause: unknown };

// ---------------------------------------------------------------------------
// result types
// ---------------------------------------------------------------------------

export interface AuthorizedDownload {
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
  mimeType: string;
}
