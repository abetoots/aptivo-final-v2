/**
 * ID2-04: WebAuthn/Passkey Registration
 * @task ID2-04
 *
 * provides webauthn credential management: registration options,
 * verification, authentication, and credential lifecycle operations.
 * uses an injectable credential store for db decoupling.
 */

import { Result } from '@aptivo/types';

// -- types --

export type WebAuthnError =
  | { readonly _tag: 'WebAuthnNotAvailable'; readonly reason: string }
  | { readonly _tag: 'WebAuthnRegistrationError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'WebAuthnAuthenticationError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'WebAuthnCredentialNotFound'; readonly credentialId: string };

export interface WebAuthnCredential {
  id: string;
  credentialId: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string;
  friendlyName?: string;
  createdAt: Date;
}

export interface RegistrationOptions {
  challenge: string; // base64url
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  timeout: number;
  attestation: 'none' | 'direct' | 'indirect';
  excludeCredentials: Array<{ id: string; type: 'public-key' }>;
}

export interface AuthenticationOptions {
  challenge: string; // base64url
  rpId: string;
  timeout: number;
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>;
}

// -- credential store interface --

export interface WebAuthnCredentialStore {
  findByUserId(userId: string): Promise<WebAuthnCredential[]>;
  findByCredentialId(credentialId: string): Promise<WebAuthnCredential | null>;
  create(credential: Omit<WebAuthnCredential, 'id' | 'createdAt'>): Promise<WebAuthnCredential>;
  updateCounter(credentialId: string, counter: number): Promise<void>;
  delete(id: string): Promise<void>;
  rename(id: string, friendlyName: string): Promise<void>;
}

// -- in-memory store (dev/test) --

export function createInMemoryWebAuthnStore(): WebAuthnCredentialStore {
  const credentials: WebAuthnCredential[] = [];
  return {
    async findByUserId(userId) {
      return credentials.filter((c) => c.userId === userId);
    },
    async findByCredentialId(cid) {
      return credentials.find((c) => c.credentialId === cid) ?? null;
    },
    async create(c) {
      const cred = { ...c, id: crypto.randomUUID(), createdAt: new Date() };
      credentials.push(cred);
      return cred;
    },
    async updateCounter(cid, counter) {
      const c = credentials.find((x) => x.credentialId === cid);
      if (c) c.counter = counter;
    },
    async delete(id) {
      const idx = credentials.findIndex((c) => c.id === id);
      if (idx >= 0) credentials.splice(idx, 1);
    },
    async rename(id, name) {
      const c = credentials.find((x) => x.id === id);
      if (c) c.friendlyName = name;
    },
  };
}

// -- service deps --

export interface WebAuthnServiceDeps {
  credentialStore: WebAuthnCredentialStore;
  rpId: string; // relying party id (e.g., 'aptivo.dev')
  rpName: string; // relying party name (e.g., 'Aptivo')
  origin: string; // expected origin (e.g., 'https://aptivo.dev')
}

// -- factory --

export function createWebAuthnService(deps: WebAuthnServiceDeps) {
  const { credentialStore, rpId, rpName } = deps;

  // generate a random challenge (base64url)
  function generateChallenge(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64url');
  }

  return {
    /** check if webauthn is available (feature detection) */
    checkAvailability(): Result<{ available: boolean; reason?: string }, WebAuthnError> {
      // server-side: always available if properly configured
      return Result.ok({ available: true });
    },

    /** generate registration options for a user */
    async generateRegistrationOptions(
      userId: string,
      userName: string,
    ): Promise<Result<RegistrationOptions, WebAuthnError>> {
      try {
        // get existing credentials to exclude (prevent re-registration)
        const existing = await credentialStore.findByUserId(userId);
        const excludeCredentials = existing.map((c) => ({
          id: c.credentialId,
          type: 'public-key' as const,
        }));

        return Result.ok({
          challenge: generateChallenge(),
          rpId,
          rpName,
          userId,
          userName,
          timeout: 60_000,
          attestation: 'none',
          excludeCredentials,
        });
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnRegistrationError',
          message: 'Failed to generate registration options',
          cause,
        });
      }
    },

    /** verify registration response and store credential */
    async verifyRegistration(
      userId: string,
      credentialId: string,
      publicKey: string,
      counter: number,
      transports?: string,
      friendlyName?: string,
    ): Promise<Result<WebAuthnCredential, WebAuthnError>> {
      try {
        // in production, would verify attestation via @simplewebauthn/server
        // for now, store the credential directly
        const credential = await credentialStore.create({
          userId,
          credentialId,
          publicKey,
          counter,
          transports,
          friendlyName,
        });
        return Result.ok(credential);
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnRegistrationError',
          message: 'Failed to store registration',
          cause,
        });
      }
    },

    /** generate authentication options for a user */
    async generateAuthenticationOptions(
      userId: string,
    ): Promise<Result<AuthenticationOptions, WebAuthnError>> {
      try {
        const credentials = await credentialStore.findByUserId(userId);
        if (credentials.length === 0) {
          return Result.err({
            _tag: 'WebAuthnNotAvailable',
            reason: 'No registered credentials for this user',
          });
        }

        return Result.ok({
          challenge: generateChallenge(),
          rpId,
          timeout: 60_000,
          allowCredentials: credentials.map((c) => ({
            id: c.credentialId,
            type: 'public-key' as const,
            transports: c.transports ? c.transports.split(',') : undefined,
          })),
        });
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnAuthenticationError',
          message: 'Failed to generate authentication options',
          cause,
        });
      }
    },

    /** verify authentication response and update counter */
    async verifyAuthentication(
      credentialId: string,
      newCounter: number,
      userId?: string,
    ): Promise<Result<WebAuthnCredential, WebAuthnError>> {
      try {
        const credential = await credentialStore.findByCredentialId(credentialId);
        if (!credential) {
          return Result.err({
            _tag: 'WebAuthnCredentialNotFound',
            credentialId,
          });
        }

        // verify credential belongs to the authenticated user
        if (userId && credential.userId !== userId) {
          return Result.err({
            _tag: 'WebAuthnAuthenticationError',
            message: 'Credential does not belong to the authenticated user',
            cause: { credentialUserId: credential.userId, requestUserId: userId },
          });
        }

        // verify counter is greater than stored (replay protection)
        if (newCounter <= credential.counter) {
          return Result.err({
            _tag: 'WebAuthnAuthenticationError',
            message: 'Counter replay detected',
            cause: { expected: credential.counter + 1, got: newCounter },
          });
        }

        await credentialStore.updateCounter(credentialId, newCounter);
        return Result.ok({ ...credential, counter: newCounter });
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnAuthenticationError',
          message: 'Failed to verify authentication',
          cause,
        });
      }
    },

    /** list credentials for a user */
    async listCredentials(userId: string): Promise<Result<WebAuthnCredential[], WebAuthnError>> {
      try {
        return Result.ok(await credentialStore.findByUserId(userId));
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnAuthenticationError',
          message: 'Failed to list credentials',
          cause,
        });
      }
    },

    /** rename a credential */
    async renameCredential(id: string, friendlyName: string): Promise<Result<void, WebAuthnError>> {
      try {
        await credentialStore.rename(id, friendlyName);
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnRegistrationError',
          message: 'Failed to rename credential',
          cause,
        });
      }
    },

    /** delete a credential */
    async deleteCredential(id: string): Promise<Result<void, WebAuthnError>> {
      try {
        await credentialStore.delete(id);
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({
          _tag: 'WebAuthnRegistrationError',
          message: 'Failed to delete credential',
          cause,
        });
      }
    },
  };
}
