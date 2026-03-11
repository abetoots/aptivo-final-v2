/**
 * FS-01: Storage Types
 * @task FS-01
 * @frd FR-CORE-BLOB-001
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// file status lifecycle
// ---------------------------------------------------------------------------

export type FileStatus = 'pending' | 'ready' | 'quarantined' | 'deleted';

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type FileStorageError =
  | { _tag: 'FileTooLarge'; size: number; limit: number }
  | { _tag: 'FileNotFound'; key: string }
  | { _tag: 'InvalidMimeType'; mimeType: string }
  | { _tag: 'UploadFailed'; cause: unknown }
  | { _tag: 'DownloadFailed'; cause: unknown }
  | { _tag: 'DeleteFailed'; cause: unknown }
  | { _tag: 'PersistenceError'; operation: string; cause: unknown };

// ---------------------------------------------------------------------------
// presigned URL types
// ---------------------------------------------------------------------------

export interface PresignUploadInput {
  fileName: string;
  mimeType: string;
  maxSizeBytes?: number; // default 50MB
  metadata?: Record<string, string>;
}

export interface PresignUploadResult {
  fileId: string;
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export interface PresignDownloadInput {
  key: string;
  expiresInSeconds?: number; // default 3600
}

export interface PresignDownloadResult {
  downloadUrl: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// file metadata
// ---------------------------------------------------------------------------

export interface FileMetadata {
  id: string;
  key: string;
  bucket: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  status: FileStatus;
  uploadedBy: string;
  scanResult: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// adapter interface
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per FRD

export interface StorageAdapter {
  createPresignedUpload(
    input: PresignUploadInput,
  ): Promise<Result<PresignUploadResult, FileStorageError>>;

  createPresignedDownload(
    input: PresignDownloadInput,
  ): Promise<Result<PresignDownloadResult, FileStorageError>>;

  deleteObject(key: string): Promise<Result<void, FileStorageError>>;

  getMetadata(key: string): Promise<Result<FileMetadata | null, FileStorageError>>;
}
