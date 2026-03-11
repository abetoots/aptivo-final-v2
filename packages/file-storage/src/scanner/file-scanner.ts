/**
 * FS-03: File scanner types
 * @task FS-03
 * @frd FR-CORE-BLOB-003
 */

import type { Result } from '@aptivo/types';
import type { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// scanner interface
// ---------------------------------------------------------------------------

export interface FileScanner {
  scan(input: ScanInput): Promise<Result<ScanResult, FileScanError>>;
  healthCheck(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// input / output types
// ---------------------------------------------------------------------------

export interface ScanInput {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  stream: Readable;
}

export interface ScanResult {
  verdict: 'clean' | 'infected';
  /** malware signature name if infected */
  signature?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type FileScanError =
  | { _tag: 'ScanTimeout'; timeoutMs: number }
  | { _tag: 'ScannerUnavailable'; cause: unknown }
  | { _tag: 'ScanFailed'; cause: unknown };

// ---------------------------------------------------------------------------
// ClamAV client interface (TCP socket adapter)
// ---------------------------------------------------------------------------

export interface ClamdClient {
  ping(): Promise<boolean>;
  scanStream(stream: Readable): Promise<string>;
}
