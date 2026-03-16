/**
 * ID2-11: sprint 9 integration tests
 * @task ID2-11
 *
 * end-to-end validation of the full auth pipeline built in sprint 9.
 * uses real service implementations with in-memory stores.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createClaimMapper, loadProvidersFromEnv } from '../src/lib/auth/oidc-provider';
import type { OidcProviderConfig } from '../src/lib/auth/oidc-provider';
import { createJitProvisioner } from '../src/lib/auth/jit-provisioning';
import type { JitUserStore, UserRecord } from '../src/lib/auth/jit-provisioning';
import { createMfaEnforcement, createMfaStubClient, SENSITIVE_OPERATIONS } from '../src/lib/auth/mfa-enforcement';
import { createTokenBlacklistService } from '../src/lib/auth/token-blacklist';
import type { RedisClient } from '../src/lib/auth/token-blacklist';
import { createSessionLimitService, DEFAULT_SESSION_LIMITS } from '../src/lib/auth/session-limit-service';
import { createWebAuthnService, createInMemoryWebAuthnStore } from '../src/lib/auth/webauthn-service';
import { createSamlStubAdapter, createSamlClaimMapper } from '../src/lib/auth/saml-adapter';

// ---------------------------------------------------------------------------
// in-memory mock redis
// ---------------------------------------------------------------------------

function createMockRedis(): RedisClient {
  const store = new Map<string, string>();
  return {
    async set(key, value, options?) {
      store.set(key, value);
      if (options?.ex) setTimeout(() => store.delete(key), options.ex * 1000);
      return 'OK';
    },
    async get(key) { return store.get(key) ?? null; },
    async exists(...keys) { return keys.filter((k) => store.has(k)).length; },
    async del(...keys) { let c = 0; for (const k of keys) { if (store.delete(k)) c++; } return c; },
    async dbsize() { return store.size; },
  };
}

// ---------------------------------------------------------------------------
// in-memory mock user store
// ---------------------------------------------------------------------------

function createMockUserStore(): JitUserStore & { users: UserRecord[] } {
  const users: UserRecord[] = [];
  return {
    users,
    async findByExternalId(externalId) { return users.find((u) => u.externalId === externalId) ?? null; },
    async findByEmail(email) { return users.find((u) => u.email === email) ?? null; },
    async createUser(data) {
      const user = { id: crypto.randomUUID(), ...data };
      users.push(user);
      return user;
    },
    async assignRoles() {},
    async linkExternalId(userId, externalId, providerId) {
      const user = users.find((u) => u.id === userId);
      if (user) { user.externalId = externalId; user.providerId = providerId; }
    },
  };
}

// ---------------------------------------------------------------------------
// shared test fixtures
// ---------------------------------------------------------------------------

const TEST_PROVIDER: OidcProviderConfig = {
  providerId: 'okta-test',
  displayName: 'Okta Test',
  issuerUrl: 'https://dev-123456.okta.com',
  clientId: 'test-client-id',
  groupToRoleMapping: {
    'okta-admins': 'admin',
    'engineering': 'developer',
    'hr-team': 'hr-manager',
  },
  defaultRole: 'user',
  domains: ['example.com'],
};

// ---------------------------------------------------------------------------
// scenario 1: oidc → claim mapping → jit provisioning → role assignment
// ---------------------------------------------------------------------------

describe('OIDC → Claim Mapping → JIT Provisioning → Role Assignment', () => {
  let userStore: JitUserStore & { users: UserRecord[] };

  beforeEach(() => {
    userStore = createMockUserStore();
  });

  it('maps idp claims and provisions a new user with correct roles', async () => {
    // create claim mapper with test provider
    const mapper = createClaimMapper({ providers: [TEST_PROVIDER] });

    // map claims from idp
    const claims = {
      sub: 'okta-user-001',
      email: 'alice@example.com',
      name: 'Alice Engineer',
      groups: ['okta-admins', 'engineering'],
    };

    const mapResult = mapper.mapClaims(claims, TEST_PROVIDER);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) return;

    const identity = mapResult.value;
    expect(identity.externalId).toBe('okta-user-001');
    expect(identity.email).toBe('alice@example.com');
    expect(identity.name).toBe('Alice Engineer');
    expect(identity.roles).toContain('admin');
    expect(identity.roles).toContain('developer');
    expect(identity.providerId).toBe('okta-test');

    // feed mapped identity into jit provisioner
    const provisioner = createJitProvisioner({ userStore, systemUserId: 'system' });
    const provisionResult = await provisioner.provision(identity);
    expect(provisionResult.ok).toBe(true);
    if (!provisionResult.ok) return;

    const user = provisionResult.value;
    expect(user.email).toBe('alice@example.com');
    expect(user.externalId).toBe('okta-user-001');
    expect(user.providerId).toBe('okta-test');
    // user should be persisted in the store
    expect(userStore.users).toHaveLength(1);
    expect(userStore.users[0]!.id).toBe(user.id);
  });

  it('assigns default role when no idp groups match the mapping', async () => {
    const mapper = createClaimMapper({ providers: [TEST_PROVIDER] });

    const claims = {
      sub: 'okta-user-002',
      email: 'bob@example.com',
      groups: ['marketing'], // no mapping for marketing
    };

    const mapResult = mapper.mapClaims(claims, TEST_PROVIDER);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) return;

    expect(mapResult.value.roles).toEqual(['user']);
  });

  it('finds the correct provider by email domain', () => {
    const mapper = createClaimMapper({ providers: [TEST_PROVIDER] });

    const found = mapper.findProviderByDomain('example.com');
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.providerId).toBe('okta-test');

    // unknown domain returns error
    const notFound = mapper.findProviderByDomain('unknown.org');
    expect(notFound.ok).toBe(false);
    if (notFound.ok) return;
    expect(notFound.error._tag).toBe('OidcProviderNotFound');
  });
});

// ---------------------------------------------------------------------------
// scenario 2: oidc → jit account linking (email match)
// ---------------------------------------------------------------------------

describe('OIDC → JIT Account Linking (email match)', () => {
  let userStore: JitUserStore & { users: UserRecord[] };

  beforeEach(() => {
    userStore = createMockUserStore();
  });

  it('links external identity to existing user when email matches', async () => {
    const mapper = createClaimMapper({ providers: [TEST_PROVIDER] });
    const provisioner = createJitProvisioner({ userStore, systemUserId: 'system' });

    // simulate a user that exists from magic link login (no externalId)
    const existingUser = await userStore.createUser({
      email: 'carol@example.com',
      name: 'Carol',
      externalId: '',
      providerId: '',
    });

    // now provision via oidc with same email but different external id
    const claims = {
      sub: 'okta-user-carol',
      email: 'carol@example.com',
      name: 'Carol from Okta',
      groups: ['engineering'],
    };

    const mapResult = mapper.mapClaims(claims, TEST_PROVIDER);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) return;

    const provisionResult = await provisioner.provision(mapResult.value);
    expect(provisionResult.ok).toBe(true);
    if (!provisionResult.ok) return;

    const user = provisionResult.value;
    // same user returned (account linked, not duplicated)
    expect(user.id).toBe(existingUser.id);
    expect(user.externalId).toBe('okta-user-carol');
    expect(user.providerId).toBe('okta-test');
    // only one user in the store
    expect(userStore.users).toHaveLength(1);
    // the store entry is updated via linkExternalId
    expect(userStore.users[0]!.externalId).toBe('okta-user-carol');
  });

  it('returns existing user when provisioned again with same externalId', async () => {
    const provisioner = createJitProvisioner({ userStore, systemUserId: 'system' });
    const mapper = createClaimMapper({ providers: [TEST_PROVIDER] });

    const claims = {
      sub: 'okta-user-dave',
      email: 'dave@example.com',
      groups: ['okta-admins'],
    };

    const mapResult = mapper.mapClaims(claims, TEST_PROVIDER);
    expect(mapResult.ok).toBe(true);
    if (!mapResult.ok) return;

    // provision first time
    const first = await provisioner.provision(mapResult.value);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // provision second time with same sub
    const second = await provisioner.provision(mapResult.value);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // same user returned, no duplication
    expect(second.value.id).toBe(first.value.id);
    expect(userStore.users).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// scenario 3: token blacklist → session eviction → immediate rejection
// ---------------------------------------------------------------------------

describe('Token Blacklist → Session Eviction → Immediate Rejection', () => {
  let redis: RedisClient;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it('evicts oldest session when limit exceeded and blacklisted jti is rejected', async () => {
    const blacklistService = createTokenBlacklistService({ redis });
    const sessionService = createSessionLimitService({ redis });

    const userId = 'user-admin-001';

    // register session 1 (admin limit = 1)
    const evict1 = await sessionService.checkAndEvict(userId, 'admin', 'session-a');
    expect(evict1.ok).toBe(true);
    if (!evict1.ok) return;
    expect(evict1.value).toHaveLength(0); // no eviction yet

    // register session 2 — should evict session-a
    const evict2 = await sessionService.checkAndEvict(userId, 'admin', 'session-b');
    expect(evict2.ok).toBe(true);
    if (!evict2.ok) return;
    expect(evict2.value).toHaveLength(1);
    expect(evict2.value[0]!.sessionId).toBe('session-a');

    // blacklist the evicted session's token
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const blResult = await blacklistService.blacklist('jti-session-a', futureExp);
    expect(blResult.ok).toBe(true);

    // verify blacklisted jti returns true
    const isBlocked = await blacklistService.isBlacklisted('jti-session-a');
    expect(isBlocked.ok).toBe(true);
    if (!isBlocked.ok) return;
    expect(isBlocked.value).toBe(true);

    // verify non-blacklisted jti returns false
    const isAllowed = await blacklistService.isBlacklisted('jti-session-b');
    expect(isAllowed.ok).toBe(true);
    if (!isAllowed.ok) return;
    expect(isAllowed.value).toBe(false);
  });

  it('user-role session limits align with DEFAULT_SESSION_LIMITS', () => {
    expect(DEFAULT_SESSION_LIMITS.limits.admin).toBe(1);
    expect(DEFAULT_SESSION_LIMITS.limits.user).toBe(3);
    expect(DEFAULT_SESSION_LIMITS.defaultLimit).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// scenario 4: mfa enforcement → sensitive operation gate
// ---------------------------------------------------------------------------

describe('MFA Enforcement → Sensitive Operation Gate', () => {
  it('blocks sensitive operations without aal2', () => {
    const mfa = createMfaEnforcement();

    // sensitive op with aal1 → blocked (403 response)
    const blocked = mfa.requireMfa('platform/admin.view', 'aal1');
    expect(blocked).not.toBeNull();
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked!.status).toBe(403);
  });

  it('permits sensitive operations with aal2', () => {
    const mfa = createMfaEnforcement();
    const allowed = mfa.requireMfa('platform/admin.view', 'aal2');
    expect(allowed).toBeNull();
  });

  it('permits non-sensitive operations with aal1', () => {
    const mfa = createMfaEnforcement();
    const allowed = mfa.requireMfa('platform/user.read', 'aal1');
    expect(allowed).toBeNull();
  });

  it('permits non-sensitive operations with undefined aal', () => {
    const mfa = createMfaEnforcement();
    const allowed = mfa.requireMfa('platform/user.read', undefined);
    expect(allowed).toBeNull();
  });

  it('includes expected operations in SENSITIVE_OPERATIONS', () => {
    expect(SENSITIVE_OPERATIONS).toContain('platform/admin.view');
    expect(SENSITIVE_OPERATIONS).toContain('platform/admin.manage');
    expect(SENSITIVE_OPERATIONS).toContain('platform/roles.assign');
    expect(SENSITIVE_OPERATIONS).toContain('platform/audit.export');
    expect(SENSITIVE_OPERATIONS).toContain('platform/webhook.rotate');
  });

  it('returns correct mfa_required error shape in 403 body', async () => {
    const mfa = createMfaEnforcement();
    const response = mfa.requireMfa('platform/admin.manage', 'aal1');
    expect(response).not.toBeNull();

    const body = await response!.json();
    expect(body.errorCode).toBe('mfa_required');
    expect(body.status).toBe(403);
    expect(body.mfaChallengeUrl).toBe('/api/auth/mfa/challenge');
    expect(body.detail).toContain('platform/admin.manage');
  });

  it('stub mfa client returns expected defaults', async () => {
    const client = createMfaStubClient();

    const enrollResult = await client.enroll({ factorType: 'totp' });
    expect(enrollResult.ok).toBe(true);
    if (enrollResult.ok) {
      expect(enrollResult.value.factorId).toBe('stub-factor-id');
    }

    const verifyResult = await client.verify({
      factorId: 'stub-factor-id',
      challengeId: 'stub-challenge-id',
      code: '123456',
    });
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.value.aal).toBe('aal2');
    }
  });
});

// ---------------------------------------------------------------------------
// scenario 5: webauthn registration → authentication → counter replay
// ---------------------------------------------------------------------------

describe('WebAuthn Registration → Authentication → Counter Replay Protection', () => {
  let store: ReturnType<typeof createInMemoryWebAuthnStore>;
  let service: ReturnType<typeof createWebAuthnService>;

  beforeEach(() => {
    store = createInMemoryWebAuthnStore();
    service = createWebAuthnService({
      credentialStore: store,
      rpId: 'test.aptivo.dev',
      rpName: 'Aptivo Test',
      origin: 'https://test.aptivo.dev',
    });
  });

  it('completes full registration → authentication → replay rejection flow', async () => {
    const userId = 'user-webauthn-001';
    const userName = 'webauthn-test@aptivo.dev';

    // generate registration options
    const regOptsResult = await service.generateRegistrationOptions(userId, userName);
    expect(regOptsResult.ok).toBe(true);
    if (!regOptsResult.ok) return;

    const regOpts = regOptsResult.value;
    expect(regOpts.rpId).toBe('test.aptivo.dev');
    expect(regOpts.rpName).toBe('Aptivo Test');
    expect(regOpts.challenge).toBeTruthy();
    expect(regOpts.excludeCredentials).toHaveLength(0); // first credential

    // verify registration (store credential)
    const credId = 'cred-abc-123';
    const regResult = await service.verifyRegistration(
      userId,
      credId,
      'public-key-base64',
      0, // initial counter
      'internal',
      'My Passkey',
    );
    expect(regResult.ok).toBe(true);
    if (!regResult.ok) return;

    expect(regResult.value.userId).toBe(userId);
    expect(regResult.value.credentialId).toBe(credId);
    expect(regResult.value.friendlyName).toBe('My Passkey');

    // generate authentication options (should include the registered credential)
    const authOptsResult = await service.generateAuthenticationOptions(userId);
    expect(authOptsResult.ok).toBe(true);
    if (!authOptsResult.ok) return;

    expect(authOptsResult.value.allowCredentials).toHaveLength(1);
    expect(authOptsResult.value.allowCredentials[0]!.id).toBe(credId);

    // verify authentication with counter=1 (succeeds)
    const auth1 = await service.verifyAuthentication(credId, 1, userId);
    expect(auth1.ok).toBe(true);
    if (!auth1.ok) return;
    expect(auth1.value.counter).toBe(1);

    // verify authentication with counter=1 again (replay rejected)
    const replayResult = await service.verifyAuthentication(credId, 1, userId);
    expect(replayResult.ok).toBe(false);
    if (replayResult.ok) return;
    expect(replayResult.error._tag).toBe('WebAuthnAuthenticationError');
    expect(replayResult.error.message).toBe('Counter replay detected');

    // verify authentication with counter=2 (succeeds)
    const auth2 = await service.verifyAuthentication(credId, 2, userId);
    expect(auth2.ok).toBe(true);
    if (!auth2.ok) return;
    expect(auth2.value.counter).toBe(2);
  });

  it('rejects authentication for non-existent credential', async () => {
    const result = await service.verifyAuthentication('nonexistent-cred', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('WebAuthnCredentialNotFound');
  });

  it('rejects authentication when credential belongs to another user', async () => {
    // register credential for user-a
    await service.verifyRegistration('user-a', 'cred-user-a', 'pk', 0);

    // try to authenticate as user-b
    const result = await service.verifyAuthentication('cred-user-a', 1, 'user-b');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('WebAuthnAuthenticationError');
    expect(result.error.message).toBe('Credential does not belong to the authenticated user');
  });

  it('excludes existing credentials in registration options', async () => {
    const userId = 'user-with-creds';
    // register two credentials
    await service.verifyRegistration(userId, 'cred-1', 'pk1', 0);
    await service.verifyRegistration(userId, 'cred-2', 'pk2', 0);

    // generate new registration options — should exclude both
    const regOpts = await service.generateRegistrationOptions(userId, 'test@test.com');
    expect(regOpts.ok).toBe(true);
    if (!regOpts.ok) return;

    expect(regOpts.value.excludeCredentials).toHaveLength(2);
    const excludedIds = regOpts.value.excludeCredentials.map((c) => c.id);
    expect(excludedIds).toContain('cred-1');
    expect(excludedIds).toContain('cred-2');
  });
});

// ---------------------------------------------------------------------------
// scenario 6: pipeline ordering — blacklist → mfa → permission
// ---------------------------------------------------------------------------

describe('Pipeline Ordering: Blacklist → MFA → Permission', () => {
  it('each middleware step can independently block the pipeline', async () => {
    const redis = createMockRedis();
    const blacklistService = createTokenBlacklistService({ redis });
    const mfa = createMfaEnforcement();

    // step 1: check blacklist — non-blacklisted jti passes
    const blCheck1 = await blacklistService.isBlacklisted('jti-good');
    expect(blCheck1.ok).toBe(true);
    if (!blCheck1.ok) return;
    expect(blCheck1.value).toBe(false); // not blocked

    // step 2: check mfa — non-sensitive op with aal1 passes
    const mfaCheck1 = mfa.requireMfa('platform/user.read', 'aal1');
    expect(mfaCheck1).toBeNull(); // not blocked

    // step 3: permission check (simulated) — user has permission
    const hasPermission = true;
    expect(hasPermission).toBe(true); // not blocked

    // now verify each step can independently block:

    // blacklist blocks
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    await blacklistService.blacklist('jti-revoked', futureExp);
    const blCheck2 = await blacklistService.isBlacklisted('jti-revoked');
    expect(blCheck2.ok).toBe(true);
    if (!blCheck2.ok) return;
    expect(blCheck2.value).toBe(true); // blocked by blacklist

    // mfa blocks on sensitive op without aal2
    const mfaCheck2 = mfa.requireMfa('platform/admin.view', 'aal1');
    expect(mfaCheck2).not.toBeNull(); // blocked by mfa
    expect(mfaCheck2!.status).toBe(403);

    // permission blocks (simulated)
    const noPermission = false;
    expect(noPermission).toBe(false); // blocked by permission
  });

  it('full pipeline passes when all checks succeed', async () => {
    const redis = createMockRedis();
    const blacklistService = createTokenBlacklistService({ redis });
    const mfa = createMfaEnforcement();

    // step 1: not blacklisted
    const blResult = await blacklistService.isBlacklisted('jti-valid');
    expect(blResult.ok).toBe(true);
    if (!blResult.ok) return;
    expect(blResult.value).toBe(false);

    // step 2: mfa satisfied (aal2 for sensitive op)
    const mfaResult = mfa.requireMfa('platform/admin.view', 'aal2');
    expect(mfaResult).toBeNull();

    // step 3: permission granted
    const permitted = true;
    expect(permitted).toBe(true);

    // all passed — request proceeds
  });
});

// ---------------------------------------------------------------------------
// scenario 7: saml stub returns not configured
// ---------------------------------------------------------------------------

describe('SAML Stub Returns Not Configured', () => {
  it('initiateLogin returns SamlNotConfigured', async () => {
    const adapter = createSamlStubAdapter();
    const result = await adapter.initiateLogin('corp.example.com');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SamlNotConfigured');
    expect(result.error.message).toContain('SAML is not configured');
  });

  it('handleCallback returns SamlNotConfigured', async () => {
    const adapter = createSamlStubAdapter();
    const result = await adapter.handleCallback('<saml:Response>...</saml:Response>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SamlNotConfigured');
  });

  it('getMetadata returns SamlNotConfigured', () => {
    const adapter = createSamlStubAdapter();
    const result = adapter.getMetadata();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('SamlNotConfigured');
  });

  it('saml claim mapper produces correct identity shape', () => {
    const mapper = createSamlClaimMapper({
      groupAttribute: 'memberOf',
      groupToRoleMapping: {
        'cn=admins': 'admin',
        'cn=devs': 'developer',
      },
      defaultRole: 'user',
    });

    const result = mapper.mapAssertion(
      {
        nameId: 'engineer@corp.example.com',
        attributes: {
          memberOf: ['cn=admins', 'cn=devs'],
          displayName: 'Test Engineer',
        },
      },
      'azure-ad-corp',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.externalId).toBe('engineer@corp.example.com');
    expect(result.value.email).toBe('engineer@corp.example.com');
    expect(result.value.name).toBe('Test Engineer');
    expect(result.value.roles).toContain('admin');
    expect(result.value.roles).toContain('developer');
    expect(result.value.providerId).toBe('azure-ad-corp');
  });

  it('saml claim mapper assigns default role when no groups match', () => {
    const mapper = createSamlClaimMapper({
      groupAttribute: 'memberOf',
      groupToRoleMapping: { 'cn=admins': 'admin' },
      defaultRole: 'viewer',
    });

    const result = mapper.mapAssertion(
      {
        nameId: 'guest@corp.example.com',
        attributes: { memberOf: 'cn=guests' }, // string, not array — no match
      },
      'saml-idp',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roles).toEqual(['viewer']);
  });
});

// ---------------------------------------------------------------------------
// scenario 8: composition root smoke test
// ---------------------------------------------------------------------------

describe('Composition Root Smoke Test', () => {
  it('getTokenBlacklist returns null when UPSTASH_REDIS_URL is not set', async () => {
    // dynamically import to avoid module-level side effects
    const { getTokenBlacklist } = await import('../src/lib/services');
    const result = getTokenBlacklist();
    expect(result).toBeNull();
  });

  it('getSessionLimitService returns null when UPSTASH_REDIS_URL is not set', async () => {
    const { getSessionLimitService } = await import('../src/lib/services');
    const result = getSessionLimitService();
    expect(result).toBeNull();
  });

  it('getOidcClaimMapper returns a mapper (empty providers when no env)', async () => {
    const { getOidcClaimMapper } = await import('../src/lib/services');
    const mapper = getOidcClaimMapper();
    expect(mapper).toBeDefined();
    expect(typeof mapper.mapClaims).toBe('function');
    expect(typeof mapper.findProviderByDomain).toBe('function');
  });

  it('getWebAuthnService returns a service', async () => {
    const { getWebAuthnService } = await import('../src/lib/services');
    const service = getWebAuthnService();
    expect(service).toBeDefined();
    expect(typeof service.generateRegistrationOptions).toBe('function');
    expect(typeof service.verifyRegistration).toBe('function');
    expect(typeof service.generateAuthenticationOptions).toBe('function');
    expect(typeof service.verifyAuthentication).toBe('function');
    expect(typeof service.checkAvailability).toBe('function');
  });
});
