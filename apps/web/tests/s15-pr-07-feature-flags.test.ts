/**
 * PR-07: Feature Flag Rollout Controls tests
 * @task PR-07
 *
 * verifies the env-based feature flag provider: env overrides, unknown
 * key filtering, malformed json handling, source annotations, risky flag
 * defaults, and admin endpoint wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveFeatureFlagProvider } from '../src/lib/feature-flags/flag-resolver';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const DEFAULT_FLAGS = [
  { key: 'multi-approver-hitl', enabled: true, description: 'enable multi-approver HITL v2 engine' },
  { key: 'llm-safety-pipeline', enabled: true, description: 'enable prompt injection + content filtering' },
  { key: 'burn-rate-alerting', enabled: true, description: 'enable burn-rate SLO alerts' },
  { key: 'smtp-fallback', enabled: false, description: 'enable SMTP notification fallback' },
  { key: 'workflow-crud', enabled: false, variant: 'beta', description: 'workflow definition CRUD API' },
];

// ---------------------------------------------------------------------------
// PR-07: env override changes flag enabled state
// ---------------------------------------------------------------------------

describe('PR-07: createEnvFlagProvider — env overrides', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('env override changes flag enabled state', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'smtp-fallback', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flag = await provider.getFlag('smtp-fallback');

    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(true);
  });

  it('env override changes variant', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'workflow-crud', enabled: true, variant: 'ga' },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flag = await provider.getFlag('workflow-crud');

    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(true);
    expect(flag!.variant).toBe('ga');
  });

  it('non-overridden flags retain defaults', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'smtp-fallback', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flag = await provider.getFlag('multi-approver-hitl');

    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(true);
  });

  it('env override with empty array preserves all defaults', async () => {
    process.env.FEATURE_FLAGS = '[]';

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlags();

    expect(flags).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// PR-07: unknown env flag key is ignored
// ---------------------------------------------------------------------------

describe('PR-07: createEnvFlagProvider — unknown keys', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('unknown env flag key is ignored', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'nonexistent-flag', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlags();

    // should only contain default keys
    expect(flags).toHaveLength(5);
    expect(flags.find((f) => f.key === 'nonexistent-flag')).toBeUndefined();
  });

  it('getFlag returns null for unknown key', async () => {
    process.env.FEATURE_FLAGS = '[]';

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flag = await provider.getFlag('totally-unknown');

    expect(flag).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PR-07: malformed JSON
// ---------------------------------------------------------------------------

describe('PR-07: createEnvFlagProvider — malformed JSON', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('malformed JSON uses defaults (no crash)', async () => {
    process.env.FEATURE_FLAGS = '{not valid json}';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlags();

    expect(flags).toHaveLength(5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid JSON'),
    );

    warnSpy.mockRestore();
  });

  it('non-array JSON uses defaults', async () => {
    process.env.FEATURE_FLAGS = '{"key": "value"}';

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlags();

    expect(flags).toHaveLength(5);
  });

  it('no FEATURE_FLAGS env var uses pure defaults', async () => {
    delete process.env.FEATURE_FLAGS;

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlags();

    expect(flags).toHaveLength(5);
    expect(flags.every((f) => f.key)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PR-07: getAllFlagsWithSource
// ---------------------------------------------------------------------------

describe('PR-07: createEnvFlagProvider — source annotations', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('getAllFlagsWithSource returns source annotations', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'smtp-fallback', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlagsWithSource();

    const smtpFlag = flags.find((f) => f.key === 'smtp-fallback');
    expect(smtpFlag).toBeDefined();
    expect(smtpFlag!.source).toBe('env');

    const hitlFlag = flags.find((f) => f.key === 'multi-approver-hitl');
    expect(hitlFlag).toBeDefined();
    expect(hitlFlag!.source).toBe('default');
  });

  it('all flags without env var have source "default"', async () => {
    delete process.env.FEATURE_FLAGS;

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlagsWithSource();

    expect(flags.every((f) => f.source === 'default')).toBe(true);
  });

  it('multiple env overrides are all marked as source env', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'smtp-fallback', enabled: true },
      { key: 'workflow-crud', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flags = await provider.getAllFlagsWithSource();

    const envFlags = flags.filter((f) => f.source === 'env');
    expect(envFlags).toHaveLength(2);
    expect(envFlags.map((f) => f.key).sort()).toEqual(['smtp-fallback', 'workflow-crud']);
  });
});

// ---------------------------------------------------------------------------
// PR-07: risky flags default to false
// ---------------------------------------------------------------------------

describe('PR-07: Risky flags deny-by-default', () => {
  it('workflow-crud defaults to disabled', async () => {
    const { createLocalFlagProvider, DEFAULT_FLAGS: defaultFlags } = await import(
      '../src/lib/feature-flags/local-provider'
    );

    const provider = createLocalFlagProvider(defaultFlags);
    const flag = await provider.getFlag('workflow-crud');

    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(false);
  });

  it('smtp-fallback defaults to disabled', async () => {
    const { createLocalFlagProvider, DEFAULT_FLAGS: defaultFlags } = await import(
      '../src/lib/feature-flags/local-provider'
    );

    const provider = createLocalFlagProvider(defaultFlags);
    const flag = await provider.getFlag('smtp-fallback');

    expect(flag).not.toBeNull();
    expect(flag!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-07: admin endpoint source verification
// ---------------------------------------------------------------------------

describe('PR-07: Admin Feature Flags Endpoint', () => {
  it('route file exists and handles GET', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/app/api/admin/feature-flags/route.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export async function GET');
    expect(source).toContain('platform/admin.view');
    expect(source).toContain('getFeatureFlagService');
  });

  it('composition root uses env provider when FEATURE_FLAGS is set', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('createEnvFlagProvider');
    expect(source).toContain('resolveFeatureFlagProvider');
  });
});

// ---------------------------------------------------------------------------
// PR-07: resolveFeatureFlagProvider — pure resolver
// ---------------------------------------------------------------------------

describe('PR-07: resolveFeatureFlagProvider', () => {
  it('returns env when FEATURE_FLAGS is set', () => {
    expect(resolveFeatureFlagProvider({ FEATURE_FLAGS: '[]' })).toBe('env');
  });

  it('returns local when FEATURE_FLAGS is not set', () => {
    expect(resolveFeatureFlagProvider({})).toBe('local');
  });

  it('returns env even when FEATURE_FLAGS is a non-empty string', () => {
    expect(
      resolveFeatureFlagProvider({ FEATURE_FLAGS: '[{"key":"test","enabled":true}]' }),
    ).toBe('env');
  });

  it('returns local when FEATURE_FLAGS is undefined', () => {
    expect(resolveFeatureFlagProvider({ FEATURE_FLAGS: undefined })).toBe('local');
  });
});
