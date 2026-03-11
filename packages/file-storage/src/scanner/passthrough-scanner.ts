/**
 * FS-03: Passthrough scanner (for tests + local dev)
 * @task FS-03
 *
 * Always returns 'clean' — no actual scanning performed.
 * Use in test and development environments where ClamAV
 * sidecar is unavailable.
 */

import { Result } from '@aptivo/types';
import type {
  FileScanner,
  ScanInput,
  ScanResult,
  FileScanError,
} from './file-scanner.js';

export class PassthroughScanner implements FileScanner {
  async scan(_input: ScanInput): Promise<Result<ScanResult, FileScanError>> {
    const start = performance.now();
    return Result.ok({
      verdict: 'clean' as const,
      durationMs: performance.now() - start,
    });
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
