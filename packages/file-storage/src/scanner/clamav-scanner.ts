/**
 * FS-03: ClamAV scanner adapter
 * @task FS-03
 *
 * Wraps a ClamdClient (TCP socket) with Result types, timeouts,
 * and health checking. Uses injectable client for testability.
 */

import { Result } from '@aptivo/types';
import type {
  ClamdClient,
  FileScanner,
  FileScanError,
  ScanInput,
  ScanResult,
} from './file-scanner.js';

export interface ClamAvScannerConfig {
  /** scan timeout in ms (default 30_000) */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class ClamAvScanner implements FileScanner {
  private readonly client: ClamdClient;
  private readonly timeoutMs: number;

  constructor(client: ClamdClient, config?: ClamAvScannerConfig) {
    this.client = client;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async scan(input: ScanInput): Promise<Result<ScanResult, FileScanError>> {
    const start = performance.now();

    try {
      const response = await Promise.race([
        this.client.scanStream(input.stream),
        rejectAfter(this.timeoutMs),
      ]);

      const durationMs = performance.now() - start;
      return Result.ok(parseResponse(response, durationMs));
    } catch (err) {
      if (err instanceof TimeoutError) {
        return Result.err({ _tag: 'ScanTimeout', timeoutMs: this.timeoutMs });
      }
      return Result.err({ _tag: 'ScanFailed', cause: err });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.client.ping();
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`scan timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
}

/** parse clamd INSTREAM response: "stream: OK" or "stream: <sig> FOUND" */
function parseResponse(response: string, durationMs: number): ScanResult {
  const trimmed = response.trim();
  if (trimmed.endsWith('OK')) {
    return { verdict: 'clean', durationMs };
  }
  // extract signature from "stream: Eicar-Signature FOUND"
  const match = trimmed.match(/stream:\s*(.+)\s+FOUND$/i);
  const signature = match?.[1]?.trim();
  return { verdict: 'infected', signature, durationMs };
}
