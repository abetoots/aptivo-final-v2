/**
 * INT-W3: S3 Storage Adapter for DigitalOcean Spaces
 * @task INT-W3
 * @frd FR-CORE-BLOB-001
 */

import { Result } from '@aptivo/types';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
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

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  endpoint: string; // e.g. https://nyc3.digitaloceanspaces.com
  credentials: { accessKeyId: string; secretAccessKey: string };
  presignExpiresIn?: number; // default 3600
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// check if an s3 error indicates the object was not found
function isNotFoundError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  // HeadObjectCommand throws NotFound (name) or returns 404 ($metadata.httpStatusCode)
  if (e['name'] === 'NotFound' || e['name'] === 'NoSuchKey') return true;
  if (e['$metadata'] && typeof e['$metadata'] === 'object') {
    const meta = e['$metadata'] as Record<string, unknown>;
    if (meta['httpStatusCode'] === 404) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createS3StorageAdapter(config: S3AdapterConfig): StorageAdapter {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.credentials,
    forcePathStyle: false, // DO Spaces uses virtual-hosted style
  });

  const defaultExpiry = config.presignExpiresIn ?? 3600;

  // -------------------------------------------------------------------------
  // createPresignedUpload
  // -------------------------------------------------------------------------

  async function createPresignedUpload(
    input: PresignUploadInput,
  ): Promise<Result<PresignUploadResult, FileStorageError>> {
    try {
      // validate mime type
      if (!input.mimeType || input.mimeType.trim() === '') {
        return Result.err({ _tag: 'InvalidMimeType', mimeType: input.mimeType });
      }

      const fileId = randomUUID();
      const key = `${fileId}/${input.fileName}`;
      const _maxSize = input.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: input.mimeType,
        Metadata: input.metadata ?? {},
      });

      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: defaultExpiry,
      });

      const expiresAt = new Date(Date.now() + defaultExpiry * 1000).toISOString();

      return Result.ok({ fileId, uploadUrl, key, expiresAt });
    } catch (cause) {
      return Result.err({ _tag: 'UploadFailed', cause });
    }
  }

  // -------------------------------------------------------------------------
  // createPresignedDownload
  // -------------------------------------------------------------------------

  async function createPresignedDownload(
    input: PresignDownloadInput,
  ): Promise<Result<PresignDownloadResult, FileStorageError>> {
    try {
      const expiresIn = input.expiresInSeconds ?? defaultExpiry;

      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
      });

      const downloadUrl = await getSignedUrl(client, command, {
        expiresIn,
      });

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      return Result.ok({ downloadUrl, expiresAt });
    } catch (cause) {
      return Result.err({ _tag: 'DownloadFailed', cause });
    }
  }

  // -------------------------------------------------------------------------
  // deleteObject
  // -------------------------------------------------------------------------

  async function deleteObject(key: string): Promise<Result<void, FileStorageError>> {
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));

      return Result.ok(undefined);
    } catch (cause) {
      if (isNotFoundError(cause)) {
        // idempotent: deleting non-existent object is a no-op success
        return Result.ok(undefined);
      }
      return Result.err({ _tag: 'DeleteFailed', cause });
    }
  }

  // -------------------------------------------------------------------------
  // getMetadata
  // -------------------------------------------------------------------------

  async function getMetadata(
    key: string,
  ): Promise<Result<FileMetadata | null, FileStorageError>> {
    try {
      const response = await client.send(new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));

      // extract filename from key (pattern: <fileId>/<fileName>)
      const parts = key.split('/');
      const fileName = parts.length > 1 ? parts.slice(1).join('/') : key;
      const fileId = parts[0] ?? key;

      const metadata: FileMetadata = {
        id: fileId,
        key,
        bucket: config.bucket,
        fileName,
        mimeType: response.ContentType ?? 'application/octet-stream',
        sizeBytes: response.ContentLength ?? null,
        status: 'pending',
        uploadedBy: response.Metadata?.['uploaded-by'] ?? '',
        scanResult: null,
        createdAt: response.LastModified?.toISOString() ?? new Date().toISOString(),
      };

      return Result.ok(metadata);
    } catch (cause) {
      if (isNotFoundError(cause)) {
        return Result.ok(null);
      }
      return Result.err({ _tag: 'PersistenceError', operation: 'getMetadata', cause });
    }
  }

  return {
    createPresignedUpload,
    createPresignedDownload,
    deleteObject,
    getMetadata,
  };
}
