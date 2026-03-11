/**
 * FS-01: In-Memory Storage Adapter (for tests)
 * @task FS-01
 */

import { Result } from '@aptivo/types';
import type {
  FileMetadata,
  FileStorageError,
  PresignDownloadInput,
  PresignDownloadResult,
  PresignUploadInput,
  PresignUploadResult,
  StorageAdapter,
} from './storage-types.js';
import { DEFAULT_MAX_SIZE_BYTES } from './storage-types.js';

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly files = new Map<string, FileMetadata>();
  private idCounter = 0;

  async createPresignedUpload(
    input: PresignUploadInput,
  ): Promise<Result<PresignUploadResult, FileStorageError>> {
    const maxSize = input.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

    // validate mime type is non-empty
    if (!input.mimeType || input.mimeType.trim() === '') {
      return Result.err({ _tag: 'InvalidMimeType', mimeType: input.mimeType });
    }

    this.idCounter += 1;
    const fileId = `file-${String(this.idCounter).padStart(6, '0')}`;
    const key = `uploads/${fileId}/${input.fileName}`;
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    // store metadata in pending state
    this.files.set(key, {
      id: fileId,
      key,
      bucket: 'test-bucket',
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: null,
      status: 'pending',
      uploadedBy: 'test-user',
      scanResult: null,
      createdAt: new Date().toISOString(),
    });

    return Result.ok({
      fileId,
      uploadUrl: `https://test-bucket.s3.amazonaws.com/${key}?maxSize=${maxSize}`,
      key,
      expiresAt,
    });
  }

  async createPresignedDownload(
    input: PresignDownloadInput,
  ): Promise<Result<PresignDownloadResult, FileStorageError>> {
    const meta = this.files.get(input.key);
    if (!meta) {
      return Result.err({ _tag: 'FileNotFound', key: input.key });
    }

    const expiresIn = input.expiresInSeconds ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return Result.ok({
      downloadUrl: `https://test-bucket.s3.amazonaws.com/${input.key}`,
      expiresAt,
    });
  }

  async deleteObject(key: string): Promise<Result<void, FileStorageError>> {
    if (!this.files.has(key)) {
      return Result.err({ _tag: 'FileNotFound', key });
    }
    this.files.delete(key);
    return Result.ok(undefined);
  }

  async getMetadata(key: string): Promise<Result<FileMetadata | null, FileStorageError>> {
    return Result.ok(this.files.get(key) ?? null);
  }

  // test helpers
  getStoredFiles(): Map<string, FileMetadata> {
    return this.files;
  }

  setFileStatus(key: string, status: FileMetadata['status']): void {
    const meta = this.files.get(key);
    if (meta) {
      meta.status = status;
    }
  }
}
