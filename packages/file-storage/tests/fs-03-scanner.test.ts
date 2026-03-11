/**
 * @testcase FS-03-SC-001 through FS-03-SC-010
 * @task FS-03
 * @frd FR-CORE-BLOB-003
 *
 * Tests the file scanner interface:
 * - PassthroughScanner: always clean
 * - ClamAvScanner: clean, infected, timeout, unavailable
 */

import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { PassthroughScanner } from '../src/scanner/passthrough-scanner.js';
import { ClamAvScanner } from '../src/scanner/clamav-scanner.js';
import type { ClamdClient, ScanInput } from '../src/scanner/file-scanner.js';

// ---------------------------------------------------------------------------
// test helpers
// ---------------------------------------------------------------------------

function createScanInput(overrides?: Partial<ScanInput>): ScanInput {
  return {
    fileKey: 'uploads/file-001/test.txt',
    fileName: 'test.txt',
    mimeType: 'text/plain',
    sizeBytes: 1024,
    stream: Readable.from(Buffer.from('test content')),
    ...overrides,
  };
}

function createMockClamd(overrides?: Partial<ClamdClient>): ClamdClient {
  return {
    ping: vi.fn(async () => true),
    scanStream: vi.fn(async () => 'stream: OK'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PassthroughScanner
// ---------------------------------------------------------------------------

describe('FS-03: PassthroughScanner', () => {
  it('always returns clean verdict', async () => {
    const scanner = new PassthroughScanner();
    const result = await scanner.scan(createScanInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe('clean');
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('healthCheck always returns true', async () => {
    const scanner = new PassthroughScanner();
    expect(await scanner.healthCheck()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ClamAvScanner
// ---------------------------------------------------------------------------

describe('FS-03: ClamAvScanner', () => {
  it('returns clean for OK response', async () => {
    const client = createMockClamd();
    const scanner = new ClamAvScanner(client);

    const result = await scanner.scan(createScanInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe('clean');
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns infected with signature for FOUND response', async () => {
    const client = createMockClamd({
      scanStream: vi.fn(async () => 'stream: Eicar-Signature FOUND'),
    });
    const scanner = new ClamAvScanner(client);

    const result = await scanner.scan(createScanInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe('infected');
      expect(result.value.signature).toBe('Eicar-Signature');
    }
  });

  it('returns ScanTimeout when scan exceeds timeout', async () => {
    const client = createMockClamd({
      scanStream: vi.fn(() => new Promise((resolve) => {
        setTimeout(() => resolve('stream: OK'), 5000);
      })),
    });
    const scanner = new ClamAvScanner(client, { timeoutMs: 50 });

    const result = await scanner.scan(createScanInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('ScanTimeout');
      if (result.error._tag === 'ScanTimeout') {
        expect(result.error.timeoutMs).toBe(50);
      }
    }
  });

  it('returns ScanFailed when client throws', async () => {
    const client = createMockClamd({
      scanStream: vi.fn(async () => { throw new Error('connection refused'); }),
    });
    const scanner = new ClamAvScanner(client);

    const result = await scanner.scan(createScanInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('ScanFailed');
    }
  });

  it('healthCheck returns true when ping succeeds', async () => {
    const client = createMockClamd();
    const scanner = new ClamAvScanner(client);
    expect(await scanner.healthCheck()).toBe(true);
  });

  it('healthCheck returns false when ping fails', async () => {
    const client = createMockClamd({
      ping: vi.fn(async () => { throw new Error('unreachable'); }),
    });
    const scanner = new ClamAvScanner(client);
    expect(await scanner.healthCheck()).toBe(false);
  });

  it('healthCheck returns false when ping returns false', async () => {
    const client = createMockClamd({
      ping: vi.fn(async () => false),
    });
    const scanner = new ClamAvScanner(client);
    expect(await scanner.healthCheck()).toBe(false);
  });

  it('passes stream from ScanInput to client', async () => {
    const client = createMockClamd();
    const input = createScanInput();
    const scanner = new ClamAvScanner(client);

    await scanner.scan(input);
    expect(client.scanStream).toHaveBeenCalledWith(input.stream);
  });
});
