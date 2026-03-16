/**
 * ID2-04: WebAuthn/Passkey Registration tests
 * @task ID2-04
 *
 * verifies webauthn service behavior, credential lifecycle,
 * and api route handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWebAuthnService,
  createInMemoryWebAuthnStore,
  type WebAuthnCredentialStore,
  type WebAuthnCredential,
} from '../src/lib/auth/webauthn-service.js';
import { GET as statusHandler } from '../src/app/api/auth/webauthn/status/route.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createTestService(store?: WebAuthnCredentialStore) {
  return createWebAuthnService({
    credentialStore: store ?? createInMemoryWebAuthnStore(),
    rpId: 'test.aptivo.dev',
    rpName: 'Aptivo Test',
    origin: 'https://test.aptivo.dev',
  });
}

// creates a store that throws on every operation (for error path testing)
function createFailingStore(): WebAuthnCredentialStore {
  const err = new Error('store failure');
  return {
    async findByUserId() { throw err; },
    async findByCredentialId() { throw err; },
    async create() { throw err; },
    async updateCounter() { throw err; },
    async delete() { throw err; },
    async rename() { throw err; },
  };
}

function authedRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'test-user-id',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function unauthRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// service: checkAvailability
// ---------------------------------------------------------------------------

describe('createWebAuthnService', () => {
  describe('checkAvailability', () => {
    it('returns available: true', () => {
      const service = createTestService();
      const result = service.checkAvailability();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: generateRegistrationOptions
  // ---------------------------------------------------------------------------

  describe('generateRegistrationOptions', () => {
    it('returns valid options with challenge, rpId, and excludeCredentials', async () => {
      const service = createTestService();
      const result = await service.generateRegistrationOptions('user-1', 'alice@test.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.challenge).toBeTruthy();
        expect(result.value.challenge.length).toBeGreaterThan(0);
        expect(result.value.rpId).toBe('test.aptivo.dev');
        expect(result.value.rpName).toBe('Aptivo Test');
        expect(result.value.userId).toBe('user-1');
        expect(result.value.userName).toBe('alice@test.com');
        expect(result.value.timeout).toBe(60_000);
        expect(result.value.attestation).toBe('none');
        expect(result.value.excludeCredentials).toStrictEqual([]);
      }
    });

    it('excludes existing credentials from options', async () => {
      const store = createInMemoryWebAuthnStore();
      // pre-register a credential
      await store.create({
        userId: 'user-1',
        credentialId: 'cred-existing',
        publicKey: 'pk-existing',
        counter: 0,
      });

      const service = createTestService(store);
      const result = await service.generateRegistrationOptions('user-1', 'alice@test.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.excludeCredentials).toHaveLength(1);
        expect(result.value.excludeCredentials[0]).toStrictEqual({
          id: 'cred-existing',
          type: 'public-key',
        });
      }
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.generateRegistrationOptions('user-1', 'alice@test.com');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnRegistrationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: verifyRegistration
  // ---------------------------------------------------------------------------

  describe('verifyRegistration', () => {
    it('stores credential and returns it', async () => {
      const store = createInMemoryWebAuthnStore();
      const service = createTestService(store);

      const result = await service.verifyRegistration(
        'user-1',
        'cred-abc',
        'public-key-data',
        0,
        'usb,ble',
        'My Security Key',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentialId).toBe('cred-abc');
        expect(result.value.publicKey).toBe('public-key-data');
        expect(result.value.counter).toBe(0);
        expect(result.value.transports).toBe('usb,ble');
        expect(result.value.friendlyName).toBe('My Security Key');
        expect(result.value.userId).toBe('user-1');
        expect(result.value.id).toBeTruthy();
        expect(result.value.createdAt).toBeInstanceOf(Date);
      }

      // verify it's stored
      const stored = await store.findByCredentialId('cred-abc');
      expect(stored).not.toBeNull();
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.verifyRegistration('user-1', 'cred-x', 'pk', 0);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnRegistrationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: generateAuthenticationOptions
  // ---------------------------------------------------------------------------

  describe('generateAuthenticationOptions', () => {
    it('returns options with allowCredentials for user with credentials', async () => {
      const store = createInMemoryWebAuthnStore();
      await store.create({
        userId: 'user-1',
        credentialId: 'cred-1',
        publicKey: 'pk-1',
        counter: 5,
        transports: 'usb,nfc',
      });

      const service = createTestService(store);
      const result = await service.generateAuthenticationOptions('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.challenge).toBeTruthy();
        expect(result.value.rpId).toBe('test.aptivo.dev');
        expect(result.value.timeout).toBe(60_000);
        expect(result.value.allowCredentials).toHaveLength(1);
        expect(result.value.allowCredentials[0]).toStrictEqual({
          id: 'cred-1',
          type: 'public-key',
          transports: ['usb', 'nfc'],
        });
      }
    });

    it('returns error when no credentials registered', async () => {
      const service = createTestService();
      const result = await service.generateAuthenticationOptions('user-no-creds');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnNotAvailable');
        if (result.error._tag === 'WebAuthnNotAvailable') {
          expect(result.error.reason).toContain('No registered credentials');
        }
      }
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.generateAuthenticationOptions('user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnAuthenticationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: verifyAuthentication
  // ---------------------------------------------------------------------------

  describe('verifyAuthentication', () => {
    let store: WebAuthnCredentialStore;
    let storedCred: WebAuthnCredential;

    beforeEach(async () => {
      store = createInMemoryWebAuthnStore();
      storedCred = await store.create({
        userId: 'user-1',
        credentialId: 'cred-auth',
        publicKey: 'pk-auth',
        counter: 10,
      });
    });

    it('succeeds with valid counter increment', async () => {
      const service = createTestService(store);
      const result = await service.verifyAuthentication('cred-auth', 11);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.credentialId).toBe('cred-auth');
        expect(result.value.counter).toBe(11);
      }

      // verify counter was updated in store
      const updated = await store.findByCredentialId('cred-auth');
      expect(updated?.counter).toBe(11);
    });

    it('rejects counter replay (counter <= stored)', async () => {
      const service = createTestService(store);

      // same counter
      const result1 = await service.verifyAuthentication('cred-auth', 10);
      expect(result1.ok).toBe(false);
      if (!result1.ok) {
        expect(result1.error._tag).toBe('WebAuthnAuthenticationError');
        if (result1.error._tag === 'WebAuthnAuthenticationError') {
          expect(result1.error.message).toBe('Counter replay detected');
        }
      }

      // lower counter
      const result2 = await service.verifyAuthentication('cred-auth', 5);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.error._tag).toBe('WebAuthnAuthenticationError');
      }
    });

    it('returns error for unknown credentialId', async () => {
      const service = createTestService(store);
      const result = await service.verifyAuthentication('nonexistent-cred', 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnCredentialNotFound');
        if (result.error._tag === 'WebAuthnCredentialNotFound') {
          expect(result.error.credentialId).toBe('nonexistent-cred');
        }
      }
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.verifyAuthentication('cred-x', 1);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnAuthenticationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: listCredentials
  // ---------------------------------------------------------------------------

  describe('listCredentials', () => {
    it('returns all user credentials', async () => {
      const store = createInMemoryWebAuthnStore();
      await store.create({
        userId: 'user-1',
        credentialId: 'cred-a',
        publicKey: 'pk-a',
        counter: 0,
        friendlyName: 'Key A',
      });
      await store.create({
        userId: 'user-1',
        credentialId: 'cred-b',
        publicKey: 'pk-b',
        counter: 3,
        friendlyName: 'Key B',
      });
      // different user
      await store.create({
        userId: 'user-2',
        credentialId: 'cred-c',
        publicKey: 'pk-c',
        counter: 0,
      });

      const service = createTestService(store);
      const result = await service.listCredentials('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map((c) => c.credentialId).sort()).toStrictEqual(['cred-a', 'cred-b']);
      }
    });

    it('returns empty array for user with no credentials', async () => {
      const service = createTestService();
      const result = await service.listCredentials('user-no-creds');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toStrictEqual([]);
      }
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.listCredentials('user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnAuthenticationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: renameCredential
  // ---------------------------------------------------------------------------

  describe('renameCredential', () => {
    it('updates friendly name', async () => {
      const store = createInMemoryWebAuthnStore();
      const cred = await store.create({
        userId: 'user-1',
        credentialId: 'cred-rename',
        publicKey: 'pk',
        counter: 0,
        friendlyName: 'Old Name',
      });

      const service = createTestService(store);
      const result = await service.renameCredential(cred.id, 'New Name');

      expect(result.ok).toBe(true);

      const updated = await store.findByCredentialId('cred-rename');
      expect(updated?.friendlyName).toBe('New Name');
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.renameCredential('some-id', 'Name');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnRegistrationError');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // service: deleteCredential
  // ---------------------------------------------------------------------------

  describe('deleteCredential', () => {
    it('removes credential', async () => {
      const store = createInMemoryWebAuthnStore();
      const cred = await store.create({
        userId: 'user-1',
        credentialId: 'cred-del',
        publicKey: 'pk',
        counter: 0,
      });

      const service = createTestService(store);
      const result = await service.deleteCredential(cred.id);

      expect(result.ok).toBe(true);

      const found = await store.findByCredentialId('cred-del');
      expect(found).toBeNull();
    });

    it('returns tagged error when store fails', async () => {
      const service = createTestService(createFailingStore());
      const result = await service.deleteCredential('some-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('WebAuthnRegistrationError');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// route tests
// ---------------------------------------------------------------------------

describe('GET /api/auth/webauthn/status', () => {
  it('returns 200 with available: true', async () => {
    const request = new Request('http://localhost:3000/api/auth/webauthn/status');
    const response = await statusHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.available).toBe(true);
  });
});

describe('POST /api/auth/webauthn/register/options', () => {
  it('returns 401 without auth', async () => {
    // dynamic import to avoid hoisting issues with services module
    const { POST: registerOptionsHandler } = await import(
      '../src/app/api/auth/webauthn/register/options/route.js'
    );
    const request = unauthRequest('http://localhost:3000/api/auth/webauthn/register/options');
    const response = await registerOptionsHandler(request);

    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.title).toBe('Unauthorized');
  });

  it('returns 200 with options when authenticated', async () => {
    const { POST: registerOptionsHandler } = await import(
      '../src/app/api/auth/webauthn/register/options/route.js'
    );
    const request = authedRequest(
      'http://localhost:3000/api/auth/webauthn/register/options',
      { friendlyName: 'My Key' },
    );
    const response = await registerOptionsHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.challenge).toBeTruthy();
    expect(body.rpId).toBeTruthy();
    expect(body.rpName).toBeTruthy();
    expect(body.userId).toBe('test-user-id');
    expect(body.timeout).toBe(60_000);
    expect(body.attestation).toBe('none');
    expect(body.excludeCredentials).toStrictEqual([]);
    expect(body.friendlyName).toBe('My Key');
  });
});

describe('POST /api/auth/webauthn/register/verify', () => {
  it('returns 401 without auth', async () => {
    const { POST: registerVerifyHandler } = await import(
      '../src/app/api/auth/webauthn/register/verify/route.js'
    );
    const request = unauthRequest(
      'http://localhost:3000/api/auth/webauthn/register/verify',
      { credentialId: 'cid', publicKey: 'pk', counter: 0 },
    );
    const response = await registerVerifyHandler(request);

    expect(response.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const { POST: registerVerifyHandler } = await import(
      '../src/app/api/auth/webauthn/register/verify/route.js'
    );
    const request = authedRequest(
      'http://localhost:3000/api/auth/webauthn/register/verify',
      { credentialId: 'cid' }, // missing publicKey and counter
    );
    const response = await registerVerifyHandler(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.title).toBe('Missing Fields');
  });

  it('returns 200 with credential when valid', async () => {
    const { POST: registerVerifyHandler } = await import(
      '../src/app/api/auth/webauthn/register/verify/route.js'
    );
    const request = authedRequest(
      'http://localhost:3000/api/auth/webauthn/register/verify',
      {
        credentialId: 'cred-new-123',
        publicKey: 'pk-new-123',
        counter: 0,
        transports: 'usb',
        friendlyName: 'Test Key',
      },
    );
    const response = await registerVerifyHandler(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.credentialId).toBe('cred-new-123');
    expect(body.publicKey).toBe('pk-new-123');
    expect(body.counter).toBe(0);
    expect(body.friendlyName).toBe('Test Key');
  });
});
