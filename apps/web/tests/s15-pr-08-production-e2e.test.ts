/**
 * PR-08: Production E2E Validation tests
 * @task PR-08
 *
 * validates the full infrastructure wiring across all sprint 15 subsystems.
 * uses real service implementations where possible, in-memory where
 * infrastructure is unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { resolveMfaClient } from '../src/lib/auth/mfa-client-resolver';
import { resolveSessionRedisConfig, resolveJobsRedisConfig } from '../src/lib/redis/redis-resolver';

// ---------------------------------------------------------------------------
// 1. connection resolution
// ---------------------------------------------------------------------------

describe('PR-08: Connection Resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('resolveConnectionConfig prefers DATABASE_URL_HA', async () => {
    process.env.DATABASE_URL_HA = 'postgresql://ha-primary:5432/aptivo';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/aptivo';

    const { resolveConnectionConfig } = await import(
      '../src/lib/db/connection-manager'
    );

    const result = resolveConnectionConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('postgresql://ha-primary:5432/aptivo');
    expect(result.value.isHa).toBe(true);
  });

  it('resolveConnectionConfig falls back to DATABASE_URL', async () => {
    delete process.env.DATABASE_URL_HA;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/aptivo';

    const { resolveConnectionConfig } = await import(
      '../src/lib/db/connection-manager'
    );

    const result = resolveConnectionConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('postgresql://localhost:5432/aptivo');
    expect(result.value.isHa).toBe(false);
  });

  it('missing both URLs returns NoUrlError', async () => {
    delete process.env.DATABASE_URL_HA;
    delete process.env.DATABASE_URL;

    const { resolveConnectionConfig } = await import(
      '../src/lib/db/connection-manager'
    );

    const result = resolveConnectionConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('NoUrlError');
  });
});

// ---------------------------------------------------------------------------
// 2. mfa client resolution
// ---------------------------------------------------------------------------

describe('PR-08: MFA Client Resolution', () => {
  it('real client has _isStub: false', async () => {
    const { createSupabaseMfaClient } = await import(
      '../src/lib/auth/supabase-mfa-client'
    );

    const mockAuth = {
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn(),
      },
    };

    const client = createSupabaseMfaClient(mockAuth);
    expect(client._isStub).toBe(false);
  });

  it('stub client has _isStub: true', async () => {
    const { createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const stub = createMfaStubClient();
    expect(stub._isStub).toBe(true);
  });

  it('production without supabase URL returns error resolution', () => {
    // use the extracted resolver instead of inline replica
    const resolution = resolveMfaClient({ NODE_ENV: 'production' });
    expect(resolution.type).toBe('error');
    if (resolution.type === 'error') {
      expect(resolution.message).toContain('NEXT_PUBLIC_SUPABASE_URL is required in production');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. redis split verification
// ---------------------------------------------------------------------------

describe('PR-08: Redis Split Verification', () => {
  // use the extracted resolvers instead of inline replicas

  it('session and jobs use different URLs when split', () => {
    const env = {
      UPSTASH_REDIS_SESSION_URL: 'https://session.upstash.io',
      UPSTASH_REDIS_JOBS_URL: 'https://jobs.upstash.io',
    };

    const sessionConfig = resolveSessionRedisConfig(env);
    const jobsConfig = resolveJobsRedisConfig(env);

    expect(sessionConfig).not.toBeNull();
    expect(jobsConfig).not.toBeNull();
    expect(sessionConfig!.url).toBe('https://session.upstash.io');
    expect(jobsConfig!.url).toBe('https://jobs.upstash.io');
    expect(sessionConfig!.url).not.toBe(jobsConfig!.url);
  });

  it('single URL backward compat', () => {
    const env = {
      UPSTASH_REDIS_URL: 'https://shared.upstash.io',
    };

    const sessionConfig = resolveSessionRedisConfig(env);
    const jobsConfig = resolveJobsRedisConfig(env);

    expect(sessionConfig).not.toBeNull();
    expect(jobsConfig).not.toBeNull();
    expect(sessionConfig!.url).toBe('https://shared.upstash.io');
    expect(jobsConfig!.url).toBe('https://shared.upstash.io');
  });

  // @testtype doc-lint
  it('token blacklist uses session redis', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    const blacklistSection = source.slice(
      source.indexOf('getTokenBlacklist'),
      source.indexOf('getTokenBlacklist') + 200,
    );
    expect(blacklistSection).toContain('getSessionRedis()');
  });
});

// ---------------------------------------------------------------------------
// 4. smtp config validation
// ---------------------------------------------------------------------------

describe('PR-08: SMTP Config Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('valid SMTP config returns ok', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret-pass';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.SMTP_SECURE = 'true';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.host).toBe('smtp.example.com');
    expect(result.value.port).toBe(587);
  });

  it('missing SMTP vars returns MissingEnvError', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MissingEnvError');
    expect(result.error.vars.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. feature flag rollout
// ---------------------------------------------------------------------------

describe('PR-08: Feature Flag Rollout', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('env override applied to known flag', async () => {
    process.env.FEATURE_FLAGS = JSON.stringify([
      { key: 'smtp-fallback', enabled: true },
    ]);

    const { createEnvFlagProvider } = await import(
      '../src/lib/feature-flags/env-provider'
    );
    const { DEFAULT_FLAGS } = await import(
      '../src/lib/feature-flags/local-provider'
    );

    const provider = createEnvFlagProvider(DEFAULT_FLAGS);
    const flag = await provider.getFlag('smtp-fallback');

    expect(flag!.enabled).toBe(true);
  });

  it('risky flags deny-by-default', async () => {
    const { createLocalFlagProvider, DEFAULT_FLAGS } = await import(
      '../src/lib/feature-flags/local-provider'
    );

    const provider = createLocalFlagProvider(DEFAULT_FLAGS);

    const wf = await provider.getFlag('workflow-crud');
    const smtp = await provider.getFlag('smtp-fallback');

    expect(wf!.enabled).toBe(false);
    expect(smtp!.enabled).toBe(false);
  });

  // @testtype doc-lint
  it('admin endpoint file exists with correct structure', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/app/api/admin/feature-flags/route.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('export async function GET');
    expect(source).toContain('platform/admin.view');
  });
});

// ---------------------------------------------------------------------------
// 6. streaming content filter
// ---------------------------------------------------------------------------

describe('PR-08: Streaming Content Filter', () => {
  it('clean stream passes', async () => {
    const { createStreamingContentFilter } = await import('@aptivo/llm-gateway');

    const filterFn = vi.fn().mockImplementation(() =>
      Result.ok({ allowed: true }),
    );

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 50,
      evaluateEveryChunks: 3,
    });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(filter.processChunk(`clean-${i} `, 'core'));
    }

    expect(results.every((r) => r.action === 'pass')).toBe(true);
  });

  it('harmful stream killed at threshold', async () => {
    const { createStreamingContentFilter } = await import('@aptivo/llm-gateway');

    const filterFn = vi.fn().mockImplementation((content: string) => {
      if (content.includes('TOXIC')) {
        return Result.ok({ allowed: false, reason: 'toxic content detected' });
      }
      return Result.ok({ allowed: true });
    });

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 10,
      evaluateEveryChunks: 1,
    });

    const r1 = filter.processChunk('safe text ', 'hr');
    expect(r1.action).toBe('pass');

    const r2 = filter.processChunk('TOXIC payload', 'hr');
    expect(r2.action).toBe('kill');
  });
});

// ---------------------------------------------------------------------------
// 7. pool config
// ---------------------------------------------------------------------------

describe('PR-08: Pool Config', () => {
  it('domain pool isolation', async () => {
    const { getPoolOptionsForDomain } = await import(
      '../../../packages/database/src/pool-config'
    );

    const crypto = getPoolOptionsForDomain('crypto');
    const platform = getPoolOptionsForDomain('platform');

    expect(crypto.max).toBe(10);
    expect(platform.max).toBe(20);
    expect(crypto.max).not.toBe(platform.max);
  });

  it('pool stats correct', async () => {
    const { getPoolStats } = await import(
      '../../../packages/database/src/pool-config'
    );

    const stats = getPoolStats(['crypto', 'hr', 'platform']);

    expect(stats.crypto.max).toBe(10);
    expect(stats.hr.max).toBe(10);
    expect(stats.platform.max).toBe(20);
    expect(stats.platform.idleTimeoutMs).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// 8. full golden path simulation
// ---------------------------------------------------------------------------

describe('PR-08: Full Golden Path Simulation', () => {
  it('auth → mfa → hitl → llm safety → workflow lifecycle', async () => {
    // step 1: auth — verify mfa enforcement creates proper middleware
    const { createMfaEnforcement, createMfaStubClient } = await import(
      '../src/lib/auth/mfa-enforcement'
    );

    const enforcement = createMfaEnforcement();

    // non-sensitive op passes without mfa
    expect(enforcement.requireMfa('workflow.read', undefined)).toBeNull();

    // sensitive op without aal2 returns 403
    const mfaResponse = enforcement.requireMfa('platform/admin.view', 'aal1');
    expect(mfaResponse).not.toBeNull();
    expect(mfaResponse!.status).toBe(403);

    // sensitive op with aal2 passes
    expect(enforcement.requireMfa('platform/admin.view', 'aal2')).toBeNull();

    // step 2: mfa stub — verify stub works in test
    const stubClient = createMfaStubClient();
    const enrollResult = await stubClient.enroll({ factorType: 'totp' });
    expect(enrollResult.ok).toBe(true);

    // step 3: feature flags — verify flag gating
    const { createLocalFlagProvider, DEFAULT_FLAGS } = await import(
      '../src/lib/feature-flags/local-provider'
    );
    const { createFeatureFlagService } = await import(
      '../src/lib/feature-flags/feature-flag-service'
    );

    const flagService = createFeatureFlagService({
      provider: createLocalFlagProvider(DEFAULT_FLAGS),
    });

    const wfEnabled = await flagService.isEnabled('workflow-crud');
    expect(wfEnabled.ok).toBe(true);
    if (wfEnabled.ok) expect(wfEnabled.value).toBe(false); // risky flag off

    const safetyEnabled = await flagService.isEnabled('llm-safety-pipeline');
    expect(safetyEnabled.ok).toBe(true);
    if (safetyEnabled.ok) expect(safetyEnabled.value).toBe(true);

    // step 4: streaming filter — verify clean pass
    const { createStreamingContentFilter } = await import('@aptivo/llm-gateway');

    const filter = createStreamingContentFilter({
      filterResponse: vi.fn().mockImplementation(() => Result.ok({ allowed: true })),
      evaluateEveryChars: 100,
      evaluateEveryChunks: 5,
    });

    const chunkResult = filter.processChunk('safe output', 'core');
    expect(chunkResult.action).toBe('pass');
  });

  it('feature flag gates feature access', async () => {
    const { createLocalFlagProvider, DEFAULT_FLAGS } = await import(
      '../src/lib/feature-flags/local-provider'
    );
    const { createFeatureFlagService } = await import(
      '../src/lib/feature-flags/feature-flag-service'
    );

    const flagService = createFeatureFlagService({
      provider: createLocalFlagProvider(DEFAULT_FLAGS),
    });

    // simulate feature gate check before allowing workflow CRUD
    const crudFlag = await flagService.isEnabled('workflow-crud');
    expect(crudFlag.ok).toBe(true);

    // workflow-crud is deny-by-default so flag should be disabled
    if (crudFlag.ok) {
      expect(crudFlag.value).toBe(false);
    }

    // verify variant for gated features
    const variant = await flagService.getVariant('workflow-crud');
    expect(variant.ok).toBe(true);
    if (variant.ok) expect(variant.value).toBe('beta');
  });
});
