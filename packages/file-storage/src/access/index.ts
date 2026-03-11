/**
 * FS-02: Access control module barrel export
 */

export { authorizeDownload } from './access-control-service.js';

export type {
  FileAccessDeps,
  FileAccessError,
  FileRecord,
  FileEntityLink,
  FileStore,
  PermissionChecker,
  DownloadAuditLogger,
  AuthorizedDownload,
} from './access-types.js';
