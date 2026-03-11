/**
 * FS-01: Storage module
 */

export { InMemoryStorageAdapter } from './in-memory-adapter.js';
export { createS3StorageAdapter } from './s3-adapter.js';
export type { S3AdapterConfig } from './s3-adapter.js';

export type {
  StorageAdapter,
  FileMetadata,
  FileStatus,
  FileStorageError,
  PresignUploadInput,
  PresignUploadResult,
  PresignDownloadInput,
  PresignDownloadResult,
} from './storage-types.js';

export { DEFAULT_MAX_SIZE_BYTES } from './storage-types.js';
