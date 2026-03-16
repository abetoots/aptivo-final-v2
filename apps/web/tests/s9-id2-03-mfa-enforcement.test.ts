/**
 * ID2-03: Admin MFA Enrollment & Enforcement tests
 * @task ID2-03
 *
 * verifies mfa enforcement middleware, stub client behavior,
 * and mfa api route handlers.
 */

import { describe, it, expect } from 'vitest';
import {
  createMfaEnforcement,
  createMfaStubClient,
  SENSITIVE_OPERATIONS,
} from '../src/lib/auth/mfa-enforcement.js';
import { GET as enrollHandler } from '../src/app/api/auth/mfa/enroll/route.js';
import { POST as verifyHandler } from '../src/app/api/auth/mfa/verify/route.js';
import { POST as challengeHandler } from '../src/app/api/auth/mfa/challenge/route.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// authenticated request helpers — include x-user-id for dev-mode auth
function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'test-user-id' },
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'test-user-id' },
    body: 'not-json{{{',
  });
}

// ---------------------------------------------------------------------------
// mfa enforcement tests
// ---------------------------------------------------------------------------

describe('createMfaEnforcement', () => {
  describe('requireMfa', () => {
    it('returns null for non-sensitive operations with any aal', () => {
      const enforcement = createMfaEnforcement();
      // a non-sensitive permission should pass regardless of aal
      expect(enforcement.requireMfa('crypto/trade.view', undefined)).toBeNull();
      expect(enforcement.requireMfa('crypto/trade.view', 'aal1')).toBeNull();
      expect(enforcement.requireMfa('crypto/trade.view', 'aal2')).toBeNull();
    });

    it('returns null for sensitive operations with aal2', () => {
      const enforcement = createMfaEnforcement();
      for (const op of SENSITIVE_OPERATIONS) {
        expect(enforcement.requireMfa(op, 'aal2')).toBeNull();
      }
    });

    it('returns 403 for sensitive operations with aal1', async () => {
      const enforcement = createMfaEnforcement();
      const response = enforcement.requireMfa('platform/admin.view', 'aal1');

      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(403);

      const body = await response!.json();
      expect(body.errorCode).toBe('mfa_required');
      expect(body.detail).toContain('platform/admin.view');
    });

    it('returns 403 for sensitive operations with undefined aal', async () => {
      const enforcement = createMfaEnforcement();
      const response = enforcement.requireMfa('platform/admin.manage', undefined);

      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(403);

      const body = await response!.json();
      expect(body.errorCode).toBe('mfa_required');
    });

    it('403 response includes mfaChallengeUrl and error details', async () => {
      const enforcement = createMfaEnforcement();
      const response = enforcement.requireMfa('platform/roles.assign', 'aal1');

      expect(response).toBeInstanceOf(Response);
      const body = await response!.json();

      expect(body.type).toBe('https://aptivo.dev/errors/mfa-required');
      expect(body.title).toBe('MFA Required');
      expect(body.status).toBe(403);
      expect(body.errorCode).toBe('mfa_required');
      expect(body.mfaChallengeUrl).toBe('/api/auth/mfa/challenge');
      expect(body.detail).toContain('platform/roles.assign');
    });

    it('uses custom challenge URL when provided', async () => {
      const enforcement = createMfaEnforcement({
        challengeBaseUrl: '/custom/mfa/challenge',
      });
      const response = enforcement.requireMfa('platform/admin.view', 'aal1');

      const body = await response!.json();
      expect(body.mfaChallengeUrl).toBe('/custom/mfa/challenge');
    });

    it('uses custom sensitive operations list when provided', () => {
      const enforcement = createMfaEnforcement({
        sensitiveOperations: ['custom/op.one', 'custom/op.two'],
      });

      // default sensitive ops should not be enforced
      expect(enforcement.requireMfa('platform/admin.view', 'aal1')).toBeNull();

      // custom ops should be enforced
      expect(enforcement.requireMfa('custom/op.one', 'aal1')).toBeInstanceOf(Response);
      expect(enforcement.requireMfa('custom/op.two', undefined)).toBeInstanceOf(Response);

      // custom ops with aal2 should pass
      expect(enforcement.requireMfa('custom/op.one', 'aal2')).toBeNull();
    });
  });

  describe('isSensitiveOperation', () => {
    it('returns true for operations in the sensitive list', () => {
      const enforcement = createMfaEnforcement();
      for (const op of SENSITIVE_OPERATIONS) {
        expect(enforcement.isSensitiveOperation(op)).toBe(true);
      }
    });

    it('returns false for non-sensitive operations', () => {
      const enforcement = createMfaEnforcement();
      expect(enforcement.isSensitiveOperation('crypto/trade.view')).toBe(false);
      expect(enforcement.isSensitiveOperation('hr/candidate.read')).toBe(false);
      expect(enforcement.isSensitiveOperation('')).toBe(false);
    });

    it('respects custom sensitive operations list', () => {
      const enforcement = createMfaEnforcement({
        sensitiveOperations: ['custom/op.one'],
      });

      expect(enforcement.isSensitiveOperation('custom/op.one')).toBe(true);
      expect(enforcement.isSensitiveOperation('platform/admin.view')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// stub client tests
// ---------------------------------------------------------------------------

describe('createMfaStubClient', () => {
  it('enroll returns success with totp uri and qr code', async () => {
    const client = createMfaStubClient();
    const result = await client.enroll({ factorType: 'totp', friendlyName: 'Test' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorId).toBe('stub-factor-id');
      expect(result.value.totpUri).toContain('otpauth://totp/');
      expect(result.value.qrCode).toMatch(/^data:image\//);
    }
  });

  it('challenge returns success with challenge id', async () => {
    const client = createMfaStubClient();
    const result = await client.challenge({ factorId: 'some-factor' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.challengeId).toBe('stub-challenge-id');
      expect(result.value.factorId).toBe('stub-factor-id');
    }
  });

  it('verify returns success with aal2', async () => {
    const client = createMfaStubClient();
    const result = await client.verify({
      factorId: 'f',
      challengeId: 'c',
      code: '123456',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.aal).toBe('aal2');
      expect(result.value.factorId).toBe('stub-factor-id');
    }
  });

  it('listFactors returns empty list', async () => {
    const client = createMfaStubClient();
    const result = await client.listFactors();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totp).toStrictEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// mfa route tests
// ---------------------------------------------------------------------------

describe('GET /api/auth/mfa/enroll', () => {
  it('returns 200 with totp enrollment data', async () => {
    const request = new Request('http://localhost:3000/api/auth/mfa/enroll', {
      headers: { 'x-user-id': 'test-user-id' },
    });
    const response = await enrollHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.factorId).toBe('stub-factor-id');
    expect(body.totpUri).toContain('otpauth://totp/');
    expect(body.qrCode).toMatch(/^data:image\//);
  });
});

describe('POST /api/auth/mfa/verify', () => {
  it('returns 200 with aal2 when given valid body', async () => {
    const request = jsonRequest('http://localhost:3000/api/auth/mfa/verify', {
      factorId: 'f-1',
      challengeId: 'c-1',
      code: '123456',
    });
    const response = await verifyHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.aal).toBe('aal2');
    expect(body.factorId).toBe('stub-factor-id');
  });

  it('returns 400 when fields are missing', async () => {
    const request = jsonRequest('http://localhost:3000/api/auth/mfa/verify', {
      factorId: 'f-1',
      // missing challengeId and code
    });
    const response = await verifyHandler(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.title).toBe('Missing Fields');
    expect(body.detail).toContain('factorId, challengeId, and code are required');
  });

  it('returns 400 when body is invalid json', async () => {
    const request = invalidJsonRequest('http://localhost:3000/api/auth/mfa/verify');
    const response = await verifyHandler(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.title).toBe('Invalid Request Body');
  });
});

describe('POST /api/auth/mfa/challenge', () => {
  it('returns 200 with challenge data when given valid factorId', async () => {
    const request = jsonRequest('http://localhost:3000/api/auth/mfa/challenge', {
      factorId: 'f-1',
    });
    const response = await challengeHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.challengeId).toBe('stub-challenge-id');
    expect(body.factorId).toBe('stub-factor-id');
  });

  it('returns 400 when factorId is missing', async () => {
    const request = jsonRequest('http://localhost:3000/api/auth/mfa/challenge', {});
    const response = await challengeHandler(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.title).toBe('Missing Fields');
    expect(body.detail).toContain('factorId is required');
  });

  it('returns 400 when body is invalid json', async () => {
    const request = invalidJsonRequest('http://localhost:3000/api/auth/mfa/challenge');
    const response = await challengeHandler(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.title).toBe('Invalid Request Body');
  });
});
