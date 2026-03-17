/**
 * NOTIF2-01: SMTP fallback for HITL notifications
 * @task NOTIF2-01
 *
 * tests:
 * - smtp adapter send success returns message id
 * - smtp adapter send failure returns DeliveryFailed
 * - smtp adapter rejected recipients returns DeliveryFailed
 * - smtp adapter upsertSubscriber is a no-op
 * - smtp adapter send with missing recipientId returns InvalidParams
 * - failover adapter: primary succeeds → returns primary result
 * - failover adapter: primary DeliveryFailed → tries secondary
 * - failover adapter: secondary also fails → returns secondary error
 * - failover adapter: primary non-delivery error → does NOT try secondary
 * - failover adapter: single policy → no fallback attempt
 * - failover adapter: smtp_primary policy → smtp called first
 * - failover adapter: novu_primary policy → novu called first
 * - failover adapter: upsertSubscriber delegates to primary only
 * - smtp config validation: missing host
 * - smtp config validation: invalid port
 * - smtp config validation: missing user
 * - smtp config validation: missing pass
 * - smtp config validation: missing from
 * - smtp config validation: valid config with secure default
 * - smtp config validation: port 465 defaults to secure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';
import { createSmtpAdapter, validateSmtpConfig } from '../../packages/notifications/src/adapters/smtp-adapter.js';
import { createFailoverAdapter } from '../../packages/notifications/src/adapters/failover-adapter.js';
import type {
  NotificationAdapter,
  AdapterSendParams,
  NotificationError,
} from '../../packages/notifications/src/types.js';
import type { MailTransport, SmtpConfig } from '../../packages/notifications/src/adapters/smtp-adapter.js';
import type { FailoverPolicy } from '../../packages/notifications/src/adapters/failover-adapter.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VALID_CONFIG: SmtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  pass: 'secret',
  from: 'noreply@example.com',
  secure: false,
};

const VALID_SEND_PARAMS: AdapterSendParams = {
  recipientId: 'user@test.com',
  channel: 'email',
  subject: 'Test Subject',
  body: '<p>Hello world</p>',
  transactionId: 'txn-001',
};

function createMockTransport(overrides?: Partial<MailTransport>): MailTransport {
  return {
    sendMail: vi.fn().mockResolvedValue({
      messageId: '<msg-001@example.com>',
      accepted: ['user@test.com'],
      rejected: [],
    }),
    ...overrides,
  };
}

function createMockAdapter(overrides?: Partial<NotificationAdapter>): NotificationAdapter {
  return {
    send: vi.fn().mockResolvedValue(Result.ok({ id: 'mock-id-001' })),
    upsertSubscriber: vi.fn().mockResolvedValue(Result.ok(undefined)),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// smtp adapter tests
// ---------------------------------------------------------------------------

describe('SmtpAdapter', () => {
  let transport: MailTransport;

  beforeEach(() => {
    transport = createMockTransport();
  });

  it('returns Result.ok with messageId on successful send', async () => {
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('<msg-001@example.com>');
  });

  it('passes correct mail options to transport', async () => {
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    await adapter.send(VALID_SEND_PARAMS);

    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@test.com',
      subject: 'Test Subject',
      html: '<p>Hello world</p>',
    });
  });

  it('returns DeliveryFailed when transport throws', async () => {
    transport = createMockTransport({
      sendMail: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    if (result.error._tag !== 'DeliveryFailed') return;
    expect(result.error.message).toBe('connection refused');
    expect(result.error.attempts).toBe(1);
  });

  it('returns DeliveryFailed when all recipients are rejected', async () => {
    transport = createMockTransport({
      sendMail: vi.fn().mockResolvedValue({
        messageId: '<msg-002@example.com>',
        accepted: [],
        rejected: ['user@test.com'],
      }),
    });
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    if (result.error._tag !== 'DeliveryFailed') return;
    expect(result.error.message).toContain('rejected');
  });

  it('returns InvalidParams when recipientId is empty', async () => {
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.send({ ...VALID_SEND_PARAMS, recipientId: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
  });

  it('upsertSubscriber is a no-op returning Result.ok', async () => {
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.upsertSubscriber('user-1', { email: 'a@b.com', name: 'Alice' });

    expect(result.ok).toBe(true);
    // transport should not be called
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('handles non-Error throw from transport', async () => {
    transport = createMockTransport({
      sendMail: vi.fn().mockRejectedValue('raw string error'),
    });
    const adapter = createSmtpAdapter(transport, VALID_CONFIG);
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    if (result.error._tag !== 'DeliveryFailed') return;
    expect(result.error.message).toBe('unknown smtp delivery error');
  });
});

// ---------------------------------------------------------------------------
// smtp config validation tests
// ---------------------------------------------------------------------------

describe('validateSmtpConfig', () => {
  it('returns ok for valid config', () => {
    const result = validateSmtpConfig(VALID_CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.host).toBe('smtp.example.com');
    expect(result.value.secure).toBe(false);
  });

  it('rejects missing host', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, host: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('host');
  });

  it('rejects invalid port (0)', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, port: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('port');
  });

  it('rejects port above 65535', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, port: 70000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('port');
  });

  it('rejects missing user', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, user: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('user');
  });

  it('rejects missing pass', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, pass: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('pass');
  });

  it('rejects missing from address', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, from: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('from');
  });

  it('defaults secure to true when port is 465', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, port: 465, secure: undefined });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secure).toBe(true);
  });

  it('defaults secure to false when port is not 465', () => {
    const result = validateSmtpConfig({ ...VALID_CONFIG, port: 587, secure: undefined });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secure).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// failover adapter tests
// ---------------------------------------------------------------------------

describe('FailoverAdapter', () => {
  let primary: NotificationAdapter;
  let secondary: NotificationAdapter;

  beforeEach(() => {
    primary = createMockAdapter();
    secondary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.ok({ id: 'secondary-id-001' })),
    });
  });

  it('returns primary result when primary succeeds', async () => {
    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('mock-id-001');
    expect(secondary.send).not.toHaveBeenCalled();
  });

  it('tries secondary when primary returns DeliveryFailed', async () => {
    primary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'novu timeout',
        cause: new Error('timeout'),
        attempts: 1,
      })),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('secondary-id-001');
    expect(secondary.send).toHaveBeenCalledWith(VALID_SEND_PARAMS);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('notification failover'),
    );

    warnSpy.mockRestore();
  });

  it('returns secondary error when both primary and secondary fail', async () => {
    primary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'novu down',
        cause: new Error('down'),
        attempts: 1,
      })),
    });
    secondary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'smtp also down',
        cause: new Error('also down'),
        attempts: 1,
      })),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    if (result.error._tag !== 'DeliveryFailed') return;
    expect(result.error.message).toBe('smtp also down');

    vi.restoreAllMocks();
  });

  it('does NOT try secondary on non-DeliveryFailed error', async () => {
    primary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'InvalidParams' as const,
        message: 'bad input',
      })),
    });

    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('InvalidParams');
    expect(secondary.send).not.toHaveBeenCalled();
  });

  it('does NOT try secondary on RecipientOptedOut error', async () => {
    primary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'RecipientOptedOut' as const,
        recipientId: 'user-1',
        channel: 'email',
      })),
    });

    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('RecipientOptedOut');
    expect(secondary.send).not.toHaveBeenCalled();
  });

  it('single policy skips failover entirely', async () => {
    primary = createMockAdapter({
      send: vi.fn().mockResolvedValue(Result.err({
        _tag: 'DeliveryFailed' as const,
        message: 'primary failed',
        cause: new Error('fail'),
        attempts: 1,
      })),
    });

    const adapter = createFailoverAdapter(primary, secondary, 'single');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe('DeliveryFailed');
    expect(secondary.send).not.toHaveBeenCalled();
  });

  it('smtp_primary policy calls smtp first', async () => {
    const smtpSend = vi.fn().mockResolvedValue(Result.ok({ id: 'smtp-id' }));
    const novuSend = vi.fn().mockResolvedValue(Result.ok({ id: 'novu-id' }));

    const smtp = createMockAdapter({ send: smtpSend });
    const novu = createMockAdapter({ send: novuSend });

    // smtp is primary, novu is secondary
    const adapter = createFailoverAdapter(smtp, novu, 'smtp_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('smtp-id');
    expect(smtpSend).toHaveBeenCalledTimes(1);
    expect(novuSend).not.toHaveBeenCalled();
  });

  it('novu_primary policy calls novu first', async () => {
    const novuSend = vi.fn().mockResolvedValue(Result.ok({ id: 'novu-id' }));
    const smtpSend = vi.fn().mockResolvedValue(Result.ok({ id: 'smtp-id' }));

    const novu = createMockAdapter({ send: novuSend });
    const smtp = createMockAdapter({ send: smtpSend });

    // novu is primary, smtp is secondary
    const adapter = createFailoverAdapter(novu, smtp, 'novu_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('novu-id');
    expect(novuSend).toHaveBeenCalledTimes(1);
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it('upsertSubscriber delegates to primary only', async () => {
    const adapter = createFailoverAdapter(primary, secondary, 'novu_primary');
    const result = await adapter.upsertSubscriber('user-1', { email: 'a@b.com' });

    expect(result.ok).toBe(true);
    expect(primary.upsertSubscriber).toHaveBeenCalledWith('user-1', { email: 'a@b.com' });
    expect(secondary.upsertSubscriber).not.toHaveBeenCalled();
  });

  it('smtp_primary failover falls back to novu on smtp failure', async () => {
    const smtpSend = vi.fn().mockResolvedValue(Result.err({
      _tag: 'DeliveryFailed' as const,
      message: 'smtp error',
      cause: new Error('smtp fail'),
      attempts: 1,
    }));
    const novuSend = vi.fn().mockResolvedValue(Result.ok({ id: 'novu-fallback' }));

    const smtp = createMockAdapter({ send: smtpSend });
    const novu = createMockAdapter({ send: novuSend });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = createFailoverAdapter(smtp, novu, 'smtp_primary');
    const result = await adapter.send(VALID_SEND_PARAMS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('novu-fallback');
    expect(smtpSend).toHaveBeenCalledTimes(1);
    expect(novuSend).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});
