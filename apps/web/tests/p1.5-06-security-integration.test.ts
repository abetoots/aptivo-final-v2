/**
 * P1.5-06: security runtime integration tests
 * @task P1.5-06
 *
 * verifies that sanitizeEnvForMcp is wired into the agentkit adapter
 * and that safeFetch blocks SSRF targets while allowing public URLs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// imports
// ---------------------------------------------------------------------------

import { sanitizeEnvForMcp } from '@aptivo/mcp-layer';
import { safeFetch } from '@/lib/security/safe-fetch.js';

// ---------------------------------------------------------------------------
// RR-1: agentkit adapter + sanitizeEnvForMcp integration
// ---------------------------------------------------------------------------

describe('P1.5-06 RR-1: AgentKit adapter env sanitization', () => {
  /**
   * the adapter calls sanitizeEnvForMcp(process.env, config.envAllowlist)
   * at construction time. we test the sanitizer directly here with the
   * same contract the adapter uses, and verify the wiring exists via a
   * source-level grep in a separate assertion.
   */
  const fakeEnv: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    PATH: '/usr/bin',
    HOME: '/home/test',
    DATABASE_URL: 'postgres://secret@db:5432/aptivo',
    REDIS_URL: 'redis://localhost:6379',
    SECRET_KEY: 'super-secret-123',
    MY_CUSTOM_VAR: 'custom-value',
  };

  it('strips DATABASE_URL from sanitized env', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv);

    expect(sanitized).not.toHaveProperty('DATABASE_URL');
  });

  it('strips REDIS_URL from sanitized env', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv);

    expect(sanitized).not.toHaveProperty('REDIS_URL');
  });

  it('strips SECRET_KEY from sanitized env', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv);

    expect(sanitized).not.toHaveProperty('SECRET_KEY');
  });

  it('preserves safe system vars (NODE_ENV, PATH, HOME)', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv);

    expect(sanitized).toHaveProperty('NODE_ENV', 'test');
    expect(sanitized).toHaveProperty('PATH', '/usr/bin');
    expect(sanitized).toHaveProperty('HOME', '/home/test');
  });

  it('passes envAllowlist through to sanitizer', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv, ['MY_CUSTOM_VAR']);

    expect(sanitized).toHaveProperty('MY_CUSTOM_VAR', 'custom-value');
  });

  it('envAllowlist does not override blocked patterns', () => {
    const sanitized = sanitizeEnvForMcp(fakeEnv, ['DATABASE_URL']);

    // DATABASE_ pattern always blocked even if explicitly allowlisted
    expect(sanitized).not.toHaveProperty('DATABASE_URL');
  });

  // @testtype doc-lint
  it('adapter source imports and calls sanitizeEnvForMcp', async () => {
    // verify the wiring exists in the adapter source
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const adapterPath = resolve(
      import.meta.dirname,
      '../../../packages/mcp-layer/src/transport/agentkit-adapter.ts',
    );
    const adapterSrc = readFileSync(adapterPath, 'utf-8');

    expect(adapterSrc).toContain("import { sanitizeEnvForMcp }");
    expect(adapterSrc).toContain("sanitizeEnvForMcp(");
    expect(adapterSrc).toContain("envAllowlist");
    expect(adapterSrc).toContain("sanitizedEnv");
  });
});

// ---------------------------------------------------------------------------
// RR-7: safeFetch SSRF validation
// ---------------------------------------------------------------------------

describe('P1.5-06 RR-7: safeFetch SSRF validation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // stub global fetch to avoid real network calls
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200 }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('blocks private IP 10.x.x.x', async () => {
    const result = await safeFetch('http://10.0.0.1/webhook');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks loopback 127.0.0.1', async () => {
    const result = await safeFetch('http://127.0.0.1:8080/hook');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks localhost', async () => {
    const result = await safeFetch('http://localhost/internal');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks metadata endpoint 169.254.169.254', async () => {
    const result = await safeFetch('http://169.254.169.254/latest/meta-data/');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks 192.168.x.x private range', async () => {
    const result = await safeFetch('http://192.168.1.1/admin');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks non-http schemes (ftp)', async () => {
    const result = await safeFetch('ftp://files.example.com/data');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows public URL and returns response', async () => {
    const result = await safeFetch('https://hooks.example.com/webhook', {
      method: 'POST',
      body: '{"event":"test"}',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe(200);
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://hooks.example.com/webhook',
      { method: 'POST', body: '{"event":"test"}' },
    );
  });

  it('returns FetchFailed when fetch throws', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('network error'));

    const result = await safeFetch('https://hooks.example.com/webhook');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('FetchFailed');
      if (result.error._tag === 'FetchFailed') {
        expect(result.error.message).toBe('network error');
      }
    }
  });

  it('rejects invalid URL strings', async () => {
    const result = await safeFetch('not-a-url');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SsrfBlocked');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
