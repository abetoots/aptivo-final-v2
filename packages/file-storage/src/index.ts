/**
 * @aptivo/file-storage — S3-compatible blob storage with access control and scanning
 *
 * @see docs/06-sprints/sprint-3-plan.md
 */

export {
  InMemoryStorageAdapter,
  DEFAULT_MAX_SIZE_BYTES,
} from './storage/index.js';

export type {
  StorageAdapter,
  FileMetadata,
  FileStatus,
  FileStorageError,
  PresignUploadInput,
  PresignUploadResult,
  PresignDownloadInput,
  PresignDownloadResult,
} from './storage/index.js';

export { authorizeDownload } from './access/index.js';

export type {
  FileAccessDeps,
  FileAccessError,
  FileRecord,
  FileEntityLink,
  FileStore,
  PermissionChecker,
  DownloadAuditLogger,
  AuthorizedDownload,
} from './access/index.js';

export { PassthroughScanner, ClamAvScanner } from './scanner/index.js';

export type {
  FileScanner,
  ScanInput,
  ScanResult,
  FileScanError,
  ClamdClient,
  ClamAvScannerConfig,
} from './scanner/index.js';
