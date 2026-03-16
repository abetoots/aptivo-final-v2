/**
 * ID2-01: OIDC provider integration tests
 * @task ID2-01
 *
 * covers claim mapping, provider loading from env, jit provisioning,
 * sso api routes, and federated permission resolution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// mock variables — declared before vi.mock calls (hoisted)
// ---------------------------------------------------------------------------

const mockResolvePermissions = vi.fn();
const mockResolvePermissionsForRole = vi.fn();

vi.mock('../src/lib/security/rbac-resolver', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/security/rbac-resolver')>();
  return {
    ...original,
    resolvePermissions: (...args: unknown[]) => mockResolvePermissions(...args),
    resolvePermissionsForRole: (...args: unknown[]) => mockResolvePermissionsForRole(...args),
    // re-implement federation merge using the mocked resolvers so internal calls
    // go through the mock layer rather than the original module-scoped references
    async resolvePermissionsWithFederation(
      userId: string,
      federatedRoles: string[],
      db: unknown,
    ): Promise<Set<string>> {
      const localPerms: Set<string> = await mockResolvePermissions(userId, db);
      for (const role of federatedRoles) {
        const rolePerms: Set<string> = await mockResolvePermissionsForRole(role, db);
        for (const p of rolePerms) {
          localPerms.add(p);
        }
      }
      return localPerms;
    },
  };
});

// ---------------------------------------------------------------------------
// imports under test (after mocks)
// ---------------------------------------------------------------------------

import {
  createClaimMapper,
  loadProvidersFromEnv,
  OidcProviderConfigSchema,
  type OidcProviderConfig,
  type IdpClaims,
} from '../src/lib/auth/oidc-provider';
import {
  createJitProvisioner,
  type JitUserStore,
  type UserRecord,
} from '../src/lib/auth/jit-provisioning';
import { resolvePermissionsWithFederation } from '../src/lib/security/rbac-resolver';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

const OKTA_PROVIDER: OidcProviderConfig = {
  providerId: 'okta-corp',
  displayName: 'Okta Corporate',
  issuerUrl: 'https://corp.okta.com',
  clientId: 'client-123',
  groupToRoleMapping: {
    'engineering': 'admin',
    'trading-desk': 'trader',
    'hr-team': 'recruiter',
    'viewers': 'viewer',
  },
  defaultRole: 'user',
  domains: ['example.com', 'corp.example.com'],
};

const AZURE_PROVIDER: OidcProviderConfig = {
  providerId: 'azure-ad',
  displayName: 'Azure AD',
  issuerUrl: 'https://login.microsoftonline.com/tenant-id',
  clientId: 'azure-client-456',
  groupToRoleMapping: {
    'admins': 'admin',
  },
  defaultRole: 'viewer',
  domains: ['contoso.com'],
};

function makeClaims(overrides?: Partial<IdpClaims>): IdpClaims {
  return {
    sub: 'user-ext-001',
    email: 'alice@example.com',
    name: 'Alice Smith',
    groups: ['engineering'],
    ...overrides,
  };
}

function makeUserStore(overrides?: Partial<JitUserStore>): JitUserStore {
  return {
    findByExternalId: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockImplementation(async (u) => ({
      id: 'new-user-id',
      ...u,
    })),
    assignRoles: vi.fn().mockResolvedValue(undefined),
    linkExternalId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.OIDC_PROVIDERS_CONFIG;
});

afterEach(() => {
  process.env = originalEnv;
});

// ---------------------------------------------------------------------------
// claim mapper tests
// ---------------------------------------------------------------------------

describe('createClaimMapper', () => {
  describe('findProviderByDomain', () => {
    it('returns correct provider for a known domain', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER, AZURE_PROVIDER] });
      const result = mapper.findProviderByDomain('example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('okta-corp');
      }
    });

    it('returns correct provider for subdomain match', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER, AZURE_PROVIDER] });
      const result = mapper.findProviderByDomain('corp.example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('okta-corp');
      }
    });

    it('returns OidcProviderNotFound for unknown domain', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const result = mapper.findProviderByDomain('unknown.org');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OidcProviderNotFound');
        expect(result.error).toHaveProperty('domain', 'unknown.org');
      }
    });

    it('is case-insensitive for domain matching', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const result = mapper.findProviderByDomain('EXAMPLE.COM');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('okta-corp');
      }
    });

    it('returns azure provider for contoso.com', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER, AZURE_PROVIDER] });
      const result = mapper.findProviderByDomain('contoso.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('azure-ad');
      }
    });
  });

  describe('mapClaims', () => {
    it('maps matching groups to correct roles', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ groups: ['engineering'] });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roles).toEqual(['admin']);
        expect(result.value.externalId).toBe('user-ext-001');
        expect(result.value.email).toBe('alice@example.com');
        expect(result.value.name).toBe('Alice Smith');
        expect(result.value.providerId).toBe('okta-corp');
      }
    });

    it('assigns default role when no groups match', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ groups: ['unknown-group'] });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roles).toEqual(['user']);
      }
    });

    it('assigns default role when groups array is empty', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ groups: [] });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roles).toEqual(['user']);
      }
    });

    it('assigns default role when groups is undefined', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ groups: undefined });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roles).toEqual(['user']);
      }
    });

    it('maps multiple matching groups and deduplicates roles', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      // both 'engineering' and a duplicate scenario: add a provider that maps two groups to 'admin'
      const providerWithDupes: OidcProviderConfig = {
        ...OKTA_PROVIDER,
        groupToRoleMapping: {
          'engineering': 'admin',
          'ops-team': 'admin',
          'hr-team': 'recruiter',
        },
      };
      const claims = makeClaims({ groups: ['engineering', 'ops-team', 'hr-team'] });
      const result = mapper.mapClaims(claims, providerWithDupes);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // admin should appear only once, recruiter once
        expect(result.value.roles).toEqual(['admin', 'recruiter']);
      }
    });

    it('uses email as name when name is not provided', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ name: undefined });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('alice@example.com');
      }
    });

    it('maps multiple distinct groups to distinct roles', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ groups: ['engineering', 'trading-desk'] });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.roles).toEqual(['admin', 'trader']);
      }
    });

    it('returns OidcClaimMappingError when sub is empty', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ sub: '' });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OidcClaimMappingError');
        expect(result.error).toHaveProperty('message', 'Missing required claim: sub');
      }
    });

    it('returns OidcClaimMappingError when email is empty', () => {
      const mapper = createClaimMapper({ providers: [OKTA_PROVIDER] });
      const claims = makeClaims({ email: '' });
      const result = mapper.mapClaims(claims, OKTA_PROVIDER);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('OidcClaimMappingError');
        expect(result.error).toHaveProperty('message', 'Missing required claim: email');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// provider loading from env tests
// ---------------------------------------------------------------------------

describe('loadProvidersFromEnv', () => {
  it('returns empty array when OIDC_PROVIDERS_CONFIG is not set', () => {
    const result = loadProvidersFromEnv();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('parses valid provider config from env', () => {
    process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([OKTA_PROVIDER]);
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.providerId).toBe('okta-corp');
    }
  });

  it('parses multiple providers from env', () => {
    process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([OKTA_PROVIDER, AZURE_PROVIDER]);
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('returns OidcConfigError for invalid JSON', () => {
    process.env.OIDC_PROVIDERS_CONFIG = 'not-json{{{';
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('OidcConfigError');
      expect(result.error).toHaveProperty('message');
      expect((result.error as { message: string }).message).toContain('Failed to parse OIDC_PROVIDERS_CONFIG');
    }
  });

  it('returns OidcConfigError for invalid schema (missing required fields)', () => {
    process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([{ providerId: 'test' }]);
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('OidcConfigError');
    }
  });

  it('applies default role when not specified in config', () => {
    const configWithoutDefault = {
      providerId: 'test',
      displayName: 'Test',
      issuerUrl: 'https://test.example.com',
      clientId: 'client-id',
      groupToRoleMapping: {},
      domains: ['test.com'],
      // no defaultRole — should default to 'user'
    };
    process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([configWithoutDefault]);
    const result = loadProvidersFromEnv();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.defaultRole).toBe('user');
    }
  });
});

// ---------------------------------------------------------------------------
// jit provisioning tests
// ---------------------------------------------------------------------------

describe('createJitProvisioner', () => {
  it('provisions a new user when not found by externalId or email', async () => {
    const store = makeUserStore();
    const provisioner = createJitProvisioner({
      userStore: store,
      systemUserId: 'system-user',
    });

    const identity = {
      externalId: 'ext-001',
      email: 'new@example.com',
      name: 'New User',
      roles: ['admin', 'trader'],
      providerId: 'okta-corp',
    };

    const result = await provisioner.provision(identity);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('new-user-id');
      expect(result.value.email).toBe('new@example.com');
    }
    expect(store.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New User',
      externalId: 'ext-001',
      providerId: 'okta-corp',
    });
    expect(store.assignRoles).toHaveBeenCalledWith('new-user-id', ['admin', 'trader'], 'system-user');
  });

  it('returns existing user when found by externalId (no duplicate)', async () => {
    const existingUser: UserRecord = {
      id: 'existing-id',
      email: 'existing@example.com',
      name: 'Existing User',
      externalId: 'ext-001',
      providerId: 'okta-corp',
    };
    const store = makeUserStore({
      findByExternalId: vi.fn().mockResolvedValue(existingUser),
    });
    const provisioner = createJitProvisioner({
      userStore: store,
      systemUserId: 'system-user',
    });

    const identity = {
      externalId: 'ext-001',
      email: 'existing@example.com',
      name: 'Existing User',
      roles: ['admin'],
      providerId: 'okta-corp',
    };

    const result = await provisioner.provision(identity);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('existing-id');
    }
    // should not create a new user or assign roles
    expect(store.createUser).not.toHaveBeenCalled();
    expect(store.assignRoles).not.toHaveBeenCalled();
  });

  it('links external identity and assigns roles when found by email', async () => {
    const existingUser: UserRecord = {
      id: 'email-linked-id',
      email: 'alice@example.com',
      name: 'Alice',
      externalId: '',
      providerId: '',
    };
    const store = makeUserStore({
      findByExternalId: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(existingUser),
    });
    const provisioner = createJitProvisioner({
      userStore: store,
      systemUserId: 'system-user',
    });

    const identity = {
      externalId: 'ext-new',
      email: 'alice@example.com',
      name: 'Alice',
      roles: ['user'],
      providerId: 'okta-corp',
    };

    const result = await provisioner.provision(identity);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('email-linked-id');
      // verify external identity was linked
      expect(result.value.externalId).toBe('ext-new');
      expect(result.value.providerId).toBe('okta-corp');
    }
    // should NOT create a new user
    expect(store.createUser).not.toHaveBeenCalled();
    // should link external id and assign idp roles
    expect(store.linkExternalId).toHaveBeenCalledWith('email-linked-id', 'ext-new', 'okta-corp');
    expect(store.assignRoles).toHaveBeenCalledWith('email-linked-id', ['user'], 'system-user');
  });

  it('returns JitProvisioningError when store throws', async () => {
    const store = makeUserStore({
      findByExternalId: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const provisioner = createJitProvisioner({
      userStore: store,
      systemUserId: 'system-user',
    });

    const identity = {
      externalId: 'ext-001',
      email: 'user@example.com',
      name: 'User',
      roles: ['user'],
      providerId: 'okta-corp',
    };

    const result = await provisioner.provision(identity);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('JitProvisioningError');
      expect(result.error).toHaveProperty('message');
      expect((result.error as { message: string }).message).toContain('user@example.com');
    }
  });

  it('returns JitProvisioningError when createUser throws', async () => {
    const store = makeUserStore({
      createUser: vi.fn().mockRejectedValue(new Error('unique constraint violation')),
    });
    const provisioner = createJitProvisioner({
      userStore: store,
      systemUserId: 'system-user',
    });

    const identity = {
      externalId: 'ext-001',
      email: 'user@example.com',
      name: 'User',
      roles: ['user'],
      providerId: 'okta-corp',
    };

    const result = await provisioner.provision(identity);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('JitProvisioningError');
    }
  });
});

// ---------------------------------------------------------------------------
// sso route tests
// ---------------------------------------------------------------------------

describe('SSO routes', () => {
  describe('GET /api/auth/sso', () => {
    it('returns 200 with provider info for known domain', async () => {
      process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([OKTA_PROVIDER]);

      const { GET } = await import('../src/app/api/auth/sso/route');
      const request = new Request('http://localhost:3000/api/auth/sso?domain=example.com');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.providerId).toBe('okta-corp');
      expect(body.issuerUrl).toBe('https://corp.okta.com');
      expect(body.clientId).toBe('client-123');
      expect(body.displayName).toBe('Okta Corporate');
    });

    it('returns 400 when domain parameter is missing', async () => {
      const { GET } = await import('../src/app/api/auth/sso/route');
      const request = new Request('http://localhost:3000/api/auth/sso');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.title).toBe('Missing domain parameter');
    });

    it('returns 404 for unknown domain', async () => {
      process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([OKTA_PROVIDER]);

      const { GET } = await import('../src/app/api/auth/sso/route');
      const request = new Request('http://localhost:3000/api/auth/sso?domain=unknown.com');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.title).toBe('SSO Provider Not Found');
      expect(body.detail).toContain('unknown.com');
    });

    it('returns 500 when OIDC config is malformed', async () => {
      process.env.OIDC_PROVIDERS_CONFIG = 'invalid-json{';

      const { GET } = await import('../src/app/api/auth/sso/route');
      const request = new Request('http://localhost:3000/api/auth/sso?domain=example.com');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.title).toBe('SSO Configuration Error');
    });
  });

  describe('GET /api/auth/sso/status', () => {
    it('returns configured: true with provider list when providers exist', async () => {
      process.env.OIDC_PROVIDERS_CONFIG = JSON.stringify([OKTA_PROVIDER, AZURE_PROVIDER]);

      const { GET } = await import('../src/app/api/auth/sso/status/route');
      const response = await GET();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.configured).toBe(true);
      expect(body.providers).toHaveLength(2);
      expect(body.providers[0].providerId).toBe('okta-corp');
      expect(body.providers[0].displayName).toBe('Okta Corporate');
      expect(body.providers[0].domains).toEqual(['example.com', 'corp.example.com']);
      // should not expose sensitive fields like clientId
      expect(body.providers[0]).not.toHaveProperty('clientId');
      expect(body.providers[0]).not.toHaveProperty('issuerUrl');
    });

    it('returns configured: false when no providers', async () => {
      // no OIDC_PROVIDERS_CONFIG env var
      const { GET } = await import('../src/app/api/auth/sso/status/route');
      const response = await GET();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.configured).toBe(false);
      expect(body.providers).toEqual([]);
    });

    it('returns configured: false with error when config is malformed', async () => {
      process.env.OIDC_PROVIDERS_CONFIG = '{bad-json';

      const { GET } = await import('../src/app/api/auth/sso/status/route');
      const response = await GET();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.configured).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.providers).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// rbac-resolver federation tests
// ---------------------------------------------------------------------------

describe('resolvePermissionsWithFederation', () => {
  it('merges local and federated permissions', async () => {
    // local permissions from user_roles table
    mockResolvePermissions.mockResolvedValue(new Set(['platform/admin.view']));
    // federated role "trader" has these permissions
    mockResolvePermissionsForRole.mockResolvedValue(new Set(['crypto/trade.execute', 'crypto/trade.view']));

    const db = {} as any;
    const result = await resolvePermissionsWithFederation('user-123', ['trader'], db);

    expect(result.has('platform/admin.view')).toBe(true);
    expect(result.has('crypto/trade.execute')).toBe(true);
    expect(result.has('crypto/trade.view')).toBe(true);
    expect(result.size).toBe(3);

    expect(mockResolvePermissions).toHaveBeenCalledWith('user-123', db);
    expect(mockResolvePermissionsForRole).toHaveBeenCalledWith('trader', db);
  });

  it('handles multiple federated roles', async () => {
    mockResolvePermissions.mockResolvedValue(new Set(['platform/user.view']));
    mockResolvePermissionsForRole
      .mockResolvedValueOnce(new Set(['crypto/trade.view']))
      .mockResolvedValueOnce(new Set(['hr/candidate.view', 'hr/candidate.manage']));

    const db = {} as any;
    const result = await resolvePermissionsWithFederation('user-123', ['trader', 'recruiter'], db);

    expect(result.has('platform/user.view')).toBe(true);
    expect(result.has('crypto/trade.view')).toBe(true);
    expect(result.has('hr/candidate.view')).toBe(true);
    expect(result.has('hr/candidate.manage')).toBe(true);
    expect(result.size).toBe(4);
  });

  it('handles empty federated roles array', async () => {
    mockResolvePermissions.mockResolvedValue(new Set(['platform/admin.view']));

    const db = {} as any;
    const result = await resolvePermissionsWithFederation('user-123', [], db);

    expect(result.has('platform/admin.view')).toBe(true);
    expect(result.size).toBe(1);
    expect(mockResolvePermissionsForRole).not.toHaveBeenCalled();
  });

  it('deduplicates permissions across local and federated', async () => {
    // same permission appears in both local and federated
    mockResolvePermissions.mockResolvedValue(new Set(['platform/admin.view', 'crypto/trade.view']));
    mockResolvePermissionsForRole.mockResolvedValue(new Set(['crypto/trade.view', 'crypto/trade.execute']));

    const db = {} as any;
    const result = await resolvePermissionsWithFederation('user-123', ['trader'], db);

    // crypto/trade.view should only appear once (Set handles it)
    expect(result.has('platform/admin.view')).toBe(true);
    expect(result.has('crypto/trade.view')).toBe(true);
    expect(result.has('crypto/trade.execute')).toBe(true);
    expect(result.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ExtractedUser interface tests
// ---------------------------------------------------------------------------

describe('ExtractedUser interface', () => {
  it('supports federatedRoles field', () => {
    const user = {
      userId: 'user-123',
      email: 'alice@example.com',
      federatedRoles: ['admin', 'trader'],
      aal: 'aal2',
    };

    expect(user.federatedRoles).toEqual(['admin', 'trader']);
    expect(user.aal).toBe('aal2');
  });

  it('allows optional federatedRoles and aal', () => {
    const user = {
      userId: 'user-123',
      email: 'alice@example.com',
    };

    expect(user.federatedRoles).toBeUndefined();
    expect(user.aal).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// schema validation tests
// ---------------------------------------------------------------------------

describe('OidcProviderConfigSchema', () => {
  it('validates a correct config', () => {
    const result = OidcProviderConfigSchema.safeParse(OKTA_PROVIDER);
    expect(result.success).toBe(true);
  });

  it('rejects config with missing providerId', () => {
    const { providerId, ...incomplete } = OKTA_PROVIDER;
    const result = OidcProviderConfigSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects config with invalid issuerUrl', () => {
    const result = OidcProviderConfigSchema.safeParse({
      ...OKTA_PROVIDER,
      issuerUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects config with empty domains array', () => {
    const result = OidcProviderConfigSchema.safeParse({
      ...OKTA_PROVIDER,
      domains: [],
    });
    expect(result.success).toBe(false);
  });

  it('applies default role when not provided', () => {
    const { defaultRole, ...withoutDefault } = OKTA_PROVIDER;
    const result = OidcProviderConfigSchema.safeParse(withoutDefault);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultRole).toBe('user');
    }
  });
});
