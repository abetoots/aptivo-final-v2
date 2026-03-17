/**
 * FEAT-03: Runtime Feature Flag Service tests
 * @task FEAT-03
 *
 * verifies feature flag evaluation, rule targeting, variant resolution,
 * and local provider behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  createFeatureFlagService,
} from '../src/lib/feature-flags/feature-flag-service';
import type {
  FeatureFlagProvider,
  FeatureFlag,
  FeatureFlagContext,
} from '../src/lib/feature-flags/feature-flag-service';
import {
  createLocalFlagProvider,
  DEFAULT_FLAGS,
} from '../src/lib/feature-flags/local-provider';

// ---------------------------------------------------------------------------
// test flags with rules
// ---------------------------------------------------------------------------

const testFlags: FeatureFlag[] = [
  {
    key: 'simple-on',
    enabled: true,
    description: 'always enabled flag',
  },
  {
    key: 'simple-off',
    enabled: false,
    description: 'always disabled flag',
  },
  {
    key: 'with-variant',
    enabled: true,
    variant: 'dark-mode',
    description: 'flag with a variant string',
  },
  {
    key: 'domain-targeted',
    enabled: false,
    rules: [
      {
        attribute: 'domain',
        operator: 'eq',
        value: 'crypto',
        result: { enabled: true, variant: 'crypto-only' },
      },
    ],
  },
  {
    key: 'user-blocklist',
    enabled: true,
    rules: [
      {
        attribute: 'userId',
        operator: 'in',
        value: ['blocked-user-1', 'blocked-user-2'],
        result: { enabled: false },
      },
    ],
  },
  {
    key: 'env-gated',
    enabled: false,
    rules: [
      {
        attribute: 'environment',
        operator: 'neq',
        value: 'production',
        result: { enabled: true },
      },
    ],
  },
  {
    key: 'role-restricted',
    enabled: false,
    rules: [
      {
        attribute: 'role',
        operator: 'not_in',
        value: ['guest', 'viewer'],
        result: { enabled: true, variant: 'full-access' },
      },
    ],
  },
  {
    key: 'multi-rule',
    enabled: false,
    rules: [
      {
        attribute: 'domain',
        operator: 'eq',
        value: 'hr',
        result: { enabled: true, variant: 'hr-variant' },
      },
      {
        attribute: 'domain',
        operator: 'eq',
        value: 'crypto',
        result: { enabled: true, variant: 'crypto-variant' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// local provider
// ---------------------------------------------------------------------------

describe('createLocalFlagProvider', () => {
  it('returns a flag by key', async () => {
    const provider = createLocalFlagProvider(testFlags);
    const flag = await provider.getFlag('simple-on');

    expect(flag).not.toBeNull();
    expect(flag!.key).toBe('simple-on');
    expect(flag!.enabled).toBe(true);
  });

  it('returns null for missing key', async () => {
    const provider = createLocalFlagProvider(testFlags);
    const flag = await provider.getFlag('non-existent');
    expect(flag).toBeNull();
  });

  it('returns all flags', async () => {
    const provider = createLocalFlagProvider(testFlags);
    const all = await provider.getAllFlags();
    expect(all).toHaveLength(testFlags.length);
  });

  it('returns empty array for empty flags', async () => {
    const provider = createLocalFlagProvider([]);
    const all = await provider.getAllFlags();
    expect(all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_FLAGS structure
// ---------------------------------------------------------------------------

describe('DEFAULT_FLAGS', () => {
  it('has the expected number of default flags', () => {
    expect(DEFAULT_FLAGS.length).toBeGreaterThanOrEqual(5);
  });

  it('each flag has a key and enabled field', () => {
    for (const flag of DEFAULT_FLAGS) {
      expect(flag.key).toBeDefined();
      expect(typeof flag.key).toBe('string');
      expect(typeof flag.enabled).toBe('boolean');
    }
  });

  it('contains the multi-approver-hitl flag', () => {
    const found = DEFAULT_FLAGS.find((f) => f.key === 'multi-approver-hitl');
    expect(found).toBeDefined();
    expect(found!.enabled).toBe(true);
  });

  it('contains the workflow-crud flag with beta variant', () => {
    const found = DEFAULT_FLAGS.find((f) => f.key === 'workflow-crud');
    expect(found).toBeDefined();
    expect(found!.enabled).toBe(false);
    expect(found!.variant).toBe('beta');
  });
});

// ---------------------------------------------------------------------------
// service: isEnabled
// ---------------------------------------------------------------------------

describe('createFeatureFlagService — isEnabled', () => {
  const provider = createLocalFlagProvider(testFlags);
  const service = createFeatureFlagService({ provider });

  it('returns true for an enabled flag', async () => {
    const result = await service.isEnabled('simple-on');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('returns false for a disabled flag', async () => {
    const result = await service.isEnabled('simple-off');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false);
  });

  it('returns FlagNotFound for missing flag', async () => {
    const result = await service.isEnabled('does-not-exist');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('FlagNotFound');
    expect(result.error.key).toBe('does-not-exist');
  });

  it('evaluates eq rule — matches', async () => {
    const result = await service.isEnabled('domain-targeted', { domain: 'crypto' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('evaluates eq rule — no match falls back to default', async () => {
    const result = await service.isEnabled('domain-targeted', { domain: 'hr' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false); // default is false
  });

  it('evaluates neq rule — matches', async () => {
    const result = await service.isEnabled('env-gated', { environment: 'staging' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('evaluates neq rule — no match falls back to default', async () => {
    const result = await service.isEnabled('env-gated', { environment: 'production' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false);
  });

  it('evaluates in rule — blocked user', async () => {
    const result = await service.isEnabled('user-blocklist', { userId: 'blocked-user-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false);
  });

  it('evaluates in rule — non-blocked user falls back to default', async () => {
    const result = await service.isEnabled('user-blocklist', { userId: 'regular-user' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true); // default is true
  });

  it('evaluates not_in rule — matches', async () => {
    const result = await service.isEnabled('role-restricted', {
      attributes: { role: 'admin' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('evaluates not_in rule — no match falls back to default', async () => {
    const result = await service.isEnabled('role-restricted', {
      attributes: { role: 'guest' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false); // default is false
  });

  it('evaluates rules with no context — uses default', async () => {
    const result = await service.isEnabled('domain-targeted');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false);
  });

  it('uses first matching rule in multi-rule flag', async () => {
    const result = await service.isEnabled('multi-rule', { domain: 'hr' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('returns ProviderError when provider throws', async () => {
    const failingProvider: FeatureFlagProvider = {
      async getFlag() { throw new Error('connection lost'); },
      async getAllFlags() { return []; },
    };
    const failService = createFeatureFlagService({ provider: failingProvider });
    const result = await failService.isEnabled('any-flag');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderError');
  });
});

// ---------------------------------------------------------------------------
// service: getVariant
// ---------------------------------------------------------------------------

describe('createFeatureFlagService — getVariant', () => {
  const provider = createLocalFlagProvider(testFlags);
  const service = createFeatureFlagService({ provider });

  it('returns variant string for flag with variant', async () => {
    const result = await service.getVariant('with-variant');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('dark-mode');
  });

  it('returns undefined for flag without variant', async () => {
    const result = await service.getVariant('simple-on');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeUndefined();
  });

  it('returns FlagNotFound for missing flag', async () => {
    const result = await service.getVariant('missing');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('FlagNotFound');
  });

  it('returns rule-based variant when rule matches', async () => {
    const result = await service.getVariant('domain-targeted', { domain: 'crypto' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('crypto-only');
  });

  it('returns rule-based variant from multi-rule', async () => {
    const result = await service.getVariant('multi-rule', { domain: 'crypto' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('crypto-variant');
  });

  it('returns ProviderError when provider throws', async () => {
    const failingProvider: FeatureFlagProvider = {
      async getFlag() { throw new Error('oops'); },
      async getAllFlags() { return []; },
    };
    const failService = createFeatureFlagService({ provider: failingProvider });
    const result = await failService.getVariant('any');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderError');
  });
});

// ---------------------------------------------------------------------------
// service: getAllFlags
// ---------------------------------------------------------------------------

describe('createFeatureFlagService — getAllFlags', () => {
  it('returns all flags from provider', async () => {
    const provider = createLocalFlagProvider(testFlags);
    const service = createFeatureFlagService({ provider });
    const result = await service.getAllFlags();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(testFlags.length);
  });

  it('returns empty array from empty provider', async () => {
    const provider = createLocalFlagProvider([]);
    const service = createFeatureFlagService({ provider });
    const result = await service.getAllFlags();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns ProviderError when provider throws', async () => {
    const failingProvider: FeatureFlagProvider = {
      async getFlag() { return null; },
      async getAllFlags() { throw new Error('db down'); },
    };
    const failService = createFeatureFlagService({ provider: failingProvider });
    const result = await failService.getAllFlags();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ProviderError');
  });
});

// ---------------------------------------------------------------------------
// context attributes resolution
// ---------------------------------------------------------------------------

describe('context attributes resolution', () => {
  const provider = createLocalFlagProvider(testFlags);
  const service = createFeatureFlagService({ provider });

  it('uses top-level context fields for rule evaluation', async () => {
    // domain is a top-level field on FeatureFlagContext
    const result = await service.isEnabled('domain-targeted', { domain: 'crypto' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('uses attributes map for custom fields', async () => {
    const result = await service.isEnabled('role-restricted', {
      attributes: { role: 'admin' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });

  it('attributes take precedence over top-level context fields', async () => {
    // if both attributes.domain and context.domain exist, attributes wins
    const flagWithAttrRule: FeatureFlag[] = [
      {
        key: 'attr-priority',
        enabled: false,
        rules: [
          {
            attribute: 'domain',
            operator: 'eq',
            value: 'override',
            result: { enabled: true },
          },
        ],
      },
    ];
    const p = createLocalFlagProvider(flagWithAttrRule);
    const s = createFeatureFlagService({ provider: p });

    const result = await s.isEnabled('attr-priority', {
      domain: 'crypto',
      attributes: { domain: 'override' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// custom flags override defaults
// ---------------------------------------------------------------------------

describe('custom flags with local provider', () => {
  it('custom flags override defaults when using separate provider', async () => {
    const custom: FeatureFlag[] = [
      { key: 'smtp-fallback', enabled: true, description: 'overridden to enabled' },
    ];
    const provider = createLocalFlagProvider(custom);
    const service = createFeatureFlagService({ provider });

    const result = await service.isEnabled('smtp-fallback');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(true); // overridden from default false
  });

  it('default provider has smtp-fallback disabled', async () => {
    const provider = createLocalFlagProvider(DEFAULT_FLAGS);
    const service = createFeatureFlagService({ provider });

    const result = await service.isEnabled('smtp-fallback');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(false);
  });
});
