/**
 * CF-05: Resilient scanner with circuit breaker
 * @task CF-05
 * @frd FR-CORE-BLOB-003
 *
 * Composes CircuitBreaker around a FileScanner.scan() call.
 * - Scanner timeout/unavailable → circuit breaker records failure
 * - Clean/infected results → no failure recording
 * - Circuit open → ScannerUnavailable error
 */

import { Result } from '@aptivo/types';
import type { FileScanner, ScanInput, ScanResult, FileScanError } from './file-scanner.js';

// ---------------------------------------------------------------------------
// circuit breaker interface (avoids direct dependency on @aptivo/mcp-layer)
// ---------------------------------------------------------------------------

export interface ScannerCircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * Wraps a FileScanner with a circuit breaker for production resilience.
 *
 * When the circuit is open, scan() returns ScannerUnavailable immediately
 * instead of hitting the actual scanner.
 */
export function createResilientScanner(
  scanner: FileScanner,
  breaker: ScannerCircuitBreaker,
): FileScanner {
  return {
    async scan(input: ScanInput): Promise<Result<ScanResult, FileScanError>> {
      try {
        const result = await breaker.execute(async () => {
          const scanResult = await scanner.scan(input);
          if (!scanResult.ok) {
            // scanner errors should trip the breaker
            throw scanResult.error;
          }
          return scanResult;
        });
        return result;
      } catch (err) {
        // check if this is a tagged scanner error
        if (isFileScanError(err)) {
          return Result.err(err);
        }
        // circuit open or unknown error
        return Result.err({ _tag: 'ScannerUnavailable', cause: err });
      }
    },

    async healthCheck(): Promise<boolean> {
      return scanner.healthCheck();
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isFileScanError(err: unknown): err is FileScanError {
  if (typeof err !== 'object' || err === null) return false;
  const tag = (err as Record<string, unknown>)._tag;
  return tag === 'ScanTimeout' || tag === 'ScannerUnavailable' || tag === 'ScanFailed';
}
