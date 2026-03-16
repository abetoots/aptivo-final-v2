/**
 * ID2-01: Just-in-time user provisioning for first OIDC login
 * @task ID2-01
 *
 * provisions users on first federated login. checks by external id first,
 * then email (to link existing accounts), and finally creates a new user
 * with idp-mapped roles.
 */

import { Result } from '@aptivo/types';
import type { MappedIdentity } from './oidc-provider.js';

// -- types --

export type JitError =
  | { readonly _tag: 'JitProvisioningError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'JitUserExists'; readonly userId: string };

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  externalId: string;
  providerId: string;
}

// store interface — decoupled from drizzle
export interface JitUserStore {
  findByExternalId(externalId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  createUser(user: Omit<UserRecord, 'id'>): Promise<UserRecord>;
  assignRoles(userId: string, roles: string[], grantedBy: string): Promise<void>;
  // links an external identity to an existing user (account linking)
  linkExternalId(userId: string, externalId: string, providerId: string): Promise<void>;
}

export interface JitProvisioningDeps {
  userStore: JitUserStore;
  systemUserId: string; // the "system" user id for grantedBy on auto-assigned roles
}

export function createJitProvisioner(deps: JitProvisioningDeps) {
  return {
    async provision(identity: MappedIdentity): Promise<Result<UserRecord, JitError>> {
      try {
        // check if user already exists by external id
        const existing = await deps.userStore.findByExternalId(identity.externalId);
        if (existing) {
          return Result.ok(existing); // already provisioned
        }

        // check by email (user may exist from magic link, now linking oidc)
        const byEmail = await deps.userStore.findByEmail(identity.email);
        if (byEmail) {
          // link external identity to existing account
          await deps.userStore.linkExternalId(byEmail.id, identity.externalId, identity.providerId);
          // assign idp-mapped roles to the linked account
          await deps.userStore.assignRoles(byEmail.id, identity.roles, deps.systemUserId);
          return Result.ok({ ...byEmail, externalId: identity.externalId, providerId: identity.providerId });
        }

        // create new user
        const user = await deps.userStore.createUser({
          email: identity.email,
          name: identity.name,
          externalId: identity.externalId,
          providerId: identity.providerId,
        });

        // assign mapped roles
        await deps.userStore.assignRoles(user.id, identity.roles, deps.systemUserId);

        return Result.ok(user);
      } catch (cause) {
        return Result.err({
          _tag: 'JitProvisioningError',
          message: `Failed to provision user ${identity.email}`,
          cause,
        });
      }
    },
  };
}
