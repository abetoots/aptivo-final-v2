/**
 * INF-01: webauthn credential drizzle adapter
 * @task INF-01
 *
 * provides drizzle-backed implementation of WebAuthnCredentialStore
 * for passkey/webauthn credential persistence.
 */

import { eq, lt, and } from 'drizzle-orm';
import type { DrizzleClient } from './types.js';
import { webauthnCredentials } from '../schema/user-roles.js';

// -- types --

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

export interface WebAuthnCredentialStore {
  findByUserId(userId: string): Promise<WebAuthnCredential[]>;
  findByCredentialId(credentialId: string): Promise<WebAuthnCredential | null>;
  create(credential: Omit<WebAuthnCredential, 'id' | 'createdAt'>): Promise<WebAuthnCredential>;
  updateCounter(credentialId: string, counter: number): Promise<void>;
  delete(id: string): Promise<void>;
  rename(id: string, friendlyName: string): Promise<void>;
}

// -- row mapper --

function mapRow(r: typeof webauthnCredentials.$inferSelect): WebAuthnCredential {
  return {
    id: r.id,
    credentialId: r.credentialId,
    userId: r.userId,
    publicKey: r.publicKey,
    counter: r.counter,
    transports: r.transports ?? undefined,
    friendlyName: r.friendlyName ?? undefined,
    createdAt: r.createdAt,
  };
}

// -- factory --

export function createDrizzleWebAuthnStore(db: DrizzleClient): WebAuthnCredentialStore {
  return {
    async findByUserId(userId) {
      const rows = await db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, userId));
      return rows.map(mapRow);
    },

    async findByCredentialId(credentialId) {
      const rows = await db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.credentialId, credentialId))
        .limit(1);
      if (rows.length === 0) return null;
      return mapRow(rows[0]!);
    },

    async create(credential) {
      const rows = await db
        .insert(webauthnCredentials)
        .values({
          userId: credential.userId,
          credentialId: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports,
          friendlyName: credential.friendlyName,
        })
        .returning();
      return mapRow(rows[0]!);
    },

    async updateCounter(credentialId, counter) {
      // conditional update: only succeeds if new counter > stored counter (TOCTOU safe)
      const result = await db
        .update(webauthnCredentials)
        .set({ counter })
        .where(and(
          eq(webauthnCredentials.credentialId, credentialId),
          lt(webauthnCredentials.counter, counter),
        ))
        .returning({ id: webauthnCredentials.id });
      if (result.length === 0) {
        throw new Error(`counter update failed for credential ${credentialId}: stale or missing`);
      }
    },

    async delete(id) {
      await db
        .delete(webauthnCredentials)
        .where(eq(webauthnCredentials.id, id));
    },

    async rename(id, friendlyName) {
      await db
        .update(webauthnCredentials)
        .set({ friendlyName })
        .where(eq(webauthnCredentials.id, id));
    },
  };
}
