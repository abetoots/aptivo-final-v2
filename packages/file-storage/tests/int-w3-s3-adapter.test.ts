/**
 * @testcase INT-W3-S3-001 through INT-W3-S3-008
 * @task INT-W3
 * @frd FR-CORE-BLOB-001
 *
 * Tests the S3 storage adapter for DigitalOcean Spaces:
 * - Presigned upload generation
 * - Presigned download generation
 * - Object deletion
 * - Metadata retrieval
 * - Error handling for all operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mock the aws sdk modules — vi.mock is hoisted
// ---------------------------------------------------------------------------

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  // use class syntax so S3Client is callable with `new`
  class MockS3Client {
    send = mockSend;
    constructor(_config: unknown) {
      // no-op
    }
  }
  class MockPutObjectCommand {
    _type = 'PutObjectCommand';
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class MockGetObjectCommand {
    _type = 'GetObjectCommand';
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class MockDeleteObjectCommand {
    _type = 'DeleteObjectCommand';
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class MockHeadObjectCommand {
    _type = 'HeadObjectCommand';
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
  };
});

vi.mock('node:crypto', () => {
  let counter = 0;
  return {
    randomUUID: () => {
      counter += 1;
      return `uuid-${String(counter).padStart(4, '0')}`;
    },
  };
});

import { createS3StorageAdapter } from '../src/storage/s3-adapter.js';
import type { S3AdapterConfig } from '../src/storage/s3-adapter.js';

// ---------------------------------------------------------------------------
// test config
// ---------------------------------------------------------------------------

const TEST_CONFIG: S3AdapterConfig = {
  bucket: 'aptivo-files',
  region: 'nyc3',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  credentials: {
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  },
  presignExpiresIn: 3600,
};

describe('INT-W3: S3 Storage Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // presigned upload
  // -----------------------------------------------------------------------

  describe('createPresignedUpload', () => {
    it('returns PresignUploadResult with URL, fileId, key, expiresAt', async () => {
      mockGetSignedUrl.mockResolvedValueOnce(
        'https://aptivo-files.nyc3.digitaloceanspaces.com/uuid-0001/report.pdf?signed=abc',
      );

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.createPresignedUpload({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fileId).toMatch(/^uuid-/);
        expect(result.value.key).toContain('report.pdf');
        expect(result.value.key).toContain(result.value.fileId);
        expect(result.value.uploadUrl).toContain('report.pdf');
        expect(result.value.expiresAt).toBeTruthy();
        // expiresAt should be a valid iso date string
        expect(() => new Date(result.value.expiresAt)).not.toThrow();
      }
    });

    it('rejects empty mime type without calling S3', async () => {
      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.createPresignedUpload({
        fileName: 'file.bin',
        mimeType: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidMimeType');
      }
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('returns UploadFailed when getSignedUrl throws', async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error('S3 presign failure'));

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.createPresignedUpload({
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('UploadFailed');
        expect(result.error).toHaveProperty('cause');
      }
    });
  });

  // -----------------------------------------------------------------------
  // presigned download
  // -----------------------------------------------------------------------

  describe('createPresignedDownload', () => {
    it('returns PresignDownloadResult with URL and expiresAt', async () => {
      mockGetSignedUrl.mockResolvedValueOnce(
        'https://aptivo-files.nyc3.digitaloceanspaces.com/uuid-001/data.csv?signed=xyz',
      );

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.createPresignedDownload({
        key: 'uuid-001/data.csv',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.downloadUrl).toContain('data.csv');
        expect(result.value.expiresAt).toBeTruthy();
        expect(() => new Date(result.value.expiresAt)).not.toThrow();
      }
    });

    it('returns DownloadFailed when getSignedUrl throws', async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error('S3 download presign failure'));

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.createPresignedDownload({
        key: 'uuid-001/file.pdf',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DownloadFailed');
        expect(result.error).toHaveProperty('cause');
      }
    });
  });

  // -----------------------------------------------------------------------
  // deleteObject
  // -----------------------------------------------------------------------

  describe('deleteObject', () => {
    it('succeeds when S3 delete succeeds', async () => {
      mockSend.mockResolvedValueOnce({});

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.deleteObject('uuid-001/file.txt');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it('returns DeleteFailed when S3 throws a non-404 error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access Denied'));

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.deleteObject('uuid-001/secret.txt');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('DeleteFailed');
        expect(result.error).toHaveProperty('cause');
      }
    });

    it('returns success when S3 throws NotFound (idempotent)', async () => {
      const notFoundErr = Object.assign(new Error('Not Found'), {
        name: 'NoSuchKey',
      });
      mockSend.mockRejectedValueOnce(notFoundErr);

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.deleteObject('uuid-999/gone.txt');

      expect(result.ok).toBe(true);
    });

    it('double-delete returns success both times', async () => {
      mockSend.mockResolvedValueOnce({});
      const notFoundErr = Object.assign(new Error('Not Found'), {
        name: 'NoSuchKey',
      });
      mockSend.mockRejectedValueOnce(notFoundErr);

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result1 = await adapter.deleteObject('uuid-001/file.txt');
      const result2 = await adapter.deleteObject('uuid-001/file.txt');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getMetadata
  // -----------------------------------------------------------------------

  describe('getMetadata', () => {
    it('returns file metadata from HeadObject response', async () => {
      mockSend.mockResolvedValueOnce({
        ContentType: 'image/png',
        ContentLength: 4096,
        LastModified: new Date('2026-03-01T00:00:00Z'),
        Metadata: { 'uploaded-by': 'user-42' },
      });

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.getMetadata('abc-123/photo.png');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        const meta = result.value!;
        expect(meta.id).toBe('abc-123');
        expect(meta.key).toBe('abc-123/photo.png');
        expect(meta.bucket).toBe('aptivo-files');
        expect(meta.fileName).toBe('photo.png');
        expect(meta.mimeType).toBe('image/png');
        expect(meta.sizeBytes).toBe(4096);
        expect(meta.uploadedBy).toBe('user-42');
        expect(meta.createdAt).toBe('2026-03-01T00:00:00.000Z');
      }
    });

    it('returns null for not-found objects', async () => {
      const notFoundErr = Object.assign(new Error('Not Found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(notFoundErr);

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.getMetadata('nonexistent/file.pdf');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns PersistenceError for non-404 S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Internal Server Error'));

      const adapter = createS3StorageAdapter(TEST_CONFIG);
      const result = await adapter.getMetadata('uuid-001/file.txt');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('PersistenceError');
        if (result.error._tag === 'PersistenceError') {
          expect(result.error.operation).toBe('getMetadata');
          expect(result.error.cause).toBeInstanceOf(Error);
        }
      }
    });
  });
});
