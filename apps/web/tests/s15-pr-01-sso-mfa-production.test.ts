/**
 * PR-01: Supabase Pro OIDC SSO + MFA Config tests
 * @task PR-01
 *
 * verifies the real supabase mfa client wrapper, oidc provider loading,
 * claim mapping, and jit provisioning flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock supabase auth client factory
// ---------------------------------------------------------------------------

function createMockSupabaseAuth() {
  return {
    mfa: {
      enroll: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
      listFactors: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// PR-01: supabase mfa client
// ---------------------------------------------------------------------------

describe('PR-01: createSupabaseMfaClient', () => {
  let mockAuth: ReturnType<typeof createMockSupabaseAuth>;

  beforeEach(() => {
    mockAuth = createMockSupabaseAuth();
  });

  async function getClient() {
    const { createSupabaseMfaClient } = await import(
      '../src/lib/auth/supabase-mfa-client'
    );
    return createSupabaseMfaClient(mockAuth);
  }

  // -------------------------------------------------------------------------
  // enroll
  // -------------------------------------------------------------------------

  it('enroll returns factorId, totpUri, and qrCode on success', async () => {
    mockAuth.mfa.enroll.mockResolvedValue({
      data: {
        id: 'factor-123',
        totp: { uri: 'otpauth://totp/Aptivo:user@test.com?secret=ABC', qr_code: 'data:image/png;base64,abc' },
      },
      error: null,
    });

    const client = await getClient();
    const result = await client.enroll({ factorType: 'totp', friendlyName: 'My Phone' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.factorId).toBe('factor-123');
    expect(result.value.totpUri).toContain('otpauth://totp/');
    expect(result.value.qrCode).toContain('data:image/');
  });

  it('enroll with friendlyName passes it to supabase', async () => {
    mockAuth.mfa.enroll.mockResolvedValue({
      data: { id: 'f-1', totp: { uri: 'uri', qr_code: 'qr' } },
      error: null,
    });

    const client = await getClient();
    await client.enroll({ factorType: 'totp', friendlyName: 'Work Authenticator' });

    expect(mockAuth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Work Authenticator',
    });
  });

  it('enroll error returns EnrollError', async () => {
    mockAuth.mfa.enroll.mockResolvedValue({
      data: null,
      error: { message: 'enrollment limit reached' },
    });

    const client = await getClient();
    const result = await client.enroll({ factorType: 'totp' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('EnrollError');
    expect(result.error.cause).toEqual({ message: 'enrollment limit reached' });
  });

  it('enroll with null data and null error returns EnrollError', async () => {
    mockAuth.mfa.enroll.mockResolvedValue({ data: null, error: null });

    const client = await getClient();
    const result = await client.enroll({ factorType: 'totp' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('EnrollError');
  });

  // -------------------------------------------------------------------------
  // challenge
  // -------------------------------------------------------------------------

  it('challenge returns challengeId on success', async () => {
    mockAuth.mfa.challenge.mockResolvedValue({
      data: { id: 'challenge-456' },
      error: null,
    });

    const client = await getClient();
    const result = await client.challenge('factor-123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.challengeId).toBe('challenge-456');
  });

  it('challenge error returns ChallengeError', async () => {
    mockAuth.mfa.challenge.mockResolvedValue({
      data: null,
      error: { message: 'factor not found' },
    });

    const client = await getClient();
    const result = await client.challenge('bad-factor');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ChallengeError');
  });

  // -------------------------------------------------------------------------
  // verify
  // -------------------------------------------------------------------------

  it('verify returns aal2 on success', async () => {
    mockAuth.mfa.verify.mockResolvedValue({
      data: { session: { aal: 'aal2' } },
      error: null,
    });

    const client = await getClient();
    const result = await client.verify({
      factorId: 'factor-123',
      challengeId: 'challenge-456',
      code: '123456',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aal).toBe('aal2');
  });

  it('verify error returns VerifyError', async () => {
    mockAuth.mfa.verify.mockResolvedValue({
      data: null,
      error: { message: 'invalid code' },
    });

    const client = await getClient();
    const result = await client.verify({
      factorId: 'factor-123',
      challengeId: 'challenge-456',
      code: '000000',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('VerifyError');
    expect(result.error.cause).toEqual({ message: 'invalid code' });
  });

  it('verify returns aal1 when mfa not yet completed', async () => {
    mockAuth.mfa.verify.mockResolvedValue({
      data: { session: { aal: 'aal1' } },
      error: null,
    });

    const client = await getClient();
    const result = await client.verify({
      factorId: 'factor-123',
      challengeId: 'challenge-456',
      code: '111111',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aal).toBe('aal1');
  });

  // -------------------------------------------------------------------------
  // listFactors
  // -------------------------------------------------------------------------

  it('listFactors maps friendly_name to friendlyName', async () => {
    mockAuth.mfa.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: 'f-1', type: 'totp', friendly_name: 'My Phone', status: 'verified' },
          { id: 'f-2', type: 'totp', friendly_name: undefined, status: 'unverified' },
        ],
      },
      error: null,
    });

    const client = await getClient();
    const result = await client.listFactors();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]).toEqual({
      id: 'f-1',
      type: 'totp',
      friendlyName: 'My Phone',
      status: 'verified',
    });
    expect(result.value[1]!.friendlyName).toBeUndefined();
  });

  it('listFactors error returns ListError', async () => {
    mockAuth.mfa.listFactors.mockResolvedValue({
      data: null,
      error: { message: 'unauthorized' },
    });

    const client = await getClient();
    const result = await client.listFactors();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ListError');
  });

  it('listFactors returns empty array when no factors exist', async () => {
    mockAuth.mfa.listFactors.mockResolvedValue({
      data: { all: [] },
      error: null,
    });

    const client = await getClient();
    const result = await client.listFactors();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // _isStub marker
  // -------------------------------------------------------------------------

  it('_isStub is false (not a stub client)', async () => {
    const client = await getClient();
    expect(client._isStub).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-01: OIDC provider loading from env
// ---------------------------------------------------------------------------

describe('PR-01: loadProvidersFromEnv with real config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('parses OIDC_PROVIDERS_CONFIG with 2 providers', async () => {
    const providers = [
      {
        providerId: 'azure-ad',
        displayName: 'Azure AD',
        issuerUrl: 'https://login.microsoftonline.com/tenant-id/v2.0',
        clientId: 'azure-client-id',
        groupToRoleMapping: { 'Admins': 'admin', 'Editors': 'editor' },
        defaultRole: 'viewer',
        domains: ['company.com'],
      },
      {
        providerId: 'google-workspace',
        displayName: 'Google Workspace',
        issuerUrl: 'https://accounts.google.com',
        clientId: 'google-client-id',
        groupToRoleMapping: { 'engineering': 'developer' },
        defaultRole: 'user',
        domains: ['corp.dev'],
      },
    ];
    process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify(providers);

    const { loadProvidersFromEnv } = await import('../src/lib/auth/oidc-provider');
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.providerId).toBe('azure-ad');
    expect(result.value[1]!.providerId).toBe('google-workspace');
  });

  it('returns empty array when OIDC_PROVIDERS_CONFIG is not set', async () => {
    delete process.env.OIDC_PROVIDERS_CONFIG;

    const { loadProvidersFromEnv } = await import('../src/lib/auth/oidc-provider');
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns OidcConfigError for invalid JSON', async () => {
    process.env.OIDC_PROVIDERS_CONFIG = '{not valid json}';

    const { loadProvidersFromEnv } = await import('../src/lib/auth/oidc-provider');
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('OidcConfigError');
  });
});

// ---------------------------------------------------------------------------
// PR-01: ClaimMapper maps groups to roles
// ---------------------------------------------------------------------------

describe('PR-01: ClaimMapper group-to-role mapping', () => {
  it('maps idp groups to aptivo roles via provider config', async () => {
    const { createClaimMapper } = await import('../src/lib/auth/oidc-provider');

    const mapper = createClaimMapper({
      providers: [
        {
          providerId: 'azure-ad',
          displayName: 'Azure AD',
          issuerUrl: 'https://login.microsoftonline.com/tenant/v2.0',
          clientId: 'cid',
          groupToRoleMapping: { 'Admins': 'admin', 'Developers': 'developer' },
          defaultRole: 'viewer',
          domains: ['company.com'],
        },
      ],
    });

    const provider = mapper.findProviderByDomain('company.com');
    expect(provider.ok).toBe(true);
    if (!provider.ok) return;

    const mapped = mapper.mapClaims(
      { sub: 'ext-1', email: 'user@company.com', groups: ['Admins', 'Developers'] },
      provider.value,
    );

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.value.roles).toContain('admin');
    expect(mapped.value.roles).toContain('developer');
    expect(mapped.value.providerId).toBe('azure-ad');
  });

  it('uses defaultRole when no group mapping matches', async () => {
    const { createClaimMapper } = await import('../src/lib/auth/oidc-provider');

    const mapper = createClaimMapper({
      providers: [
        {
          providerId: 'idp-1',
          displayName: 'IDP',
          issuerUrl: 'https://idp.example.com',
          clientId: 'cid',
          groupToRoleMapping: { 'Admins': 'admin' },
          defaultRole: 'viewer',
          domains: ['example.com'],
        },
      ],
    });

    const provider = mapper.findProviderByDomain('example.com');
    expect(provider.ok).toBe(true);
    if (!provider.ok) return;

    const mapped = mapper.mapClaims(
      { sub: 'ext-2', email: 'user@example.com', groups: ['UnknownGroup'] },
      provider.value,
    );

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.value.roles).toEqual(['viewer']);
  });
});

// ---------------------------------------------------------------------------
// PR-01: JIT provisioner flow
// ---------------------------------------------------------------------------

describe('PR-01: JIT provisioner flow', () => {
  it('provisions a new user when no existing account matches', async () => {
    const { createJitProvisioner } = await import('../src/lib/auth/jit-provisioning');

    const createdUser = {
      id: 'user-new',
      email: 'new@company.com',
      name: 'New User',
      externalId: 'ext-new',
      providerId: 'azure-ad',
    };

    const userStore = {
      findByExternalId: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(createdUser),
      assignRoles: vi.fn().mockResolvedValue(undefined),
      linkExternalId: vi.fn().mockResolvedValue(undefined),
    };

    const provisioner = createJitProvisioner({
      userStore,
      systemUserId: 'system',
    });

    const result = await provisioner.provision({
      externalId: 'ext-new',
      email: 'new@company.com',
      name: 'New User',
      roles: ['developer'],
      providerId: 'azure-ad',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('user-new');
    expect(userStore.createUser).toHaveBeenCalled();
    expect(userStore.assignRoles).toHaveBeenCalledWith('user-new', ['developer'], 'system');
  });

  it('links external id to existing email account', async () => {
    const { createJitProvisioner } = await import('../src/lib/auth/jit-provisioning');

    const existingUser = {
      id: 'user-existing',
      email: 'existing@company.com',
      name: 'Existing',
      externalId: '',
      providerId: '',
    };

    const userStore = {
      findByExternalId: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(existingUser),
      createUser: vi.fn(),
      assignRoles: vi.fn().mockResolvedValue(undefined),
      linkExternalId: vi.fn().mockResolvedValue(undefined),
    };

    const provisioner = createJitProvisioner({
      userStore,
      systemUserId: 'system',
    });

    const result = await provisioner.provision({
      externalId: 'ext-linked',
      email: 'existing@company.com',
      name: 'Existing',
      roles: ['editor'],
      providerId: 'google-ws',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('user-existing');
    expect(userStore.linkExternalId).toHaveBeenCalledWith('user-existing', 'ext-linked', 'google-ws');
    expect(userStore.createUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PR-01: composition root wiring verification
// ---------------------------------------------------------------------------

describe('PR-01: Composition Root MFA Wiring', () => {
  // @testtype doc-lint
  it('services.ts imports createSupabaseMfaClient', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('createSupabaseMfaClient');
    expect(source).toContain('supabase-mfa-client');
    // should still import stub as fallback
    expect(source).toContain('createMfaStubClient');
  });

  // @testtype doc-lint
  it('services.ts env-gates real supabase client on NEXT_PUBLIC_SUPABASE_URL', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(source).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});
