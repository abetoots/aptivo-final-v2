/**
 * ID2-02: SAML adapter contract tests
 * @task ID2-02
 *
 * verifies the saml stub adapter returns SamlNotConfigured for all operations,
 * the shared claim mapping types work correctly, and the saml claim mapper
 * produces the same identity shape as the oidc mapper.
 */

import { describe, it, expect } from 'vitest';
import { Result, SamlAssertionSchema } from '@aptivo/types';
import type { SamlAdapter, SamlError, ClaimMapping } from '@aptivo/types';
import {
  createSamlStubAdapter,
  createSamlClaimMapper,
} from '../src/lib/auth/saml-adapter';

// ---------------------------------------------------------------------------
// stub adapter tests
// ---------------------------------------------------------------------------

describe('createSamlStubAdapter', () => {
  let adapter: SamlAdapter;

  beforeEach(() => {
    adapter = createSamlStubAdapter();
  });

  it('initiateLogin returns SamlNotConfigured error', async () => {
    const result = await adapter.initiateLogin('example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SamlNotConfigured');
      expect(result.error.message).toContain('SAML is not configured');
    }
  });

  it('handleCallback returns SamlNotConfigured error', async () => {
    const result = await adapter.handleCallback('<samlResponse/>');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SamlNotConfigured');
    }
  });

  it('getMetadata returns SamlNotConfigured error', () => {
    const result = adapter.getMetadata();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('SamlNotConfigured');
    }
  });

  it('satisfies the SamlAdapter interface', () => {
    // type check — if this compiles, the interface is satisfied
    const _adapter: SamlAdapter = createSamlStubAdapter();
    expect(_adapter).toBeDefined();
    expect(typeof _adapter.initiateLogin).toBe('function');
    expect(typeof _adapter.handleCallback).toBe('function');
    expect(typeof _adapter.getMetadata).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// saml assertion schema tests
// ---------------------------------------------------------------------------

describe('SamlAssertionSchema', () => {
  it('validates a valid saml assertion', () => {
    const valid = {
      assertionId: '_abc123',
      nameId: 'user@example.com',
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      issuer: 'https://idp.example.com',
      issueInstant: '2026-03-15T10:00:00Z',
      audience: 'https://aptivo.dev',
      attributes: {
        displayName: 'Jane Doe',
        groups: ['engineering', 'admins'],
      },
    };

    const result = SamlAssertionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates with minimal fields', () => {
    const minimal = {
      assertionId: '_min',
      nameId: 'user@test.com',
      issuer: 'https://idp.test.com',
      issueInstant: '2026-01-01T00:00:00Z',
      attributes: {},
    };

    const result = SamlAssertionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const invalid = {
      nameId: 'user@example.com',
      // missing assertionId, issuer, issueInstant, attributes
    };

    const result = SamlAssertionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts string or string[] attribute values', () => {
    const withArrayAttrs = {
      assertionId: '_arr',
      nameId: 'user@test.com',
      issuer: 'https://idp.test.com',
      issueInstant: '2026-01-01T00:00:00Z',
      attributes: {
        singleVal: 'one',
        multiVal: ['a', 'b', 'c'],
      },
    };

    const result = SamlAssertionSchema.safeParse(withArrayAttrs);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saml claim mapper tests
// ---------------------------------------------------------------------------

describe('createSamlClaimMapper', () => {
  const mapper = createSamlClaimMapper({
    groupAttribute: 'groups',
    groupToRoleMapping: {
      'okta-admins': 'admin',
      'engineering': 'user',
      'traders': 'trader',
    },
    defaultRole: 'viewer',
  });

  it('maps matching groups to roles', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'alice@example.com',
        attributes: {
          displayName: 'Alice Smith',
          groups: ['okta-admins', 'engineering'],
        },
      },
      'okta-provider',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['admin', 'user']);
      expect(result.value.email).toBe('alice@example.com');
      expect(result.value.name).toBe('Alice Smith');
      expect(result.value.providerId).toBe('okta-provider');
    }
  });

  it('uses default role when no groups match', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'bob@example.com',
        attributes: {
          groups: ['unknown-group'],
        },
      },
      'azure-provider',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['viewer']);
    }
  });

  it('uses default role when no groups attribute present', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'charlie@example.com',
        attributes: {},
      },
      'provider-1',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['viewer']);
    }
  });

  it('deduplicates roles', () => {
    const dupeMapper = createSamlClaimMapper({
      groupAttribute: 'memberOf',
      groupToRoleMapping: {
        'group-a': 'admin',
        'group-b': 'admin', // same role for different groups
      },
      defaultRole: 'user',
    });

    const result = dupeMapper.mapAssertion(
      {
        nameId: 'dupe@example.com',
        attributes: {
          memberOf: ['group-a', 'group-b'],
        },
      },
      'provider-2',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['admin']); // deduplicated
    }
  });

  it('handles single-string group attribute', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'single@example.com',
        attributes: {
          groups: 'engineering', // string, not array
        },
      },
      'provider-3',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['user']);
    }
  });

  it('falls back to nameId for name when displayName/cn not present', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'noname@example.com',
        attributes: {},
      },
      'provider-4',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('noname@example.com');
    }
  });

  it('uses cn attribute when displayName is not present', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'cn-user@example.com',
        attributes: {
          cn: 'CN User',
        },
      },
      'provider-5',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('CN User');
    }
  });

  it('handles displayName as string array', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'arr@example.com',
        attributes: {
          displayName: ['First Display', 'Second Display'],
          groups: ['engineering'],
        },
      },
      'provider-6',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('First Display');
    }
  });

  it('handles cn as string array', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'arr-cn@example.com',
        attributes: {
          cn: ['First CN', 'Second CN'],
        },
      },
      'provider-7',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('First CN');
    }
  });

  it('produces same identity shape as oidc claim mapper', () => {
    const result = mapper.mapAssertion(
      {
        nameId: 'parity@example.com',
        attributes: {
          displayName: 'Parity User',
          groups: ['engineering'],
        },
      },
      'parity-provider',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // same shape as oidc MappedIdentity
      expect(result.value).toEqual({
        externalId: 'parity@example.com',
        email: 'parity@example.com',
        name: 'Parity User',
        roles: ['user'],
        providerId: 'parity-provider',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// shared ClaimMapping type tests
// ---------------------------------------------------------------------------

describe('ClaimMapping type', () => {
  it('ClaimMappingSchema validates correct mapping', async () => {
    const { ClaimMappingSchema } = await import('@aptivo/types');
    const result = ClaimMappingSchema.safeParse({
      sourceAttribute: 'okta-admins',
      targetRole: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('ClaimMappingSchema rejects empty sourceAttribute', async () => {
    const { ClaimMappingSchema } = await import('@aptivo/types');
    const result = ClaimMappingSchema.safeParse({
      sourceAttribute: '',
      targetRole: 'admin',
    });
    expect(result.success).toBe(false);
  });
});
