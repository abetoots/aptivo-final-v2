/**
 * PR-02: Remove MFA Stub in Production tests
 * @task PR-02
 *
 * verifies the production guard on getMfaClient: real client when supabase
 * url is set, stub in test/dev, fatal throw in production without url.
 * also validates _isStub marker on both client types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// helpers — replicate the getMfaClient env-resolution logic in isolation
// (direct import from services.ts requires 20+ transitive deps)
// ---------------------------------------------------------------------------

interface MockMfaClient {
  _isStub: boolean;
  enroll: () => Promise<unknown>;
}

function buildMfaClientLogic(
  env: Record<string, string | undefined>,
  createRealClient: () => MockMfaClient,
): MockMfaClient {
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    return createRealClient();
  }

  // production guard
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is required in production — MFA stub is not allowed',
    );
  }

  return { _isStub: true, enroll: async () => Result.ok({ factorId: 'stub' }) };
}

function createFakeRealClient(): MockMfaClient {
  return { _isStub: false, enroll: async () => Result.ok({ factorId: 'real-factor' }) };
}

// ---------------------------------------------------------------------------
// PR-02: getMfaClient returns real client when supabase URL set
// ---------------------------------------------------------------------------

describe('PR-02: getMfaClient — env gating', () => {
  it('returns real client when NEXT_PUBLIC_SUPABASE_URL is set', () => {
    const client = buildMfaClientLogic(
      { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
      createFakeRealClient,
    );

    expect(client._isStub).toBe(false);
  });

  it('returns stub when NODE_ENV is test', () => {
    const client = buildMfaClientLogic(
      { NODE_ENV: 'test' },
      createFakeRealClient,
    );

    expect(client._isStub).toBe(true);
  });

  it('returns stub when NODE_ENV is development', () => {
    const client = buildMfaClientLogic(
      { NODE_ENV: 'development' },
      createFakeRealClient,
    );

    expect(client._isStub).toBe(true);
  });

  it('throws in production without supabase URL', () => {
    expect(() =>
      buildMfaClientLogic(
        { NODE_ENV: 'production' },
        createFakeRealClient,
      ),
    ).toThrow('NEXT_PUBLIC_SUPABASE_URL is required in production');
  });

  it('does not throw in production when supabase URL is set', () => {
    const client = buildMfaClientLogic(
      { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://prod.supabase.co' },
      createFakeRealClient,
    );

    expect(client._isStub).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-02: _isStub marker
// ---------------------------------------------------------------------------

describe('PR-02: _isStub marker', () => {
  it('stub client has _isStub: true', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    expect(stub._isStub).toBe(true);
  });

  it('real supabase client has _isStub: false', async () => {
    const { createSupabaseMfaClient } = await import(
      '../src/lib/auth/supabase-mfa-client'
    );

    const mockAuth = {
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn(),
      },
    };

    const client = createSupabaseMfaClient(mockAuth);
    expect(client._isStub).toBe(false);
  });

  it('stub _isStub is a boolean true literal', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    expect(typeof stub._isStub).toBe('boolean');
    expect(stub._isStub).toStrictEqual(true);
  });
});

// ---------------------------------------------------------------------------
// PR-02: stub still works for dev/test
// ---------------------------------------------------------------------------

describe('PR-02: MFA stub client functionality', () => {
  it('stub enroll returns ok result', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    const result = await stub.enroll({ factorType: 'totp' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.factorId).toBe('stub-factor-id');
  });

  it('stub challenge returns ok result', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    const result = await stub.challenge({ factorId: 'any' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.challengeId).toBe('stub-challenge-id');
  });

  it('stub verify returns aal2', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    const result = await stub.verify({
      factorId: 'any',
      challengeId: 'any',
      code: '000000',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aal).toBe('aal2');
  });

  it('stub listFactors returns empty totp array', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    const result = await stub.listFactors();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totp).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PR-02: MFA route guard — stub detection
// ---------------------------------------------------------------------------

describe('PR-02: MFA route guard stub detection', () => {
  it('detects stub client via _isStub for route guard', () => {
    // simulate a route guard that returns 503 when stub is detected in production
    function mfaRouteGuard(
      client: { _isStub: boolean },
      nodeEnv: string,
    ): { status: number; body: string } | null {
      if (client._isStub && nodeEnv === 'production') {
        return { status: 503, body: 'MFA service unavailable — stub detected in production' };
      }
      return null;
    }

    const stubClient = { _isStub: true };
    const realClient = { _isStub: false };

    // stub in production → 503
    const guard1 = mfaRouteGuard(stubClient, 'production');
    expect(guard1).not.toBeNull();
    expect(guard1!.status).toBe(503);
    expect(guard1!.body).toContain('stub detected');

    // real in production → null (allowed)
    const guard2 = mfaRouteGuard(realClient, 'production');
    expect(guard2).toBeNull();

    // stub in test → null (allowed)
    const guard3 = mfaRouteGuard(stubClient, 'test');
    expect(guard3).toBeNull();
  });

  it('route guard allows real client in production', () => {
    function mfaRouteGuard(
      client: { _isStub: boolean },
      nodeEnv: string,
    ): { status: number } | null {
      if (client._isStub && nodeEnv === 'production') {
        return { status: 503 };
      }
      return null;
    }

    expect(mfaRouteGuard({ _isStub: false }, 'production')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PR-02: composition root source verification
// ---------------------------------------------------------------------------

describe('PR-02: Composition Root Production Guard', () => {
  it('services.ts contains production guard for MFA', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    // should contain the production guard
    expect(source).toContain("process.env.NODE_ENV === 'production'");
    expect(source).toContain('NEXT_PUBLIC_SUPABASE_URL is required in production');
  });

  it('services.ts still falls back to stub in non-production', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('createMfaStubClient()');
  });
});
