/**
 * FS-03: Scanner module barrel export
 */

export { PassthroughScanner } from './passthrough-scanner.js';
export { ClamAvScanner } from './clamav-scanner.js';

export type { ClamAvScannerConfig } from './clamav-scanner.js';

export type {
  FileScanner,
  ScanInput,
  ScanResult,
  FileScanError,
  ClamdClient,
} from './file-scanner.js';

export { createResilientScanner } from './resilient-scanner.js';
export type { ScannerCircuitBreaker } from './resilient-scanner.js';
