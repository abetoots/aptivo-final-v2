/**
 * FS-02: Access control service
 * @task FS-02
 *
 * Permission-based file access inherited from linked business entities.
 * Every successful download is audit-logged.
 */

import { Result } from '@aptivo/types';
import type {
  AuthorizedDownload,
  FileAccessDeps,
  FileAccessError,
} from './access-types.js';

/**
 * Authorize and generate a presigned download URL for a file.
 *
 * Pipeline:
 *  1. Resolve file from store → FileNotFound
 *  2. Check file status → FileNotReady if not 'ready'
 *  3. Get entity links → NoEntityLink if empty
 *  4. Check permissions → AuthorizationError if all links denied
 *  5. Generate presigned download URL
 *  6. Log audit entry (fire-and-forget)
 *  7. Return download URL
 */
export async function authorizeDownload(
  userId: string,
  fileId: string,
  deps: FileAccessDeps,
  ipAddress?: string,
): Promise<Result<AuthorizedDownload, FileAccessError>> {
  // 1. resolve file
  const file = await deps.fileStore.getFile(fileId);
  if (!file) {
    return Result.err({ _tag: 'FileNotFound', fileId });
  }

  // 2. status check
  if (file.status !== 'ready') {
    return Result.err({ _tag: 'FileNotReady', fileId, status: file.status });
  }

  // 3. entity links
  const links = await deps.fileStore.getEntityLinks(fileId);
  if (links.length === 0) {
    return Result.err({ _tag: 'NoEntityLink', fileId });
  }

  // 4. permission check — user needs access to at least one linked entity
  let hasAccess = false;
  for (const link of links) {
    const allowed = await deps.permissionChecker.canAccessEntity(
      userId,
      link.entityType,
      link.entityId,
    );
    if (allowed) {
      hasAccess = true;
      break;
    }
  }
  if (!hasAccess) {
    return Result.err({
      _tag: 'AuthorizationError',
      userId,
      fileId,
      reason: 'no permission on any linked entity',
    });
  }

  // 5. generate presigned download
  const downloadResult = await deps.storageAdapter.createPresignedDownload({
    key: file.key,
  });
  if (!downloadResult.ok) {
    return Result.err({ _tag: 'DownloadFailed', cause: downloadResult.error });
  }

  // 6. audit log (fire-and-forget)
  deps.auditLogger.logDownload({ userId, fileId, ipAddress }).catch(() => {});

  // 7. return
  return Result.ok({
    downloadUrl: downloadResult.value.downloadUrl,
    expiresAt: downloadResult.value.expiresAt,
    fileName: file.fileName,
    mimeType: file.mimeType,
  });
}
