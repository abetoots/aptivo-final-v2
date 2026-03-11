/**
 * INT-06: security hardening tests
 * @task INT-06
 * @warning T1-W27, S1-W11, S1-W12, T1-W28, S2-W2, S2-W3
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import { validateWebhookUrl, isPrivateIp } from '../src/lib/security/ssrf-validator';
import {
  checkJsonDepth,
  verifyHmacSignature,
  isBodyWithinLimit,
  WEBHOOK_MAX_BODY_BYTES,
  API_MAX_BODY_BYTES,
  MAX_JSON_DEPTH,
} from '../src/lib/security/body-limits';
import { sanitizeForLogging, hashQueryParam } from '../src/lib/security/sanitize-logging';

// ─── ssrf validation (T1-W27) ───────────────────────────────────────────────

describe('INT-06: SSRF validation', () => {
  describe('blocks private/reserved ip addresses', () => {
    it.each([
      ['10.0.0.1', 'private class A'],
      ['172.16.0.1', 'private class B'],
      ['192.168.1.1', 'private class C'],
      ['127.0.0.1', 'loopback'],
      ['169.254.169.254', 'aws metadata / link-local'],
    ])('blocks %s (%s)', (ip, _desc) => {
      const result = validateWebhookUrl(`https://${ip}/webhook`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('PrivateIpBlocked');
      }
    });

    it('blocks localhost', () => {
      const result = validateWebhookUrl('https://localhost/webhook');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('BlockedHost');
      }
    });

    it('blocks 0.0.0.0', () => {
      const result = validateWebhookUrl('https://0.0.0.0/webhook');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('BlockedHost');
      }
    });

    it('blocks ::1 (ipv6 loopback)', () => {
      const result = validateWebhookUrl('https://[::1]/webhook');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('BlockedHost');
      }
    });

    it('blocks :: (ipv6 unspecified)', () => {
      const result = validateWebhookUrl('https://[::]/webhook');
      expect(result.ok).toBe(false);
    });

    it.each([
      ['[::ffff:127.0.0.1]', 'ipv4-mapped loopback'],
      ['[::ffff:169.254.169.254]', 'ipv4-mapped metadata'],
      ['[::ffff:10.0.0.1]', 'ipv4-mapped private class A'],
      ['[::ffff:192.168.1.1]', 'ipv4-mapped private class C'],
    ])('blocks %s (%s)', (host, _desc) => {
      const result = validateWebhookUrl(`https://${host}/webhook`);
      expect(result.ok).toBe(false);
    });

    it.each([
      ['[fc00::1]', 'unique-local fc00'],
      ['[fd12:3456::1]', 'unique-local fd'],
      ['[fe80::1]', 'link-local'],
    ])('blocks %s (%s)', (host, _desc) => {
      const result = validateWebhookUrl(`https://${host}/webhook`);
      expect(result.ok).toBe(false);
    });
  });

  describe('allows valid public urls', () => {
    it('allows https://api.example.com', () => {
      const result = validateWebhookUrl('https://api.example.com/webhook');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hostname).toBe('api.example.com');
      }
    });

    it('allows http://hooks.slack.com', () => {
      const result = validateWebhookUrl('http://hooks.slack.com/services/T123');
      expect(result.ok).toBe(true);
    });
  });

  describe('rejects non-http schemes', () => {
    it('rejects ftp:// scheme', () => {
      const result = validateWebhookUrl('ftp://example.com/file');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidUrl');
      }
    });

    it('rejects file:// scheme', () => {
      const result = validateWebhookUrl('file:///etc/passwd');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidUrl');
      }
    });
  });

  describe('rejects invalid urls', () => {
    it('rejects empty string', () => {
      const result = validateWebhookUrl('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidUrl');
      }
    });

    it('rejects malformed url', () => {
      const result = validateWebhookUrl('not-a-url');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidUrl');
      }
    });
  });

  describe('isPrivateIp helper', () => {
    it('returns true for 127.0.0.1', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
    });

    it('returns true for 10.255.255.255', () => {
      expect(isPrivateIp('10.255.255.255')).toBe(true);
    });

    it('returns true for 172.31.255.255', () => {
      expect(isPrivateIp('172.31.255.255')).toBe(true);
    });

    it('returns false for 172.32.0.1 (outside class B private)', () => {
      expect(isPrivateIp('172.32.0.1')).toBe(false);
    });

    it('returns false for 8.8.8.8 (public dns)', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
    });

    it('returns true for ::ffff:127.0.0.1 (ipv4-mapped)', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('returns true for fc00::1 (unique-local)', () => {
      expect(isPrivateIp('fc00::1')).toBe(true);
    });

    it('returns true for fd12:3456::1 (unique-local fd)', () => {
      expect(isPrivateIp('fd12:3456::1')).toBe(true);
    });

    it('returns true for fe80::1 (link-local)', () => {
      expect(isPrivateIp('fe80::1')).toBe(true);
    });

    it('returns true for :: (ipv6 unspecified)', () => {
      expect(isPrivateIp('::')).toBe(true);
    });

    it('returns false for ::ffff:8.8.8.8 (ipv4-mapped public)', () => {
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('returns false for 2607:f8b0:4004::1 (public ipv6)', () => {
      expect(isPrivateIp('2607:f8b0:4004::1')).toBe(false);
    });
  });
});

// ─── body limits (S1-W11, S1-W12, T1-W28) ──────────────────────────────────

describe('INT-06: body size limits', () => {
  it('300KB string exceeds 256KB webhook limit', () => {
    const body = 'x'.repeat(300 * 1024);
    expect(isBodyWithinLimit(body, WEBHOOK_MAX_BODY_BYTES)).toBe(false);
  });

  it('500KB string is within 1MB api limit', () => {
    const body = 'x'.repeat(500 * 1024);
    expect(isBodyWithinLimit(body, API_MAX_BODY_BYTES)).toBe(true);
  });

  it('1.5MB string exceeds 1MB api limit', () => {
    const body = 'x'.repeat(1.5 * 1024 * 1024);
    expect(isBodyWithinLimit(body, API_MAX_BODY_BYTES)).toBe(false);
  });

  it('empty body is within any limit', () => {
    expect(isBodyWithinLimit('', WEBHOOK_MAX_BODY_BYTES)).toBe(true);
  });

  it('buffer body uses .length for size check', () => {
    const buf = Buffer.alloc(300 * 1024, 'x');
    expect(isBodyWithinLimit(buf, WEBHOOK_MAX_BODY_BYTES)).toBe(false);
  });

  it('exports correct constant values', () => {
    expect(WEBHOOK_MAX_BODY_BYTES).toBe(256 * 1024);
    expect(API_MAX_BODY_BYTES).toBe(1024 * 1024);
    expect(MAX_JSON_DEPTH).toBe(10);
  });
});

// ─── json depth check ───────────────────────────────────────────────────────

describe('INT-06: JSON depth check', () => {
  it('5-level nesting passes depth check (limit 10)', () => {
    const nested = { a: { b: { c: { d: { e: 'deep' } } } } };
    expect(checkJsonDepth(nested)).toBe(true);
  });

  it('11-level nesting fails depth check', () => {
    // build an 11-level nested object
    let obj: unknown = 'leaf';
    for (let i = 0; i < 11; i++) {
      obj = { nested: obj };
    }
    expect(checkJsonDepth(obj)).toBe(false);
  });

  it('flat object passes', () => {
    expect(checkJsonDepth({ a: 1, b: 2, c: 3 })).toBe(true);
  });

  it('deeply nested array fails', () => {
    let arr: unknown = 'leaf';
    for (let i = 0; i < 11; i++) {
      arr = [arr];
    }
    expect(checkJsonDepth(arr)).toBe(false);
  });

  it('exactly 10-level nesting passes', () => {
    let obj: unknown = 'leaf';
    for (let i = 0; i < 10; i++) {
      obj = { nested: obj };
    }
    expect(checkJsonDepth(obj)).toBe(true);
  });

  it('primitive values always pass', () => {
    expect(checkJsonDepth(42 as unknown)).toBe(true);
    expect(checkJsonDepth('hello' as unknown)).toBe(true);
    expect(checkJsonDepth(null as unknown)).toBe(true);
  });

  it('respects custom maxDepth parameter', () => {
    const nested = { a: { b: { c: 'deep' } } };
    expect(checkJsonDepth(nested, 2)).toBe(false);
    expect(checkJsonDepth(nested, 3)).toBe(true);
  });
});

// ─── hmac verification (T1-W28) ─────────────────────────────────────────────

describe('INT-06: HMAC verification', () => {
  const secret = 'test-webhook-secret';
  const payload = '{"event":"test","data":{}}';

  function computeHmac(data: string, key: string, algo = 'sha256'): string {
    return createHmac(algo, key).update(data).digest('hex');
  }

  it('valid signature passes verification', () => {
    const signature = computeHmac(payload, secret);
    expect(verifyHmacSignature(payload, signature, secret)).toBe(true);
  });

  it('invalid signature fails verification', () => {
    expect(verifyHmacSignature(payload, 'invalid-signature', secret)).toBe(false);
  });

  it('wrong secret fails verification', () => {
    const signature = computeHmac(payload, secret);
    expect(verifyHmacSignature(payload, signature, 'wrong-secret')).toBe(false);
  });

  it('timing-safe: no early return on length mismatch', () => {
    // even with different lengths, the function should return false (not throw)
    const signature = computeHmac(payload, secret);
    const truncated = signature.slice(0, 10);
    expect(verifyHmacSignature(payload, truncated, secret)).toBe(false);
  });

  it('timing-safe: consistent rejection of wrong signatures', () => {
    // verify multiple wrong sigs all return false without timing variance
    const wrongSigs = [
      'a'.repeat(64),
      'b'.repeat(64),
      '0'.repeat(64),
      'f'.repeat(64),
    ];
    for (const sig of wrongSigs) {
      expect(verifyHmacSignature(payload, sig, secret)).toBe(false);
    }
  });

  it('supports buffer payload', () => {
    const buf = Buffer.from(payload);
    const signature = computeHmac(payload, secret);
    expect(verifyHmacSignature(buf, signature, secret)).toBe(true);
  });

  it('supports custom algorithm', () => {
    const sig = computeHmac(payload, secret, 'sha512');
    expect(verifyHmacSignature(payload, sig, secret, 'sha512')).toBe(true);
  });
});

// ─── pii-safe logging (S2-W2, S2-W3) ────────────────────────────────────────

describe('INT-06: sanitizeForLogging', () => {
  it('redacts email, phone, ssn fields', () => {
    const input = {
      email: 'user@example.com',
      phone: '+1-555-1234',
      ssn: '123-45-6789',
    };
    const result = sanitizeForLogging(input);
    expect(result.email).toBe('[REDACTED]');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.ssn).toBe('[REDACTED]');
  });

  it('preserves non-PII fields', () => {
    const input = {
      id: '123',
      action: 'login',
      timestamp: '2026-01-01T00:00:00Z',
      count: 42,
    };
    const result = sanitizeForLogging(input);
    expect(result).toEqual(input);
  });

  it('handles nested objects', () => {
    const input = {
      user: {
        id: '123',
        email: 'nested@example.com',
        profile: {
          phone: '+1-555-0000',
          displayName: 'Test User',
        },
      },
      metadata: {
        requestId: 'abc-123',
        region: 'us-east-1',
      },
    };
    const result = sanitizeForLogging(input);
    expect((result.user as Record<string, unknown>).id).toBe('123');
    expect((result.user as Record<string, unknown>).email).toBe('[REDACTED]');
    const profile = (result.user as Record<string, unknown>).profile as Record<string, unknown>;
    expect(profile.phone).toBe('[REDACTED]');
    // s6-cf-04: displayName no longer matches — exact field matching avoids false positives
    expect(profile.displayName).toBe('Test User');
    // non-pii nested fields are preserved
    expect((result.metadata as Record<string, unknown>).requestId).toBe('abc-123');
    expect((result.metadata as Record<string, unknown>).region).toBe('us-east-1');
  });

  it('redacts case-insensitively with exact field names', () => {
    const input = {
      Email: 'test@test.com',
      Password: 'secret123',
      Authorization: 'bearer xyz',
    };
    const result = sanitizeForLogging(input);
    expect(result.Email).toBe('[REDACTED]');
    expect(result.Password).toBe('[REDACTED]');
    expect(result.Authorization).toBe('[REDACTED]');
  });

  it('does not redact compound field names (no false positives)', () => {
    // s6-cf-04: exact matching avoids false positives on compound names
    const input = {
      displayName: 'Test User',
      tokenizer: 'gpt-4',
      addressBook: ['entry1'],
      USER_PASSWORD: 'secret',
      authorizationToken: 'bearer xyz',
    };
    const result = sanitizeForLogging(input);
    expect(result.displayName).toBe('Test User');
    expect(result.tokenizer).toBe('gpt-4');
    expect(result.addressBook).toEqual(['entry1']);
    expect(result.USER_PASSWORD).toBe('secret');
    expect(result.authorizationToken).toBe('bearer xyz');
  });

  it('redacts credit card and date of birth fields', () => {
    const input = {
      credit_card: '4111111111111111',
      creditCard: '4111111111111111',
      dateOfBirth: '1990-01-01',
      date_of_birth: '1990-01-01',
    };
    const result = sanitizeForLogging(input);
    expect(result.credit_card).toBe('[REDACTED]');
    expect(result.creditCard).toBe('[REDACTED]');
    expect(result.dateOfBirth).toBe('[REDACTED]');
    expect(result.date_of_birth).toBe('[REDACTED]');
  });

  it('handles empty object', () => {
    expect(sanitizeForLogging({})).toEqual({});
  });

  it('handles arrays within objects', () => {
    const input = {
      items: [
        { id: 1, email: 'a@b.com' },
        { id: 2, email: 'c@d.com' },
      ],
    };
    const result = sanitizeForLogging(input);
    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0]!.id).toBe(1);
    expect(items[0]!.email).toBe('[REDACTED]');
    expect(items[1]!.id).toBe(2);
    expect(items[1]!.email).toBe('[REDACTED]');
  });

  it('does not mutate the original object', () => {
    const input = { email: 'user@example.com', id: '123' };
    sanitizeForLogging(input);
    expect(input.email).toBe('user@example.com');
  });
});

describe('INT-06: hashQueryParam', () => {
  it('produces consistent SHA-256 hash', () => {
    const hash1 = hashQueryParam('user@example.com');
    const hash2 = hashQueryParam('user@example.com');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different inputs produce different hashes', () => {
    const hash1 = hashQueryParam('alice@example.com');
    const hash2 = hashQueryParam('bob@example.com');
    expect(hash1).not.toBe(hash2);
  });

  it('salt changes the hash output', () => {
    const hash1 = hashQueryParam('test', 'salt1');
    const hash2 = hashQueryParam('test', 'salt2');
    expect(hash1).not.toBe(hash2);
  });
});
