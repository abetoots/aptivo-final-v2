/**
 * @testcase SP-11-SEC-001 through SP-11-SEC-010
 * @requirements ADD §4.1 (Token Security)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-11
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateHitlToken,
  verifyHitlToken,
  hashToken,
  clearJtiStore,
  type TokenGenerationOptions,
  type VerifyOptions,
} from '../src/tokens/index.js';

const SECRET = 'a-sufficiently-long-signing-secret-32ch!';
const SECRET_ALT = 'another-long-signing-secret-for-rotation!!';

const defaultOpts: TokenGenerationOptions = {
  requestId: 'req-001',
  action: 'approve',
  channel: 'email',
  audience: 'hitl-approval',
  issuer: 'aptivo-hitl-gateway',
  ttlSeconds: 900,
};

const verifyOpts: VerifyOptions = {
  audience: 'hitl-approval',
  issuer: 'aptivo-hitl-gateway',
};

describe('SP-11: HITL Token Security', () => {
  beforeEach(() => {
    clearJtiStore();
  });

  // ---------------------------------------------------------------------------
  // token generation
  // ---------------------------------------------------------------------------
  describe('token generation', () => {
    it('generates a signed JWT with JTI, hash, and expiry', async () => {
      const result = await generateHitlToken(defaultOpts, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.token).toBeTruthy();
      expect(result.value.jti).toBeTruthy();
      expect(result.value.tokenHash).toBeTruthy();
      expect(result.value.expiresAt).toBeInstanceOf(Date);
      expect(result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('generates unique JTI per token', async () => {
      const r1 = await generateHitlToken(defaultOpts, SECRET);
      const r2 = await generateHitlToken(defaultOpts, SECRET);
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;
      expect(r1.value.jti).not.toBe(r2.value.jti);
    });

    it('rejects short signing secret', async () => {
      const result = await generateHitlToken(defaultOpts, 'short');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('at least 32 characters');
    });

    it('rejects invalid TTL', async () => {
      const result = await generateHitlToken(
        { ...defaultOpts, ttlSeconds: 7200 },
        SECRET,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('TTL must be between');
    });

    it('defaults to 15 min TTL when not specified', async () => {
      const opts = { ...defaultOpts };
      delete opts.ttlSeconds;
      const result = await generateHitlToken(opts, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // should expire ~15 min from now
      const diffMs = result.value.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(14 * 60 * 1_000);
      expect(diffMs).toBeLessThanOrEqual(15 * 60 * 1_000 + 1_000);
    });
  });

  // ---------------------------------------------------------------------------
  // token hash storage
  // ---------------------------------------------------------------------------
  describe('token hash storage', () => {
    it('hashes token using SHA-256', () => {
      const hash = hashToken('some-token-string');
      // sha-256 hex is 64 characters
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent hashes for same token', () => {
      expect(hashToken('token-a')).toBe(hashToken('token-a'));
    });

    it('produces different hashes for different tokens', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });

    it('token hash matches generated tokenHash field', async () => {
      const result = await generateHitlToken(defaultOpts, SECRET);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(hashToken(result.value.token)).toBe(result.value.tokenHash);
    });
  });

  // ---------------------------------------------------------------------------
  // token verification — valid tokens
  // ---------------------------------------------------------------------------
  describe('verification of valid tokens', () => {
    it('verifies a valid token and returns payload', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(gen.value.token, SECRET, verifyOpts);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.requestId).toBe('req-001');
      expect(result.value.action).toBe('approve');
      expect(result.value.channel).toBe('email');
      expect(result.value.jti).toBe(gen.value.jti);
      expect(result.value.aud).toBe('hitl-approval');
      expect(result.value.iss).toBe('aptivo-hitl-gateway');
    });
  });

  // ---------------------------------------------------------------------------
  // expired tokens
  // ---------------------------------------------------------------------------
  describe('expiry enforcement', () => {
    it('rejects expired tokens', async () => {
      // generate with 1s TTL then wait
      const gen = await generateHitlToken(
        { ...defaultOpts, ttlSeconds: 1 },
        SECRET,
      );
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      // wait for expiry
      await new Promise((r) => setTimeout(r, 1_100));

      const result = await verifyHitlToken(gen.value.token, SECRET, verifyOpts);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('expired');
    });
  });

  // ---------------------------------------------------------------------------
  // invalid signatures
  // ---------------------------------------------------------------------------
  describe('signature validation', () => {
    it('rejects tokens signed with wrong secret', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(
        gen.value.token,
        'wrong-secret-that-is-also-at-least-32chars!!',
        verifyOpts,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });

    it('rejects tampered tokens', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      // corrupt the payload portion
      const parts = gen.value.token.split('.');
      parts[1] = parts[1]!.slice(0, -2) + 'XX';
      const tampered = parts.join('.');

      const result = await verifyHitlToken(tampered, SECRET, verifyOpts);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });
  });

  // ---------------------------------------------------------------------------
  // audience / issuer binding
  // ---------------------------------------------------------------------------
  describe('audience and issuer binding', () => {
    it('rejects tokens with wrong audience', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(gen.value.token, SECRET, {
        ...verifyOpts,
        audience: 'wrong-audience',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-audience');
    });

    it('rejects tokens with wrong issuer', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(gen.value.token, SECRET, {
        ...verifyOpts,
        issuer: 'wrong-issuer',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-issuer');
    });
  });

  // ---------------------------------------------------------------------------
  // JTI replay prevention
  // ---------------------------------------------------------------------------
  describe('JTI replay prevention', () => {
    it('rejects reused JTI (replay attack)', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      // first verification succeeds
      const first = await verifyHitlToken(gen.value.token, SECRET, verifyOpts);
      expect(first.ok).toBe(true);

      // replay same token — should fail
      const replay = await verifyHitlToken(gen.value.token, SECRET, verifyOpts);
      expect(replay.ok).toBe(false);
      if (replay.ok) return;
      expect(replay.error.reason).toBe('replayed-jti');
    });

    it('accepts different tokens with different JTIs', async () => {
      const gen1 = await generateHitlToken(defaultOpts, SECRET);
      const gen2 = await generateHitlToken(defaultOpts, SECRET);
      expect(gen1.ok && gen2.ok).toBe(true);
      if (!gen1.ok || !gen2.ok) return;

      const r1 = await verifyHitlToken(gen1.value.token, SECRET, verifyOpts);
      const r2 = await verifyHitlToken(gen2.value.token, SECRET, verifyOpts);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // channel binding
  // ---------------------------------------------------------------------------
  describe('channel binding', () => {
    it('includes channel in verified payload', async () => {
      const gen = await generateHitlToken(
        { ...defaultOpts, channel: 'slack' },
        SECRET,
      );
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(gen.value.token, SECRET, verifyOpts);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.channel).toBe('slack');
    });
  });

  // ---------------------------------------------------------------------------
  // key rotation (dual-key)
  // ---------------------------------------------------------------------------
  describe('key rotation (dual-key validation)', () => {
    it('verifies token with new key during rotation', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET_ALT);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      // verify with [newKey, oldKey] array — new key matches
      const result = await verifyHitlToken(
        gen.value.token,
        [SECRET_ALT, SECRET],
        verifyOpts,
      );
      expect(result.ok).toBe(true);
    });

    it('verifies token signed with old key during rotation', async () => {
      // token signed with old key
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      // verify with [newKey, oldKey] — old key matches on second attempt
      const result = await verifyHitlToken(
        gen.value.token,
        [SECRET_ALT, SECRET],
        verifyOpts,
      );
      expect(result.ok).toBe(true);
    });

    it('fails when neither key matches', async () => {
      const gen = await generateHitlToken(defaultOpts, SECRET);
      expect(gen.ok).toBe(true);
      if (!gen.ok) return;

      const result = await verifyHitlToken(
        gen.value.token,
        ['neither-this-key-which-is-also-32-chars!!', 'nor-this-key-which-is-also-32-characters!'],
        verifyOpts,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe('invalid-signature');
    });
  });
});
