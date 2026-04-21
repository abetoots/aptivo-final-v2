/**
 * WFE3-02: JWT auth verification tests.
 *
 * `verifyWsToken` is a thin wrapper over jose's `jwtVerify`. It's
 * deliberately generic (doesn't know about HITL-specific claims) and
 * extracts only what the ws protocol needs: sub (userId), roles, exp.
 */

import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { verifyWsToken } from '../src/auth.js';

const SECRET = 'unit-test-secret-32-chars-minimum-length-here';
const ISSUER = 'aptivo-web';
const AUDIENCE = 'aptivo-ws';

function key(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function mint(opts: {
  sub: string;
  roles?: string[];
  expSeconds?: number;
  issuer?: string;
  audience?: string;
  secret?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: opts.roles ?? [] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expSeconds ?? 300))
    .sign(key(opts.secret ?? SECRET));
}

describe('WFE3-02: verifyWsToken — success', () => {
  it('returns userId + roles + exp for a valid token', async () => {
    const token = await mint({ sub: 'user-1', roles: ['admin', 'user'] });
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe('user-1');
    expect(result.value.roles).toEqual(['admin', 'user']);
    expect(result.value.expMs).toBeGreaterThan(Date.now());
  });

  it('treats missing roles claim as empty array', async () => {
    const token = await new SignJWT({}) // no roles
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-2')
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(key(SECRET));
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roles).toEqual([]);
  });
});

describe('WFE3-02: verifyWsToken — failure modes', () => {
  it('rejects tokens signed with a different secret (invalid-signature)', async () => {
    const token = await mint({ sub: 'u', secret: 'totally-different-signing-secret-xxxxx' });
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidSignature');
  });

  it('rejects expired tokens', async () => {
    const token = await mint({ sub: 'u', expSeconds: -10 });
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('Expired');
  });

  it('rejects tokens with wrong audience', async () => {
    const token = await mint({ sub: 'u', audience: 'some-other-service' });
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidClaim');
  });

  it('rejects tokens missing the sub claim', async () => {
    const token = await new SignJWT({ roles: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(key(SECRET));
    const result = await verifyWsToken(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('Malformed');
  });

  it('rejects garbage (not a JWT at all)', async () => {
    const result = await verifyWsToken('not-a-jwt', { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(result.ok).toBe(false);
  });
});
