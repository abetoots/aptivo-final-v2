/**
 * INF-04: Secrets Manager + MFA Client Factory tests
 * @task INF-04
 *
 * verifies env-based secrets provider, dual-key rotation validation,
 * and composition root mfa client wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEnvSecretsProvider,
  validateRotatingSecret,
} from '../src/lib/auth/secrets-provider.js';
import type { RotatingSecret } from '../src/lib/auth/secrets-provider.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

function setEnv(key: string, value: string) {
  process.env[key] = value;
}

function clearEnv(key: string) {
  delete process.env[key];
}

// ---------------------------------------------------------------------------
// secrets provider tests
// ---------------------------------------------------------------------------

describe('createEnvSecretsProvider', () => {
  beforeEach(() => {
    // clean test env vars before each test
    clearEnv('TEST_SECRET');
    clearEnv('TEST_SECRET_PREVIOUS');
    clearEnv('MISSING_SECRET');
    clearEnv('MISSING_SECRET_PREVIOUS');
  });

  afterEach(() => {
    // restore original env
    process.env = { ...ORIGINAL_ENV };
  });

  describe('getSecret', () => {
    it('returns value when env var is set', () => {
      setEnv('TEST_SECRET', 'my-secret-value');
      const provider = createEnvSecretsProvider();

      const result = provider.getSecret('TEST_SECRET');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('my-secret-value');
      }
    });

    it('returns error when env var is missing', () => {
      const provider = createEnvSecretsProvider();

      const result = provider.getSecret('MISSING_SECRET');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('SecretsError');
        expect(result.error.key).toBe('MISSING_SECRET');
        expect(result.error.cause).toContain('MISSING_SECRET');
        expect(result.error.cause).toContain('is not set');
      }
    });
  });

  describe('getRotatingSecret', () => {
    it('returns current + previous when both are set', () => {
      setEnv('TEST_SECRET', 'current-value');
      setEnv('TEST_SECRET_PREVIOUS', 'previous-value');
      const provider = createEnvSecretsProvider();

      const result = provider.getRotatingSecret('TEST_SECRET');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.current).toBe('current-value');
        expect(result.value.previous).toBe('previous-value');
      }
    });

    it('returns current only when no _PREVIOUS is set', () => {
      setEnv('TEST_SECRET', 'current-only');
      const provider = createEnvSecretsProvider();

      const result = provider.getRotatingSecret('TEST_SECRET');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.current).toBe('current-only');
        expect(result.value.previous).toBeUndefined();
      }
    });

    it('returns error when current env var is missing', () => {
      // only set _PREVIOUS, not the main key
      setEnv('TEST_SECRET_PREVIOUS', 'old-value');
      const provider = createEnvSecretsProvider();

      const result = provider.getRotatingSecret('TEST_SECRET');

      // the test expects error because the primary key isn't set,
      // but we set TEST_SECRET_PREVIOUS above. we need to clear the main key.
      clearEnv('TEST_SECRET');

      const result2 = provider.getRotatingSecret('TEST_SECRET');

      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error._tag).toBe('SecretsError');
        expect(result2.error.key).toBe('TEST_SECRET');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// validateRotatingSecret tests
// ---------------------------------------------------------------------------

describe('validateRotatingSecret', () => {
  it('returns true for current secret match', () => {
    const secret: RotatingSecret = { current: 'abc123' };
    expect(validateRotatingSecret('abc123', secret)).toBe(true);
  });

  it('returns true for previous secret match and logs warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secret: RotatingSecret = { current: 'new-key', previous: 'old-key' };

    const result = validateRotatingSecret('old-key', secret, 'hitl-signing');

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rotating secret matched previous key'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hitl-signing'),
    );

    warnSpy.mockRestore();
  });

  it('returns false when neither current nor previous matches', () => {
    const secret: RotatingSecret = { current: 'abc', previous: 'def' };
    expect(validateRotatingSecret('xyz', secret)).toBe(false);
  });

  it('returns false when no previous is set and current does not match', () => {
    const secret: RotatingSecret = { current: 'abc' };
    expect(validateRotatingSecret('xyz', secret)).toBe(false);
  });

  it('omits context from warning when not provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secret: RotatingSecret = { current: 'new', previous: 'old' };

    validateRotatingSecret('old', secret);

    expect(warnSpy).toHaveBeenCalledWith(
      'rotating secret matched previous key — complete rotation soon',
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// mfa client wiring tests
// ---------------------------------------------------------------------------

describe('getMfaClient (composition root)', () => {
  it('returns a stub client in test mode', async () => {
    // dynamic import to avoid pulling in full composition root at module level
    const { createMfaStubClient } = await import('../src/lib/auth/mfa-enforcement.js');
    const client = createMfaStubClient();

    // verify the stub client implements all expected methods
    expect(typeof client.enroll).toBe('function');
    expect(typeof client.challenge).toBe('function');
    expect(typeof client.verify).toBe('function');
    expect(typeof client.listFactors).toBe('function');

    // verify stub returns expected data
    const enrollResult = await client.enroll({ factorType: 'totp' });
    expect(enrollResult.ok).toBe(true);
    if (enrollResult.ok) {
      expect(enrollResult.value.factorId).toBe('stub-factor-id');
    }
  });

  it('mfa routes still return correct responses after composition root wiring', async () => {
    // test that the enroll route handler still works after switching to composition root
    const { GET: enrollHandler } = await import(
      '../src/app/api/auth/mfa/enroll/route.js'
    );

    const request = new Request('http://localhost:3000/api/auth/mfa/enroll', {
      headers: { 'x-user-id': 'test-user-id' },
    });
    const response = await enrollHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.factorId).toBe('stub-factor-id');
    expect(body.totpUri).toContain('otpauth://totp/');
  });

  it('challenge route works through composition root fallback', async () => {
    const { POST: challengeHandler } = await import(
      '../src/app/api/auth/mfa/challenge/route.js'
    );

    const request = new Request('http://localhost:3000/api/auth/mfa/challenge', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-id',
      },
      body: JSON.stringify({ factorId: 'f-1' }),
    });
    const response = await challengeHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.challengeId).toBe('stub-challenge-id');
  });

  it('verify route works through composition root fallback', async () => {
    const { POST: verifyHandler } = await import(
      '../src/app/api/auth/mfa/verify/route.js'
    );

    const request = new Request('http://localhost:3000/api/auth/mfa/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-id',
      },
      body: JSON.stringify({
        factorId: 'f-1',
        challengeId: 'c-1',
        code: '123456',
      }),
    });
    const response = await verifyHandler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.aal).toBe('aal2');
  });
});

// ---------------------------------------------------------------------------
// integration: dual-key validation for hitl signing secret rotation
// ---------------------------------------------------------------------------

describe('dual-key rotation integration', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('validates current hitl signing secret', () => {
    setEnv('HITL_SIGNING_SECRET', 'new-secret-key-32-chars-minimum!');
    setEnv('HITL_SIGNING_SECRET_PREVIOUS', 'old-secret-key-32-chars-minimum!');

    const provider = createEnvSecretsProvider();
    const result = provider.getRotatingSecret('HITL_SIGNING_SECRET');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // current key matches
    expect(
      validateRotatingSecret('new-secret-key-32-chars-minimum!', result.value, 'hitl'),
    ).toBe(true);
  });

  it('validates previous hitl signing secret during rotation window', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setEnv('HITL_SIGNING_SECRET', 'new-secret-key-32-chars-minimum!');
    setEnv('HITL_SIGNING_SECRET_PREVIOUS', 'old-secret-key-32-chars-minimum!');

    const provider = createEnvSecretsProvider();
    const result = provider.getRotatingSecret('HITL_SIGNING_SECRET');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // old key still valid during rotation
    expect(
      validateRotatingSecret('old-secret-key-32-chars-minimum!', result.value, 'hitl'),
    ).toBe(true);

    // warning emitted for old key usage
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rotating secret matched previous key'),
    );

    warnSpy.mockRestore();
  });

  it('rejects unknown secret during rotation', () => {
    setEnv('HITL_SIGNING_SECRET', 'new-secret-key-32-chars-minimum!');
    setEnv('HITL_SIGNING_SECRET_PREVIOUS', 'old-secret-key-32-chars-minimum!');

    const provider = createEnvSecretsProvider();
    const result = provider.getRotatingSecret('HITL_SIGNING_SECRET');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // unknown key rejected
    expect(
      validateRotatingSecret('wrong-secret-key-32-chars-min!!', result.value, 'hitl'),
    ).toBe(false);
  });

  it('works after rotation completes (no previous key)', () => {
    setEnv('HITL_SIGNING_SECRET', 'final-secret-key-32-chars-mini!');
    // no _PREVIOUS set — rotation is complete

    const provider = createEnvSecretsProvider();
    const result = provider.getRotatingSecret('HITL_SIGNING_SECRET');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.previous).toBeUndefined();
    expect(
      validateRotatingSecret('final-secret-key-32-chars-mini!', result.value),
    ).toBe(true);
    expect(
      validateRotatingSecret('some-other-key', result.value),
    ).toBe(false);
  });
});
