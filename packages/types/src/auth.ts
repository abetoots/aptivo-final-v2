/**
 * ID2-02: shared authentication types
 * @task ID2-02
 *
 * types shared across oidc, saml, and future identity adapters.
 * defines the common claim mapping interface that both oidc and saml
 * adapters use to map external identity claims to aptivo roles.
 */

import { z } from 'zod';

// -- claim mapping (shared between oidc + saml) --

/** mapping from an external identity attribute to an aptivo role */
export const ClaimMappingSchema = z.object({
  /** source attribute name in the external identity (e.g., idp group name) */
  sourceAttribute: z.string().min(1),
  /** target aptivo role name */
  targetRole: z.string().min(1),
});

export type ClaimMapping = z.infer<typeof ClaimMappingSchema>;

/** configuration for mapping external identity claims to aptivo roles */
export interface ClaimMappingConfig {
  /** list of attribute-to-role mappings */
  readonly mappings: ClaimMapping[];
  /** role assigned when no mapping matches */
  readonly defaultRole: string;
}

// -- saml types --

/** parsed saml assertion from an idp response */
export const SamlAssertionSchema = z.object({
  /** unique assertion id */
  assertionId: z.string().min(1),
  /** subject name id (user identifier) */
  nameId: z.string().min(1),
  /** name id format (e.g., email, persistent) */
  nameIdFormat: z.string().optional(),
  /** issuer entity id */
  issuer: z.string().min(1),
  /** assertion issue timestamp */
  issueInstant: z.string(),
  /** audience restriction */
  audience: z.string().optional(),
  /** user attributes from the idp */
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export type SamlAssertion = z.infer<typeof SamlAssertionSchema>;

/** saml adapter errors */
export type SamlError =
  | { readonly _tag: 'SamlNotConfigured'; readonly message: string }
  | { readonly _tag: 'SamlInitError'; readonly domain: string; readonly cause: unknown }
  | { readonly _tag: 'SamlCallbackError'; readonly message: string; readonly cause: unknown }
  | { readonly _tag: 'SamlMetadataError'; readonly cause: unknown };

/** result of a successful saml login */
export interface SamlLoginResult {
  /** parsed saml assertion */
  readonly assertion: SamlAssertion;
  /** relay state returned from idp */
  readonly relayState?: string;
}

/** saml service provider metadata */
export interface SamlMetadata {
  /** sp entity id */
  readonly entityId: string;
  /** assertion consumer service url */
  readonly acsUrl: string;
  /** sp certificate (base64 DER) */
  readonly certificate?: string;
}

/** saml adapter interface — implemented per provider */
export interface SamlAdapter {
  /** initiate saml login redirect for a domain */
  initiateLogin(domain: string): Promise<import('./result.js').Result<{ redirectUrl: string }, SamlError>>;
  /** handle saml callback/response from idp */
  handleCallback(samlResponse: string): Promise<import('./result.js').Result<SamlLoginResult, SamlError>>;
  /** get sp metadata for idp configuration */
  getMetadata(): import('./result.js').Result<SamlMetadata, SamlError>;
}
