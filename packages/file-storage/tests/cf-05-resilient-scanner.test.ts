/**
 * CF-05: Resilient scanner + error classification wiring tests
 * @task CF-05
 *
 * Tests:
 * - clean scan result passes through circuit breaker
 * - scanner error trips circuit breaker
 * - circuit open → ScannerUnavailable
 * - healthCheck delegates to inner scanner
 */

import { describe, it, expect, vi } from 'vitest';
import { Result } from '@aptivo/types';
import { createResilientScanner } from '../src/scanner/resilient-scanner.js';
import type { FileScanner, ScanInput, ScanResult, FileScanError } from '../src/scanner/file-scanner.js';
import type { ScannerCircuitBreaker } from '../src/scanner/resilient-scanner.js';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const SCAN_INPUT: ScanInput = {
  fileKey: 'test-file',
  fileName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  stream: Readable.from(Buffer.from('test')),
};

const CLEAN_RESULT: ScanResult = { verdict: 'clean', durationMs: 50 };

function createMockScanner(overrides?: Partial<FileScanner>): FileScanner {
  return {
    scan: vi.fn().mockResolvedValue(Result.ok(CLEAN_RESULT)),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createPassthroughBreaker(): ScannerCircuitBreaker {
  return {
    execute: vi.fn().mockImplementation(async (fn) => fn()),
  };
}

class CircuitOpenError extends Error {
  constructor() {
    super('Circuit is open');
    this.name = 'CircuitOpenError';
  }
}

function createOpenBreaker(): ScannerCircuitBreaker {
  return {
    execute: vi.fn().mockRejectedValue(new CircuitOpenError()),
  };
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('createResilientScanner', () => {
  it('passes clean scan results through', async () => {
    const scanner = createMockScanner();
    const breaker = createPassthroughBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    const result = await resilient.scan(SCAN_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('clean');
  });

  it('executes scan through circuit breaker', async () => {
    const scanner = createMockScanner();
    const breaker = createPassthroughBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    await resilient.scan(SCAN_INPUT);

    expect(breaker.execute).toHaveBeenCalledTimes(1);
    expect(scanner.scan).toHaveBeenCalledWith(SCAN_INPUT);
  });

  it('propagates scanner errors through breaker (trips on error)', async () => {
    const scanError: FileScanError = { _tag: 'ScanTimeout', timeoutMs: 30000 };
    const scanner = createMockScanner({
      scan: vi.fn().mockResolvedValue(Result.err(scanError)),
    });
    // breaker that executes fn — the fn will throw the scanError
    const breaker: ScannerCircuitBreaker = {
      execute: vi.fn().mockImplementation(async (fn) => fn()),
    };
    const resilient = createResilientScanner(scanner, breaker);

    const result = await resilient.scan(SCAN_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ScanTimeout');
  });

  it('returns ScannerUnavailable when circuit is open', async () => {
    const scanner = createMockScanner();
    const breaker = createOpenBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    const result = await resilient.scan(SCAN_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ScannerUnavailable');
  });

  it('delegates healthCheck to inner scanner', async () => {
    const scanner = createMockScanner();
    const breaker = createPassthroughBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    const healthy = await resilient.healthCheck();

    expect(healthy).toBe(true);
    expect(scanner.healthCheck).toHaveBeenCalledTimes(1);
  });

  it('returns false for healthCheck when inner scanner unhealthy', async () => {
    const scanner = createMockScanner({
      healthCheck: vi.fn().mockResolvedValue(false),
    });
    const breaker = createPassthroughBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    const healthy = await resilient.healthCheck();

    expect(healthy).toBe(false);
  });

  it('returns ScanFailed error correctly through breaker', async () => {
    const scanError: FileScanError = { _tag: 'ScanFailed', cause: new Error('clamd error') };
    const scanner = createMockScanner({
      scan: vi.fn().mockResolvedValue(Result.err(scanError)),
    });
    const breaker: ScannerCircuitBreaker = {
      execute: vi.fn().mockImplementation(async (fn) => fn()),
    };
    const resilient = createResilientScanner(scanner, breaker);

    const result = await resilient.scan(SCAN_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ScanFailed');
  });

  it('passes infected results through without tripping breaker', async () => {
    const infectedResult: ScanResult = { verdict: 'infected', signature: 'EICAR', durationMs: 25 };
    const scanner = createMockScanner({
      scan: vi.fn().mockResolvedValue(Result.ok(infectedResult)),
    });
    const breaker = createPassthroughBreaker();
    const resilient = createResilientScanner(scanner, breaker);

    const result = await resilient.scan(SCAN_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('infected');
    expect(result.value.signature).toBe('EICAR');
  });
});
