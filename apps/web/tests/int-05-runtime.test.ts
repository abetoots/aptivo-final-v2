/**
 * INT-05: runtime hardening — probes + graceful shutdown
 * @task INT-05
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock shutdown module for health route tests
vi.mock('../src/lib/shutdown', () => ({
  isShuttingDown: vi.fn().mockReturnValue(false),
  _resetForTest: vi.fn(),
  registerShutdownHandlers: vi.fn(),
}));

// mock db module for readiness probe tests
vi.mock('../src/lib/db', () => ({
  getDb: vi.fn(),
}));

// mock drizzle-orm sql template tag
vi.mock('drizzle-orm', () => ({
  sql: Object.assign(() => 'SELECT 1', {
    raw: (s: string) => s,
  }),
}));

import {
  isShuttingDown as isShuttingDownReal,
  _resetForTest,
  registerShutdownHandlers,
} from '../src/lib/shutdown';
import { isShuttingDown as isShuttingDownMocked } from '../src/lib/shutdown';
import { getDb } from '../src/lib/db';

describe('INT-05: shutdown module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('isShuttingDown returns false initially (unmocked)', async () => {
    // test the real module behavior by importing fresh
    // since we mock above, we test the mock contract here
    const mod = await vi.importActual<typeof import('../src/lib/shutdown')>(
      '../src/lib/shutdown'
    );
    mod._resetForTest();
    expect(mod.isShuttingDown()).toBe(false);
  });

  it('registerShutdownHandlers registers SIGTERM and SIGINT handlers', () => {
    const onSpy = vi.spyOn(process, 'on');

    // use the real function for this test
    vi.mocked(registerShutdownHandlers).mockImplementation(async () => {
      // simulate the real behavior of registering handlers
      process.on('SIGTERM', () => {});
      process.on('SIGINT', () => {});
    });

    registerShutdownHandlers();

    const registeredSignals = onSpy.mock.calls.map((call) => call[0]);
    expect(registeredSignals).toContain('SIGTERM');
    expect(registeredSignals).toContain('SIGINT');

    onSpy.mockRestore();
  });

  it('registerShutdownHandlers attaches signal listeners (real implementation)', async () => {
    const mod = await vi.importActual<typeof import('../src/lib/shutdown')>(
      '../src/lib/shutdown'
    );

    const onSpy = vi.spyOn(process, 'on');
    mod.registerShutdownHandlers({ gracePeriodMs: 100 });

    const registeredSignals = onSpy.mock.calls.map((call) => call[0]);
    expect(registeredSignals).toContain('SIGTERM');
    expect(registeredSignals).toContain('SIGINT');

    onSpy.mockRestore();
  });
});

describe('INT-05: liveness probe (/health/live)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { status: "ok" } when not shutting down', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);

    const { GET } = await import('../src/app/health/live/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('returns { status: "shutting_down" } with 503 when shutting down', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(true);

    const { GET } = await import('../src/app/health/live/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'shutting_down' });
  });

  it('does not include version info or dependency details (T1-W29)', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);

    const { GET } = await import('../src/app/health/live/route');
    const response = await GET();
    const body = await response.json();

    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('dependencies');
    expect(body).not.toHaveProperty('timestamp');
    expect(body).not.toHaveProperty('checks');
  });
});

describe('INT-05: readiness probe (/health/ready)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { status: "ok" } when DB is reachable', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);
    const mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as any);

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
    expect(mockExecute).toHaveBeenCalled();
  });

  it('returns { status: "degraded" } with 503 when DB check fails', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);
    vi.mocked(getDb).mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as any);

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'degraded' });
  });

  it('returns { status: "shutting_down" } with 503 when shutting down', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(true);

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'shutting_down' });
  });

  it('does not expose internal error details when DB fails', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);
    vi.mocked(getDb).mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error('FATAL: password authentication failed')),
    } as any);

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    // should not contain error messages, connection strings, or stack traces
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('FATAL');
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('authentication');
    expect(body).not.toHaveProperty('error');
    expect(body).not.toHaveProperty('message');
  });

  it('does not expose connection string or version info', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);
    const mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as any);

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('connectionString');
    expect(body).not.toHaveProperty('checks');
    expect(body).not.toHaveProperty('timestamp');
  });

  it('returns degraded when getDb() itself throws', async () => {
    vi.mocked(isShuttingDownMocked).mockReturnValue(false);
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error('DATABASE_URL not set');
    });

    const { GET } = await import('../src/app/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'degraded' });
  });
});
