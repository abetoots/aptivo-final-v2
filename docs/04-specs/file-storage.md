---
id: SPEC-MKJP625C
title: File Storage Module Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# File Storage Module Specification

**Parent:** [04-Technical-Specifications.md](index.md)

**FRD Reference:** FS1-FS2 (Section 3.4)

---

## 1. Module Overview

### 1.1 Purpose

Secure, scalable file storage for documents, resumes, contracts, and media using S3-compatible object storage.

### 1.2 Scope

| Feature | FRD Ref | Status |
|---------|---------|--------|
| File Upload/Download | FS1 | ✅ Specified |
| Access Control | FS2 | ✅ Specified |
| Retention Management | - | ✅ Specified |

---

## 2. Architecture

### 2.1 Storage Backend

**Reference Implementation:** MinIO (S3-compatible)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│  API Server │────►│    MinIO    │
│  (Browser)  │     │  (Presigned)│     │   (S3 API)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       └───────── Direct Upload/Download ──────┘
```

### 2.2 Bucket Structure

| Bucket | Purpose | Retention | Access |
|--------|---------|-----------|--------|
| `aptivo-resumes` | Candidate resumes | 24 months after candidate dormancy | Authenticated users |
| `aptivo-contracts` | Contract PDFs | 7 years (compliance) | Restricted |
| `aptivo-attachments` | General attachments | 90 days after entity deletion | Authenticated users |
| `aptivo-exports` | Report exports | 7 days | User-specific |
| `aptivo-temp` | Temporary uploads | 24 hours | User-specific |

---

## 3. Service Interface

```typescript
interface FileStorageService {
  // upload operations
  generateUploadUrl(params: UploadUrlParams): Promise<Result<PresignedUpload, StorageError>>;
  completeUpload(fileId: string): Promise<Result<FileMetadata, StorageError>>;

  // download operations
  generateDownloadUrl(fileId: string, expiresIn?: number): Promise<Result<string, StorageError>>;

  // management operations
  deleteFile(fileId: string): Promise<Result<void, StorageError>>;
  copyFile(fileId: string, destinationBucket: string): Promise<Result<FileMetadata, StorageError>>;

  // metadata operations
  getMetadata(fileId: string): Promise<Result<FileMetadata, StorageError>>;
  updateMetadata(fileId: string, metadata: Partial<FileMetadataUpdate>): Promise<Result<FileMetadata, StorageError>>;
}

interface UploadUrlParams {
  bucket: string;
  filename: string;
  contentType: string;
  maxSizeBytes: number;
  metadata?: Record<string, string>;
  expiresIn?: number;  // seconds, default 3600
}

interface PresignedUpload {
  fileId: string;
  uploadUrl: string;
  fields: Record<string, string>;  // form fields for multipart upload
  expiresAt: Date;
}

interface FileMetadata {
  id: string;
  bucket: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  isPublic: boolean;
  uploadedById: string;
  retentionUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type StorageError =
  | { _tag: 'FileNotFound'; fileId: string }
  | { _tag: 'AccessDenied'; fileId: string; reason: string }
  | { _tag: 'QuotaExceeded'; currentUsage: number; limit: number }
  | { _tag: 'InvalidFileType'; mimeType: string; allowedTypes: string[] }
  | { _tag: 'FileTooLarge'; sizeBytes: number; maxBytes: number }
  | { _tag: 'StorageUnavailable'; cause: unknown };
```

---

## 4. API Endpoints

### 4.1 File Upload Flow

#### Step 1: Request Upload URL

```http
POST /api/v1/files/upload-url
Content-Type: application/json
Authorization: Bearer {token}

{
  "bucket": "aptivo-resumes",
  "filename": "john-doe-resume.pdf",
  "contentType": "application/pdf",
  "metadata": {
    "candidateId": "01HXYZ123"
  }
}
```

**Response:**
```json
{
  "data": {
    "fileId": "01HXYZ456",
    "uploadUrl": "https://storage.aptivo.com/aptivo-resumes/...",
    "fields": {
      "key": "uploads/01HXYZ456/john-doe-resume.pdf",
      "policy": "...",
      "x-amz-credential": "...",
      "x-amz-signature": "..."
    },
    "expiresAt": "2025-01-15T11:00:00Z"
  }
}
```

#### Step 2: Upload to Presigned URL

```http
POST {uploadUrl}
Content-Type: multipart/form-data

[form fields from response]
file: [binary data]
```

#### Step 3: Confirm Upload

```http
POST /api/v1/files/{fileId}/complete
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "id": "01HXYZ456",
    "filename": "john-doe-resume.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245760,
    "checksumSha256": "abc123...",
    "downloadUrl": "https://..."
  }
}
```

### 4.2 File Download

```http
GET /api/v1/files/{fileId}/download-url
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "downloadUrl": "https://storage.aptivo.com/...",
    "expiresAt": "2025-01-15T11:00:00Z"
  }
}
```

### 4.3 File Deletion

```http
DELETE /api/v1/files/{fileId}
Authorization: Bearer {token}
```

**Response:** `204 No Content`

**Business Rules:**
- Files with retention policy cannot be deleted until retention expires
- Soft delete by default; hard delete after retention period

---

## 5. Access Control

### 5.1 Permission Model

| Role | Upload | Download Own | Download Any | Delete Own | Delete Any |
|------|--------|--------------|--------------|------------|------------|
| System Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recruiter | ✓ | ✓ | ✓ (candidates) | ✓ | ✗ |
| Coordinator | ✓ | ✓ | ✓ (candidates) | ✗ | ✗ |
| Interviewer | ✗ | ✗ | ✓ (assigned) | ✗ | ✗ |
| Client | ✗ | ✗ | ✓ (assigned) | ✗ | ✗ |

### 5.2 URL Signing

All download URLs are presigned with:
- **Default expiry:** 1 hour
- **Max expiry:** 24 hours
- **Bound to user:** URLs include user ID in signature

```typescript
const generateSignedUrl = async (
  fileId: string,
  userId: string,
  expiresIn: number = 3600
): Promise<string> => {
  const file = await fileRepo.findById(fileId);
  if (!file) throw new NotFoundError('File', fileId);

  // check access
  const hasAccess = await checkFileAccess(file, userId);
  if (!hasAccess) throw new AccessDeniedError(fileId);

  // generate presigned URL
  return s3Client.getSignedUrl('getObject', {
    Bucket: file.bucket,
    Key: file.key,
    Expires: expiresIn,
  });
};
```

---

## 6. File Validation

### 6.1 Allowed File Types

| Bucket | Allowed MIME Types | Max Size |
|--------|-------------------|----------|
| `aptivo-resumes` | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | 50 MB |
| `aptivo-contracts` | `application/pdf` | 25 MB |
| `aptivo-attachments` | Images, PDF, Office docs | 25 MB |
| `aptivo-exports` | `application/json`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | 100 MB |

### 6.2 Validation Schema

```typescript
import { z } from 'zod';

const FileUploadSchema = z.object({
  bucket: z.enum(['aptivo-resumes', 'aptivo-contracts', 'aptivo-attachments', 'aptivo-exports']),
  filename: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9._-]+$/),  // safe characters only
  contentType: z.string(),
  metadata: z.record(z.string()).optional(),
});

const BUCKET_CONSTRAINTS: Record<string, { allowedTypes: string[]; maxBytes: number }> = {
  'aptivo-resumes': {
    allowedTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxBytes: 50 * 1024 * 1024,  // 50 MB
  },
  'aptivo-contracts': {
    allowedTypes: ['application/pdf'],
    maxBytes: 25 * 1024 * 1024,  // 25 MB
  },
  // ...
};
```

### 6.3 Virus Scanning

All uploaded files are scanned asynchronously:

```typescript
// post-upload hook
eventBus.subscribe('aptivo.file.uploaded', async (event) => {
  const { fileId, bucket, key } = event.data;

  // scan file
  const scanResult = await virusScanner.scan(bucket, key);

  if (scanResult.infected) {
    await fileRepo.markAsInfected(fileId, scanResult.threats);
    await s3Client.deleteObject({ Bucket: bucket, Key: key });
    await eventBus.publish('aptivo.file.quarantined', { fileId, threats: scanResult.threats });
  } else {
    await fileRepo.markAsScanned(fileId);
  }
});
```

---

## 7. Retention & Lifecycle

### 7.1 Retention Policies

```typescript
interface RetentionPolicy {
  bucket: string;
  defaultRetentionDays: number;
  maxRetentionDays: number;
  onExpiry: 'delete' | 'archive' | 'notify';
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    bucket: 'aptivo-resumes',
    defaultRetentionDays: 730,  // 2 years
    maxRetentionDays: 2555,     // 7 years
    onExpiry: 'archive',
  },
  {
    bucket: 'aptivo-contracts',
    defaultRetentionDays: 2555, // 7 years
    maxRetentionDays: 3650,     // 10 years
    onExpiry: 'archive',
  },
  {
    bucket: 'aptivo-temp',
    defaultRetentionDays: 1,
    maxRetentionDays: 1,
    onExpiry: 'delete',
  },
];
```

### 7.2 Lifecycle Jobs

Daily job to process expired files:

```typescript
// scheduled: 0 2 * * * (2 AM daily)
const processExpiredFiles = async () => {
  const expiredFiles = await fileRepo.findExpired(new Date());

  for (const file of expiredFiles) {
    const policy = RETENTION_POLICIES.find(p => p.bucket === file.bucket);

    switch (policy?.onExpiry) {
      case 'delete':
        await s3Client.deleteObject({ Bucket: file.bucket, Key: file.key });
        await fileRepo.hardDelete(file.id);
        break;

      case 'archive':
        await s3Client.copyObject({
          CopySource: `${file.bucket}/${file.key}`,
          Bucket: 'aptivo-archive',
          Key: `${file.bucket}/${file.key}`,
          StorageClass: 'GLACIER',
        });
        await fileRepo.markAsArchived(file.id);
        break;

      case 'notify':
        await eventBus.publish('aptivo.file.retention-expired', { fileId: file.id });
        break;
    }
  }
};
```

---

## 8. Event Catalog

| Event | When | Payload |
|-------|------|---------|
| `aptivo.file.uploaded` | Upload completed | `{ fileId, bucket, key, uploadedBy }` |
| `aptivo.file.downloaded` | File accessed | `{ fileId, downloadedBy }` |
| `aptivo.file.deleted` | File removed | `{ fileId, deletedBy }` |
| `aptivo.file.quarantined` | Virus detected | `{ fileId, threats }` |
| `aptivo.file.retention-expired` | Retention ended | `{ fileId, bucket }` |

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target |
|--------|--------|
| Upload URL generation | < 200ms |
| Download URL generation | < 100ms |
| Upload throughput | 50 MB/s per user |
| Concurrent uploads | 10 per user |

### 9.2 Storage Quotas

| Quota | Limit |
|-------|-------|
| Per-user storage | 5 GB |
| Per-candidate files | 100 MB |
| Organization total | 500 GB (configurable) |

### 9.3 Durability & Availability

- **Durability:** 99.999999999% (11 nines) with erasure coding
- **Availability:** 99.9% uptime SLO
- **Replication:** 3 copies across availability zones
