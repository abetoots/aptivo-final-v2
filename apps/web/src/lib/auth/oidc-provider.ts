/**
 * ID2-01: OIDC provider configuration and claim mapping service
 * @task ID2-01
 *
 * manages oidc provider configs loaded from env and maps idp claims
 * (groups, sub, email) to aptivo roles via configurable group→role mappings.
 */

import { z } from 'zod';
import { Result } from '@aptivo/types';

// -- schemas --

export const OidcProviderConfigSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  // claim mapping: idp group name → aptivo role name
  groupToRoleMapping: z.record(z.string(), z.string()),
  // default role assigned when no group mapping matches
  defaultRole: z.string().default('user'),
  // domain patterns this provider handles (e.g., 'example.com')
  domains: z.array(z.string()).min(1),
});

export type OidcProviderConfig = z.infer<typeof OidcProviderConfigSchema>;

// -- errors --

export type OidcError =
  | { readonly _tag: 'OidcConfigError'; readonly message: string }
  | { readonly _tag: 'OidcProviderNotFound'; readonly domain: string }
  | { readonly _tag: 'OidcClaimMappingError'; readonly message: string };

// -- claim mapping --

export interface ClaimMapperDeps {
  providers: OidcProviderConfig[];
}

export interface IdpClaims {
  sub: string;
  email: string;
  name?: string;
  groups?: string[];
  [key: string]: unknown;
}

export interface MappedIdentity {
  externalId: string;
  email: string;
  name: string;
  roles: string[];
  providerId: string;
}

export function createClaimMapper(deps: ClaimMapperDeps) {
  return {
    // find the provider config for a given email domain
    findProviderByDomain(domain: string): Result<OidcProviderConfig, OidcError> {
      const provider = deps.providers.find((p) =>
        p.domains.some((d) => d.toLowerCase() === domain.toLowerCase()),
      );
      if (!provider) return Result.err({ _tag: 'OidcProviderNotFound', domain });
      return Result.ok(provider);
    },

    // map idp claims to aptivo roles using provider's group mapping
    mapClaims(
      claims: IdpClaims,
      provider: OidcProviderConfig,
    ): Result<MappedIdentity, OidcError> {
      // validate required identity fields from external idp
      if (!claims.sub || claims.sub.trim() === '') {
        return Result.err({ _tag: 'OidcClaimMappingError', message: 'Missing required claim: sub' });
      }
      if (!claims.email || claims.email.trim() === '') {
        return Result.err({ _tag: 'OidcClaimMappingError', message: 'Missing required claim: email' });
      }

      const groups = claims.groups ?? [];
      const mappedRoles = groups
        .map((g) => provider.groupToRoleMapping[g])
        .filter((r): r is string => r !== undefined);

      // if no groups mapped, use default role
      const roles = mappedRoles.length > 0 ? mappedRoles : [provider.defaultRole];
      // deduplicate
      const uniqueRoles = [...new Set(roles)];

      return Result.ok({
        externalId: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email,
        roles: uniqueRoles,
        providerId: provider.providerId,
      });
    },
  };
}

// -- provider registry loaded from env --

export function loadProvidersFromEnv(): Result<OidcProviderConfig[], OidcError> {
  const configJson = process.env.OIDC_PROVIDERS_CONFIG;
  if (!configJson) return Result.ok([]); // no providers configured

  try {
    const raw = JSON.parse(configJson);
    const configs = z.array(OidcProviderConfigSchema).parse(raw);
    return Result.ok(configs);
  } catch (cause) {
    return Result.err({
      _tag: 'OidcConfigError',
      message: `Failed to parse OIDC_PROVIDERS_CONFIG: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }
}
