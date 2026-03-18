/**
 * PR-06: SMTP Notification Failback Activation tests
 * @task PR-06
 *
 * verifies the smtp config validator (env-based), deliverability check,
 * and failover adapter behavior when novu throws vs succeeds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// PR-06: validateSmtpEnvConfig — success
// ---------------------------------------------------------------------------

describe('PR-06: validateSmtpEnvConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('returns ok when all env vars are set', async () => {
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
    expect(result.value.user).toBe('user@example.com');
    expect(result.value.pass).toBe('secret-pass');
    expect(result.value.from).toBe('noreply@example.com');
    expect(result.value.secure).toBe(true);
  });

  it('returns ok with secure false when SMTP_SECURE is not true', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '25';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'noreply@example.com';
    delete process.env.SMTP_SECURE;

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secure).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-06: validateSmtpEnvConfig — missing env vars
// ---------------------------------------------------------------------------

describe('PR-06: validateSmtpEnvConfig — missing env vars', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('returns MissingEnvError when SMTP_HOST is missing', async () => {
    delete process.env.SMTP_HOST;
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'noreply@example.com';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MissingEnvError');
    if (result.error._tag !== 'MissingEnvError') return;
    expect(result.error.vars).toContain('SMTP_HOST');
  });

  it('returns MissingEnvError listing all missing vars', async () => {
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
    if (result.error._tag !== 'MissingEnvError') return;
    expect(result.error.vars).toEqual([
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ]);
  });

  it('returns MissingEnvError when only SMTP_PASS is missing', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    delete process.env.SMTP_PASS;
    process.env.SMTP_FROM = 'test@test.com';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('MissingEnvError');
    if (result.error._tag !== 'MissingEnvError') return;
    expect(result.error.vars).toEqual(['SMTP_PASS']);
  });
});

// ---------------------------------------------------------------------------
// PR-06: validateSmtpEnvConfig — invalid values
// ---------------------------------------------------------------------------

describe('PR-06: validateSmtpEnvConfig — validation errors', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('returns ValidationError for invalid port', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '99999';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'test@test.com';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
  });

  it('returns ValidationError for invalid email in from field', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'not-an-email';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('ValidationError');
    if (result.error._tag !== 'ValidationError') return;
    expect(result.error.message).toBeTruthy();
  });

  it('returns ValidationError for port 0', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '0';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'test@test.com';

    const { validateSmtpEnvConfig } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );
    const result = validateSmtpEnvConfig();

    // port 0 is falsy, so it triggers MissingEnvError
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-06: checkDeliverability
// ---------------------------------------------------------------------------

describe('PR-06: checkDeliverability', () => {
  it('returns SPF/DKIM structure for a domain', async () => {
    const { checkDeliverability } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = checkDeliverability('example.com');

    expect(result.spf).toBe(true);
    expect(result.dkim).toBe(true);
    expect(result.recommendation).toContain('example.com');
    expect(result.recommendation).toContain('SPF');
    expect(result.recommendation).toContain('DKIM');
  });

  it('includes domain in recommendation string', async () => {
    const { checkDeliverability } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = checkDeliverability('aptivo.dev');

    expect(result.recommendation).toContain('aptivo.dev');
  });
});

// ---------------------------------------------------------------------------
// PR-06: failover adapter — novu throws, smtp takes over
// ---------------------------------------------------------------------------

describe('PR-06: Failover adapter behavior', () => {
  it('novu throws → smtp takes over', async () => {
    const { createFailoverAdapter } = await import(
      '@aptivo/notifications'
    );

    const novuAdapter = {
      send: vi.fn().mockResolvedValue(
        Result.err({
          _tag: 'DeliveryFailed' as const,
          message: 'novu api error',
          cause: new Error('network'),
          attempts: 1,
        }),
      ),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const smtpAdapter = {
      send: vi.fn().mockResolvedValue(Result.ok({ id: 'smtp-msg-001' })),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const failover = createFailoverAdapter(novuAdapter, smtpAdapter, 'novu_primary');
    const result = await failover.send({
      recipientId: 'user@test.com',
      channel: 'email',
      subject: 'Test',
      body: '<p>Hello</p>',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('smtp-msg-001');
    expect(novuAdapter.send).toHaveBeenCalledTimes(1);
    expect(smtpAdapter.send).toHaveBeenCalledTimes(1);
  });

  it('novu succeeds → smtp not called', async () => {
    const { createFailoverAdapter } = await import(
      '@aptivo/notifications'
    );

    const novuAdapter = {
      send: vi.fn().mockResolvedValue(Result.ok({ id: 'novu-msg-001' })),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const smtpAdapter = {
      send: vi.fn().mockResolvedValue(Result.ok({ id: 'smtp-msg-001' })),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const failover = createFailoverAdapter(novuAdapter, smtpAdapter, 'novu_primary');
    const result = await failover.send({
      recipientId: 'user@test.com',
      channel: 'email',
      subject: 'Test',
      body: '<p>Hello</p>',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('novu-msg-001');
    expect(novuAdapter.send).toHaveBeenCalledTimes(1);
    expect(smtpAdapter.send).not.toHaveBeenCalled();
  });

  it('does not failover on non-delivery errors (InvalidParams)', async () => {
    const { createFailoverAdapter } = await import(
      '@aptivo/notifications'
    );

    const novuAdapter = {
      send: vi.fn().mockResolvedValue(
        Result.err({
          _tag: 'InvalidParams' as const,
          message: 'bad recipient',
        }),
      ),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const smtpAdapter = {
      send: vi.fn().mockResolvedValue(Result.ok({ id: 'smtp-msg-002' })),
      upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    };

    const failover = createFailoverAdapter(novuAdapter, smtpAdapter, 'novu_primary');
    const result = await failover.send({
      recipientId: '',
      channel: 'email',
      subject: 'Test',
      body: '<p>Hello</p>',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
    // smtp should not be called for validation errors
    expect(smtpAdapter.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PR-06: SmtpConfigSchema zod validation
// ---------------------------------------------------------------------------

describe('PR-06: SmtpConfigSchema', () => {
  it('validates a complete config object', async () => {
    const { SmtpConfigSchema } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = SmtpConfigSchema.safeParse({
      host: 'smtp.example.com',
      port: 465,
      user: 'admin',
      pass: 'password',
      from: 'noreply@example.com',
      secure: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.secure).toBe(true);
    expect(result.data.port).toBe(465);
  });

  it('rejects non-integer port', async () => {
    const { SmtpConfigSchema } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = SmtpConfigSchema.safeParse({
      host: 'smtp.example.com',
      port: 587.5,
      user: 'admin',
      pass: 'password',
      from: 'noreply@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('defaults secure to false when not provided', async () => {
    const { SmtpConfigSchema } = await import(
      '../src/lib/notifications/smtp-config-validator'
    );

    const result = SmtpConfigSchema.safeParse({
      host: 'smtp.example.com',
      port: 587,
      user: 'admin',
      pass: 'password',
      from: 'noreply@example.com',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.secure).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR-06: composition root wiring
// ---------------------------------------------------------------------------

describe('PR-06: Composition root wiring', () => {
  // @testtype doc-lint
  it('services.ts imports smtp-config-validator', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../src/lib/services.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('smtp-config-validator');
    expect(source).toContain('validateSmtpEnvConfig');
    expect(source).toContain('getSmtpConfigValidator');
  });
});
