/**
 * @testcase FS-01-SA-001 through FS-01-SA-012
 * @task FS-01
 * @frd FR-CORE-BLOB-001
 *
 * Tests the storage adapter interface and in-memory implementation:
 * - Presigned upload generation
 * - Presigned download generation
 * - File deletion
 * - Metadata retrieval
 * - Max file size enforcement
 * - Invalid input handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageAdapter } from '../src/storage/in-memory-adapter.js';
import { DEFAULT_MAX_SIZE_BYTES } from '../src/storage/storage-types.js';

describe('FS-01: Storage Adapter', () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  // -----------------------------------------------------------------------
  // presigned upload
  // -----------------------------------------------------------------------

  describe('createPresignedUpload', () => {
    it('returns fileId, uploadUrl, key, and expiresAt', async () => {
      const result = await adapter.createPresignedUpload({
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fileId).toMatch(/^file-/);
        expect(result.value.uploadUrl).toContain(result.value.key);
        expect(result.value.key).toContain('resume.pdf');
        expect(result.value.expiresAt).toBeTruthy();
      }
    });

    it('generates unique file IDs for each upload', async () => {
      const r1 = await adapter.createPresignedUpload({
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
      });
      const r2 = await adapter.createPresignedUpload({
        fileName: 'b.pdf',
        mimeType: 'application/pdf',
      });

      expect(r1.ok && r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.value.fileId).not.toBe(r2.value.fileId);
        expect(r1.value.key).not.toBe(r2.value.key);
      }
    });

    it('includes maxSizeBytes in upload URL (default 50MB)', async () => {
      const result = await adapter.createPresignedUpload({
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.uploadUrl).toContain(`maxSize=${DEFAULT_MAX_SIZE_BYTES}`);
      }
    });

    it('uses custom maxSizeBytes when provided', async () => {
      const customMax = 10 * 1024 * 1024; // 10MB
      const result = await adapter.createPresignedUpload({
        fileName: 'small.txt',
        mimeType: 'text/plain',
        maxSizeBytes: customMax,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.uploadUrl).toContain(`maxSize=${customMax}`);
      }
    });

    it('rejects empty mime type', async () => {
      const result = await adapter.createPresignedUpload({
        fileName: 'file.bin',
        mimeType: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidMimeType');
      }
    });

    it('stores file metadata in pending state after upload creation', async () => {
      const result = await adapter.createPresignedUpload({
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const meta = await adapter.getMetadata(result.value.key);
        expect(meta.ok).toBe(true);
        if (meta.ok && meta.value) {
          expect(meta.value.status).toBe('pending');
          expect(meta.value.fileName).toBe('photo.jpg');
          expect(meta.value.mimeType).toBe('image/jpeg');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // presigned download
  // -----------------------------------------------------------------------

  describe('createPresignedDownload', () => {
    it('returns download URL for existing file', async () => {
      const upload = await adapter.createPresignedUpload({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const result = await adapter.createPresignedDownload({
        key: upload.value.key,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.downloadUrl).toContain(upload.value.key);
        expect(result.value.expiresAt).toBeTruthy();
      }
    });

    it('returns FileNotFound for non-existent key', async () => {
      const result = await adapter.createPresignedDownload({
        key: 'uploads/nonexistent/file.pdf',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('FileNotFound');
      }
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('deleteObject', () => {
    it('deletes an existing file', async () => {
      const upload = await adapter.createPresignedUpload({
        fileName: 'temp.txt',
        mimeType: 'text/plain',
      });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const result = await adapter.deleteObject(upload.value.key);
      expect(result.ok).toBe(true);

      // verify it's gone
      const meta = await adapter.getMetadata(upload.value.key);
      expect(meta.ok).toBe(true);
      if (meta.ok) {
        expect(meta.value).toBeNull();
      }
    });

    it('returns FileNotFound for non-existent key', async () => {
      const result = await adapter.deleteObject('uploads/ghost/file.txt');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('FileNotFound');
      }
    });
  });

  // -----------------------------------------------------------------------
  // metadata
  // -----------------------------------------------------------------------

  describe('getMetadata', () => {
    it('returns null for non-existent key', async () => {
      const result = await adapter.getMetadata('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns full metadata for existing file', async () => {
      const upload = await adapter.createPresignedUpload({
        fileName: 'data.csv',
        mimeType: 'text/csv',
      });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      const result = await adapter.getMetadata(upload.value.key);

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe(upload.value.fileId);
        expect(result.value.fileName).toBe('data.csv');
        expect(result.value.mimeType).toBe('text/csv');
        expect(result.value.bucket).toBe('test-bucket');
        expect(result.value.status).toBe('pending');
        expect(result.value.scanResult).toBeNull();
      }
    });
  });

  // -----------------------------------------------------------------------
  // test helpers
  // -----------------------------------------------------------------------

  describe('test helpers', () => {
    it('setFileStatus updates file status', async () => {
      const upload = await adapter.createPresignedUpload({
        fileName: 'scan-me.exe',
        mimeType: 'application/octet-stream',
      });
      expect(upload.ok).toBe(true);
      if (!upload.ok) return;

      adapter.setFileStatus(upload.value.key, 'ready');

      const meta = await adapter.getMetadata(upload.value.key);
      expect(meta.ok).toBe(true);
      if (meta.ok && meta.value) {
        expect(meta.value.status).toBe('ready');
      }
    });
  });
});
